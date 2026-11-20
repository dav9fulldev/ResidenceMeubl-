const crypto = require('crypto');
const { buildPayloadString, generateQrCodeSvg } = require('@pi-spi/qrcode');
const db = require('../../db');
const Tenant = require('../Tenant');
// Module financier : chargé à la demande (évite une dépendance circulaire)
const finance = () => require('../finance');
const PiSpi = require('./PiSpiClient');
const GeniusPay = require('./GeniusPayClient');
const acompte = require('./acompte');

// Adresse publique du site (retour du client après la page de paiement GeniusPay)
const urlSite = () => {
  const liste = String(process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
  return (liste.find(u => u.startsWith('https://')) || liste[0] || 'http://localhost:3000').replace(/\/+$/, '');
};
const STATUTS_ECHEC_GENIUSPAY = { failed: 'Paiement refusé.', cancelled: 'Paiement annulé.' };

/**
 * Paiement de l'acompte via PI-SPI.
 *
 * Deux méthodes (au choix du client) :
 *  - « qr »      : QR Code dynamique (SDK officiel @pi-spi/qrcode), referenceLabel = txId
 *  - « demande » : demande de paiement e-commerce (catégorie 521) vers son adresse de paiement
 *
 * Dans les deux cas, le paiement est vérifié par GET /paiements-recus/{txId} et n'est
 * considéré comme acquis qu'au statut IRREVOCABLE. Le webhook PAIEMENT_RECU ne sert que de
 * déclencheur : on relit toujours le statut via l'API avant de valider.
 */

// Codes de rejet ISO 20022 les plus courants → message client
const RAISONS = {
  BE23: 'Adresse de paiement inconnue. Vérifiez-la dans l\'application de votre banque.',
  AB05: 'Le délai pour valider le paiement est dépassé.',
  AM04: 'Solde insuffisant.',
  DU03: 'Cette demande a déjà été envoyée.',
};
const messageRaison = (code) => RAISONS[code] || (code ? `Paiement refusé (code ${code}).` : 'Paiement refusé.');


// Nettoie une adresse de paiement saisie ou collée : espaces, tirets typographiques (iOS),
// majuscules ; accepte aussi 32 caractères sans tirets.
const normaliserAlias = (valeur) => {
  const brut = String(valeur || '').toLowerCase().replace(/[‐-―−﹘﹣－]/g, '-').replace(/[^0-9a-f-]/g, '');
  const hex = brut.replace(/-/g, '');
  return hex.length === 32 ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : brut;
};


class ErreurPaiement extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const derniereVerification = new Map(); // txId → horodatage (limite les appels à PI-SPI)

class PaymentService {
  constructor() {
    this.emailService = null; // fourni par ReservationService (évite une dépendance circulaire)
  }

  get collection() {
    return db.collection('reservations');
  }

  /**
   * Démarre le paiement de l'acompte pour une réservation du client.
   * @returns {{ txId, methode, montant, expireLe, qrPayload?, qrSvg? }}
   */
  async demarrer(reservationId, client, { methode, payeurAlias, objet: objetDemande } = {}) {
    const objet = objetDemande === 'solde' ? 'solde' : 'acompte';
    if (client.ref && client.ref !== String(reservationId)) throw new ErreurPaiement('Accès non autorisé à cette réservation', 403);
    if (!['qr', 'demande', 'geniuspay'].includes(methode)) throw new ErreurPaiement('Méthode de paiement invalide');

    const r = await this.collection.findOne({ id: { $eq: String(reservationId) }, 'client.email': { $eq: String(client.email) } }, { projection: { _id: 0 } });
    if (!r) throw new ErreurPaiement('Réservation introuvable', 404);
    // Règles, moyens et clés de paiement de l'entreprise qui propose la résidence
    return Tenant.pour(r, () => this.demarrerPour(r, { methode, payeurAlias, objet }));
  }

  async demarrerPour(r, { methode, payeurAlias, objet }) {
    const etat = objet === 'solde' ? acompte.etatSolde(r) : acompte.etatAcompte(r);
    if (etat.paye) throw new ErreurPaiement(objet === 'solde' ? 'Le solde de ce séjour est déjà réglé' : 'L\'acompte de cette réservation est déjà réglé');
    if (!etat.possible) {
      if (etat.moyens.length === 0) throw new ErreurPaiement('Le paiement en ligne n\'est pas encore disponible', 503);
      throw new ErreurPaiement(objet === 'solde'
        ? 'Le solde peut être réglé en ligne une fois l\'acompte payé, tant que le séjour n\'est pas terminé'
        : 'Le paiement de l\'acompte est possible une fois la réservation confirmée');
    }

    const fournisseur = methode === 'geniuspay' ? 'geniuspay' : 'pispi';
    if (!etat.moyens.includes(fournisseur)) throw new ErreurPaiement('Ce moyen de paiement n\'est pas disponible', 503);

    // Une demande déjà envoyée et toujours valable est réutilisée (évite un double paiement)
    const enCours = acompte.paiementEnCours(r, objet);
    if (methode === 'geniuspay') {
      if (enCours?.methode === 'geniuspay' && enCours.checkoutUrl) {
        return { txId: enCours.txId, methode, objet, montant: enCours.montant, expireLe: enCours.expireLe, checkoutUrl: enCours.checkoutUrl, dejaEnvoyee: true };
      }
      return this.demarrerGeniusPay(r, etat.montant, objet);
    }
    if (enCours && enCours.methode === 'demande' && methode === 'demande') {
      return { txId: enCours.txId, methode: 'demande', objet, montant: enCours.montant, expireLe: enCours.expireLe, dejaEnvoyee: true };
    }

    let alias = null;
    if (methode === 'demande') {
      alias = normaliserAlias(payeurAlias);
      if (!PiSpi.UUID_V4.test(alias)) {
        throw new ErreurPaiement('Adresse de paiement invalide : copiez-la depuis l\'application de votre banque (format xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx).');
      }
    }

    const txId = acompte.genererTxId();
    const montant = etat.montant;
    const maintenant = new Date();
    const expireLe = new Date(maintenant.getTime() + (methode === 'qr' ? acompte.DUREE_QR_MS : acompte.DUREE_DEMANDE_MS));
    const motif = `${objet === 'solde' ? 'Solde' : 'Acompte'} reservation ${r.id}`.slice(0, 140);
    const resultat = { txId, methode, objet, montant, expireLe };

    if (methode === 'qr') {
      const entree = {
        alias: acompte.mode() === 'pispi' ? PiSpi.config.payeAlias : (PiSpi.UUID_V4.test(PiSpi.config.payeAlias) ? PiSpi.config.payeAlias : '00000000-0000-4000-8000-000000000000'),
        countryCode: (process.env.PISPI_PAYS || 'CI').toUpperCase(),
        qrType: 'DYNAMIC',
        referenceLabel: txId,
        amount: String(montant),
      };
      resultat.qrPayload = buildPayloadString(entree);
      resultat.qrSvg = await generateQrCodeSvg(entree, { size: 280 });
    } else if (acompte.mode() === 'pispi') {
      const reponse = await PiSpi.creerDemandePaiement({ txId, payeurAlias: alias, montant, motif });
      if (reponse?.statut === 'REJETE') throw new ErreurPaiement(messageRaison(reponse.statutRaison));
      resultat.payeurNom = reponse?.payeurNom || null;
    }

    await this.collection.updateOne({ id: r.id }, {
      $push: {
        paiements: {
          txId,
          methode,
          objet,
          montant,
          statut: 'en_attente',
          creeLe: maintenant,
          expireLe,
          ...(alias ? { payeurAlias: alias } : {}),
        },
      },
    });
    return resultat;
  }

  /** Crée la page de paiement GeniusPay de l'acompte ; le client y est redirigé. */
  async demarrerGeniusPay(r, montant, objet = 'acompte') {
    const txId = acompte.genererTxId();
    const retour = `${urlSite()}/mes-reservations?paiement=geniuspay&reservation=${encodeURIComponent(r.id)}&tx=${txId}`;
    const p = await GeniusPay.creerPaiement({
      montant,
      description: `${objet === 'solde' ? 'Solde' : 'Acompte'} réservation ${r.id} - ${r.residenceInfo?.nom || 'BABI RESIDENCE'}`,
      client: { nom: `${r.client.prenom} ${r.client.nom}`.trim(), email: r.client.email, telephone: r.client.telephone },
      successUrl: retour,
      errorUrl: `${retour}&echec=1`,
      metadata: { reservation: r.id, txId, objet },
    });
    if (!p?.reference || !p?.checkout_url) throw new ErreurPaiement('GeniusPay n\'a pas renvoyé de page de paiement', 502);
    const creeLe = new Date();
    const expireLe = p.expires_at ? new Date(p.expires_at) : new Date(creeLe.getTime() + 24 * 3600 * 1000);
    await this.collection.updateOne({ id: r.id }, {
      $push: { paiements: { txId, methode: 'geniuspay', objet, montant, statut: 'en_attente', creeLe, expireLe, reference: p.reference, checkoutUrl: p.checkout_url, environnement: p.environment || null } },
    });
    return { txId, methode: 'geniuspay', objet, montant, expireLe, checkoutUrl: p.checkout_url };
  }

  /** Relit un paiement GeniusPay et met la réservation à jour. */
  async verifierGeniusPay(r, p) {
    if (!GeniusPay.estConfigure() || !p.reference) return p;
    try {
      const g = await GeniusPay.lirePaiement(p.reference);
      if (g?.status === 'completed' && Number(g.amount) >= Number(p.montant)) {
        return this.marquerPaye(r.id, p.txId, { end2endId: g.reference, payeurNom: g.customer?.name || null });
      }
      if (STATUTS_ECHEC_GENIUSPAY[g?.status]) return this.cloturer(r.id, p.txId, 'refuse', STATUTS_ECHEC_GENIUSPAY[g.status]);
      if (g?.status === 'expired') return this.cloturer(r.id, p.txId, 'expire', 'Délai dépassé');
    } catch (error) {
      console.error('⚠️ Vérification GeniusPay impossible (%s) :', String(p.txId).replace(/\n|\r/g, ''), error.message);
    }
    return p;
  }

  /**
   * Vérifie un paiement en attente auprès de PI-SPI et met la réservation à jour.
   * Idempotent : peut être appelé par le client, le webhook et la vérification périodique.
   * @returns le paiement à jour (ou null)
   */
  async verifier(txId, options = {}) {
    const r = await this.collection.findOne({ 'paiements.txId': { $eq: String(txId) } }, { projection: { _id: 0 } });
    if (!r) return null;
    return Tenant.pour(r, () => this.verifierPour(r, txId, options));
  }

  async verifierPour(r, txId, { forcer = false } = {}) {
    const p = r.paiements.find(x => x.txId === txId);
    // « expire » reste vérifiable : un client peut payer une demande après notre délai
    if (!['en_attente', 'expire'].includes(p.statut)) return p;

    const dernier = derniereVerification.get(txId) || 0;
    if (!forcer && Date.now() - dernier < 3000) return p;
    derniereVerification.set(txId, Date.now());

    if (p.methode === 'geniuspay') return this.verifierGeniusPay(r, p);
    if (acompte.mode() !== 'pispi') return p;

    try {
      const recu = await PiSpi.lirePaiementRecu(txId);
      if (recu && recu.statut === 'IRREVOCABLE' && Number(recu.montant) >= p.montant) {
        return this.marquerPaye(r.id, txId, { end2endId: recu.end2endId, payeurNom: recu.payeurNom, payeurAlias: recu.payeurAlias });
      }
      if (p.methode === 'demande') {
        const demande = await PiSpi.lireDemandePaiement(txId);
        if (demande && ['REJETE', 'ANNULE'].includes(demande.statut)) {
          return this.cloturer(r.id, txId, 'refuse', messageRaison(demande.statutRaison));
        }
      }
    } catch (error) {
      console.error('⚠️ Vérification PI-SPI impossible (%s) :', String(txId).replace(/\n|\r/g, ''), error.message);
    }

    if (p.statut === 'en_attente' && Date.now() > new Date(p.expireLe).getTime() + acompte.MARGE_VERIFICATION_MS) {
      return this.cloturer(r.id, txId, 'expire', 'Délai dépassé');
    }
    return p;
  }

  async cloturer(reservationId, txId, statut, raison) {
    await this.collection.updateOne(
      { id: { $eq: String(reservationId) }, paiements: { $elemMatch: { txId, statut: 'en_attente' } } },
      { $set: { 'paiements.$.statut': statut, 'paiements.$.raison': raison, 'paiements.$.clotureLe': new Date() } }
    );
    const r = await this.collection.findOne({ id: { $eq: String(reservationId) } }, { projection: { _id: 0 } });
    return r.paiements.find(x => x.txId === txId);
  }

  /**
   * Enregistre l'acompte comme payé (une seule fois) et envoie les emails.
   */
  async marquerPaye(reservationId, txId, { end2endId = null, payeurNom = null, payeurAlias = null } = {}) {
    const avant = await this.collection.findOne({ id: { $eq: String(reservationId) } }, { projection: { _id: 0 } });
    const p = avant.paiements.find(x => x.txId === txId);
    if ((p.objet || 'acompte') === 'solde') return this.marquerSoldePaye(avant, p, { end2endId, payeurNom });
    const maintenant = new Date();
    // Acompte déjà réglé par un autre paiement : doublon à rembourser, signalé à l'admin
    if (avant.acompte?.paye && avant.acompte.txId !== txId) {
      await db.transaction(async (session) => {
        const res = await this.collection.updateOne(
          { id: { $eq: String(reservationId) }, paiements: { $elemMatch: { txId, statut: { $ne: 'doublon' } } } },
          { $set: { 'paiements.$.statut': 'doublon', 'paiements.$.payeLe': maintenant, 'paiements.$.end2endId': end2endId, 'paiements.$.raison': 'Acompte déjà réglé : à rembourser' } },
          { session }
        );
        // L'argent est bien arrivé : comptabilisé comme trop-perçu à rendre au client
        if (res.modifiedCount === 1) await finance().paiementEnDouble(avant, { ...p, end2endId }, session);
      });
      console.error('⚠️ Paiement en double sur %s (%s) : à rembourser', String(reservationId).replace(/\n|\r/g, ''), String(txId).replace(/\n|\r/g, ''));
      const maj = await this.collection.findOne({ id: { $eq: String(reservationId) } }, { projection: { _id: 0 } });
      return maj.paiements.find(x => x.txId === txId);
    }
    // Paiement et écriture comptable : tout ou rien (transaction MongoDB)
    const resultat = await db.transaction(async (session) => {
      const res = await this.collection.updateOne(
        { id: { $eq: String(reservationId) }, 'acompte.paye': { $ne: true }, paiements: { $elemMatch: { txId, statut: { $in: ['en_attente', 'expire'] } } } },
        {
          $set: {
            'paiements.$.statut': 'paye',
            'paiements.$.payeLe': maintenant,
            'paiements.$.end2endId': end2endId,
            acompte: {
              paye: true,
              montant: p.montant,
              pourcentage: acompte.pourcentage(),
              payeLe: maintenant,
              txId,
              methode: p.methode,
              end2endId,
              payeurNom,
              payeurAlias: payeurAlias || p.payeurAlias || null,
            },
          },
        },
        { session }
      );
      if (res.modifiedCount === 1) await finance().paiementConfirme(avant, { ...p, objet: 'acompte', end2endId }, session);
      return res;
    });
    const r = await this.collection.findOne({ id: { $eq: String(reservationId) } }, { projection: { _id: 0 } });

    if (resultat.modifiedCount === 1 && this.emailService) {
      Promise.allSettled([
        this.emailService.sendAcompteRecu(r),
        this.emailService.sendAcompteRecuAdmin(r),
      ]).then(res => res.filter(x => x.status === 'rejected')
        .forEach(x => console.error('⚠️ Email acompte non envoyé :', x.reason?.message)));
    }
    return r.paiements.find(x => x.txId === txId);
  }

  /** Solde réglé en ligne (une seule fois) ; un second paiement est signalé comme doublon. */
  async marquerSoldePaye(avant, p, { end2endId = null, payeurNom = null } = {}) {
    const maintenant = new Date();
    if (avant.solde?.paye && avant.solde.txId !== p.txId) {
      await db.transaction(async (session) => {
        const res = await this.collection.updateOne(
          { id: avant.id, paiements: { $elemMatch: { txId: p.txId, statut: { $ne: 'doublon' } } } },
          { $set: { 'paiements.$.statut': 'doublon', 'paiements.$.payeLe': maintenant, 'paiements.$.end2endId': end2endId, 'paiements.$.raison': 'Solde déjà réglé : à rembourser' } },
          { session }
        );
        if (res.modifiedCount === 1) await finance().paiementEnDouble(avant, { ...p, end2endId }, session);
      });
      console.error('⚠️ Solde payé en double sur %s (%s) : à rembourser', String(avant.id).replace(/\n|\r/g, ''), String(p.txId).replace(/\n|\r/g, ''));
    } else {
      const resultat = await db.transaction(async (session) => {
        const res = await this.collection.updateOne(
          { id: avant.id, 'solde.paye': { $ne: true }, paiements: { $elemMatch: { txId: p.txId, statut: { $in: ['en_attente', 'expire'] } } } },
          {
            $set: {
              'paiements.$.statut': 'paye',
              'paiements.$.payeLe': maintenant,
              'paiements.$.end2endId': end2endId,
              solde: { paye: true, enLigne: true, montant: p.montant, payeLe: maintenant, txId: p.txId, methode: p.methode, reference: end2endId || p.txId, payeurNom },
            },
          },
          { session }
        );
        if (res.modifiedCount === 1) await finance().paiementConfirme(avant, { ...p, objet: 'solde', end2endId }, session);
        return res;
      });
      if (resultat.modifiedCount === 1 && this.emailService) {
        const r = await this.collection.findOne({ id: avant.id }, { projection: { _id: 0 } });
        Promise.allSettled([this.emailService.sendSoldeRecu(r), this.emailService.sendSoldeRecuAdmin(r)])
          .then(res => res.filter(x => x.status === 'rejected').forEach(x => console.error('⚠️ Email solde non envoyé :', x.reason?.message)));
      }
    }
    const maj = await this.collection.findOne({ id: avant.id }, { projection: { _id: 0 } });
    return maj.paiements.find(x => x.txId === p.txId);
  }

  // Mode simulation uniquement (démonstrations)
  async simuler(reservationId, client, txId) {
    if (acompte.mode() !== 'simulation') throw new ErreurPaiement('Simulation désactivée', 403);
    if (client.ref && client.ref !== String(reservationId)) throw new ErreurPaiement('Accès non autorisé', 403);
    const r = await this.collection.findOne({ id: { $eq: String(reservationId) }, 'client.email': { $eq: String(client.email) }, 'paiements.txId': { $eq: String(txId) } });
    if (!r) throw new ErreurPaiement('Paiement introuvable', 404);
    return Tenant.pour(r, () => this.marquerPaye(r.id, txId, { end2endId: `SIMULATION-${txId}` }));
  }

  // État d'un paiement pour le client (vérifie au passage auprès de PI-SPI)
  async statutPourClient(reservationId, client, txId) {
    if (client.ref && client.ref !== String(reservationId)) throw new ErreurPaiement('Accès non autorisé', 403);
    const r = await this.collection.findOne({ id: { $eq: String(reservationId) }, 'client.email': { $eq: String(client.email) }, 'paiements.txId': { $eq: String(txId) } });
    if (!r) throw new ErreurPaiement('Paiement introuvable', 404);
    const p = await this.verifier(txId);
    const maj = await this.collection.findOne({ id: r.id }, { projection: { _id: 0 } });
    return Tenant.pour(maj, () => ({ statut: p.statut, raison: p.raison || null, objet: p.objet || 'acompte', acompte: acompte.etatAcompte(maj), solde: acompte.etatSolde(maj) }));
  }

  // ---------- Webhook ----------

  /**
   * Vérifie la signature X-Signature (HMAC-SHA256 du corps brut, secret PISPI_WEBHOOK_SECRET).
   * Accepte une signature hexadécimale ou base64, avec ou sans préfixe « sha256= ».
   */
  signatureValide(corpsBrut, signature) {
    const secret = (require('./Cles').lire('PISPI_WEBHOOK_SECRET') || '').trim(); // secret de l'entreprise courante
    if (!secret || !signature) return false;
    const recue = String(signature).trim().replace(/^sha256=/i, '');
    const hmac = crypto.createHmac('sha256', secret).update(corpsBrut).digest();
    const candidats = [hmac.toString('hex'), hmac.toString('base64')];
    return candidats.some(c => {
      const a = Buffer.from(c);
      const b = Buffer.from(recue);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
  }

  // Traite les évènements (appelé après la réponse 204)
  async traiterEvenements(corps) {
    const evenements = Array.isArray(corps?.data) ? corps.data : [];
    for (const ev of evenements) {
      if (['PAIEMENT_ENVOYE', 'PAIEMENT_REJETE'].includes(ev?.evCode) && ev.txId && String(ev.txId).startsWith('RMB')) {
        const r = await this.collection.findOne({ 'acompte.remboursement.txId': { $eq: String(ev.txId) } }, { projection: { id: 1 } });
        if (r) await require('./RefundService').verifier(r.id).catch(e => console.error('⚠️ Webhook remboursement :', e.message));
        continue;
      }
      if (['RETOUR_ENVOYE', 'RETOUR_REJETE'].includes(ev?.evCode) && ev.end2endId) {
        try {
          await require('./RefundService').verifierParEnd2endId(String(ev.end2endId));
        } catch (error) {
          console.error('⚠️ Webhook retour PI-SPI :', error.message);
        }
        continue;
      }
      if (!ev?.txId || !['PAIEMENT_RECU', 'RTP_REJETE'].includes(ev.evCode)) continue;
      try {
        await this.verifier(String(ev.txId), { forcer: true });
      } catch (error) {
        console.error('⚠️ Webhook PI-SPI :', error.message);
      }
    }
  }

  // ---------- Webhook GeniusPay ----------

  /** Évènement payment.* : on relit toujours le paiement via l'API avant de valider. */
  async traiterEvenementGeniusPay(corps) {
    const d = corps?.data || {};
    if (!String(corps?.event || '').startsWith('payment.')) return;
    const filtre = d.metadata?.txId ? { 'paiements.txId': { $eq: String(d.metadata.txId) } } : { 'paiements.reference': { $eq: String(d.reference || '') } };
    const r = await this.collection.findOne(filtre, { projection: { _id: 0, paiements: 1 } });
    const p = r?.paiements?.find(x => (d.metadata?.txId ? x.txId === String(d.metadata.txId) : x.reference === String(d.reference)));
    if (p) await this.verifier(p.txId, { forcer: true });
  }

  // ---------- Vérification périodique (secours si un webhook se perd) ----------

  async verifierEnAttente() {
    const limite = new Date(Date.now() - acompte.MARGE_VERIFICATION_MS);
    const reservations = await this.collection
      .find({ paiements: { $elemMatch: { statut: 'en_attente', expireLe: { $gt: limite } } } }, { projection: { paiements: 1 } })
      .toArray();
    // Suivi rapproché pendant 15 min ; ensuite webhook + vérification à l'ouverture de la page
    const recent = Date.now() - 15 * 60 * 1000;
    for (const r of reservations) {
      // GeniusPay : la page de paiement reste ouverte plus longtemps, suivi pendant 2 h
      const recentGenius = Date.now() - 2 * 3600 * 1000;
      for (const p of r.paiements.filter(x => x.statut === 'en_attente' && new Date(x.creeLe).getTime() > (x.methode === 'geniuspay' ? recentGenius : recent))) {
        await this.verifier(p.txId);
      }
    }
    // Clôturer les paiements expirés depuis longtemps
    await this.collection.updateMany(
      { paiements: { $elemMatch: { statut: 'en_attente', expireLe: { $lte: limite } } } },
      { $set: { 'paiements.$[p].statut': 'expire', 'paiements.$[p].raison': 'Délai dépassé' } },
      { arrayFilters: [{ 'p.statut': 'en_attente', 'p.expireLe': { $lte: limite } }] }
    );
  }

  demarrerVerificationPeriodique(intervalleMs = 20000) {
    if (this.minuterie) return;
    this.minuterie = setInterval(() => {
      this.verifierEnAttente().catch(e => console.error('⚠️ Vérification des paiements :', e.message));
      require('./RefundService').verifierEnCours().catch(e => console.error('⚠️ Vérification des remboursements :', e.message));
    }, intervalleMs);
    this.minuterie.unref?.();
  }
}

const service = new PaymentService();
service.ErreurPaiement = ErreurPaiement;
service.messageRaison = messageRaison;
service.normaliserAlias = normaliserAlias;
module.exports = service;
