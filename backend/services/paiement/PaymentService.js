const crypto = require('crypto');
const { buildPayloadString, generateQrCodeSvg } = require('@pi-spi/qrcode');
const db = require('../../db');
const PiSpi = require('./PiSpiClient');
const acompte = require('./acompte');

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
  async demarrer(reservationId, client, { methode, payeurAlias } = {}) {
    if (client.ref && client.ref !== String(reservationId)) throw new ErreurPaiement('Accès non autorisé à cette réservation', 403);
    if (!['qr', 'demande'].includes(methode)) throw new ErreurPaiement('Méthode de paiement invalide');

    const r = await this.collection.findOne({ id: String(reservationId), 'client.email': client.email }, { projection: { _id: 0 } });
    if (!r) throw new ErreurPaiement('Réservation introuvable', 404);

    const etat = acompte.etatAcompte(r);
    if (etat.paye) throw new ErreurPaiement('L\'acompte de cette réservation est déjà réglé');
    if (!etat.possible) {
      if (etat.mode === 'desactive') throw new ErreurPaiement('Le paiement en ligne n\'est pas encore disponible', 503);
      throw new ErreurPaiement('Le paiement de l\'acompte est possible une fois la réservation confirmée');
    }

    let alias = null;
    if (methode === 'demande') {
      alias = String(payeurAlias || '').trim().toLowerCase();
      if (!PiSpi.UUID_V4.test(alias)) {
        throw new ErreurPaiement('Adresse de paiement invalide : copiez-la depuis l\'application de votre banque (format xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx).');
      }
    }

    const txId = acompte.genererTxId();
    const montant = etat.montant;
    const maintenant = new Date();
    const expireLe = new Date(maintenant.getTime() + (methode === 'qr' ? acompte.DUREE_QR_MS : acompte.DUREE_DEMANDE_MS));
    const motif = `Acompte reservation ${r.id}`.slice(0, 140);
    const resultat = { txId, methode, montant, expireLe };

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

  /**
   * Vérifie un paiement en attente auprès de PI-SPI et met la réservation à jour.
   * Idempotent : peut être appelé par le client, le webhook et la vérification périodique.
   * @returns le paiement à jour (ou null)
   */
  async verifier(txId, { forcer = false } = {}) {
    const r = await this.collection.findOne({ 'paiements.txId': txId }, { projection: { _id: 0 } });
    if (!r) return null;
    const p = r.paiements.find(x => x.txId === txId);
    if (p.statut !== 'en_attente' || acompte.mode() !== 'pispi') return p;

    const dernier = derniereVerification.get(txId) || 0;
    if (!forcer && Date.now() - dernier < 3000) return p;
    derniereVerification.set(txId, Date.now());

    try {
      const recu = await PiSpi.lirePaiementRecu(txId);
      if (recu && recu.statut === 'IRREVOCABLE' && Number(recu.montant) >= p.montant) {
        return this.marquerPaye(r.id, txId, { end2endId: recu.end2endId, payeurNom: recu.payeurNom });
      }
      if (p.methode === 'demande') {
        const demande = await PiSpi.lireDemandePaiement(txId);
        if (demande && ['REJETE', 'ANNULE'].includes(demande.statut)) {
          return this.cloturer(r.id, txId, 'refuse', messageRaison(demande.statutRaison));
        }
      }
    } catch (error) {
      console.error(`⚠️ Vérification PI-SPI impossible (${txId}) :`, error.message);
    }

    if (Date.now() > new Date(p.expireLe).getTime() + acompte.MARGE_VERIFICATION_MS) {
      return this.cloturer(r.id, txId, 'expire', 'Délai dépassé');
    }
    return p;
  }

  async cloturer(reservationId, txId, statut, raison) {
    await this.collection.updateOne(
      { id: reservationId, paiements: { $elemMatch: { txId, statut: 'en_attente' } } },
      { $set: { 'paiements.$.statut': statut, 'paiements.$.raison': raison, 'paiements.$.clotureLe': new Date() } }
    );
    const r = await this.collection.findOne({ id: reservationId }, { projection: { _id: 0 } });
    return r.paiements.find(x => x.txId === txId);
  }

  /**
   * Enregistre l'acompte comme payé (une seule fois) et envoie les emails.
   */
  async marquerPaye(reservationId, txId, { end2endId = null, payeurNom = null } = {}) {
    const avant = await this.collection.findOne({ id: reservationId }, { projection: { _id: 0 } });
    const p = avant.paiements.find(x => x.txId === txId);
    const maintenant = new Date();
    const resultat = await this.collection.updateOne(
      { id: reservationId, 'acompte.paye': { $ne: true }, paiements: { $elemMatch: { txId, statut: 'en_attente' } } },
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
          },
        },
      }
    );
    const r = await this.collection.findOne({ id: reservationId }, { projection: { _id: 0 } });

    if (resultat.modifiedCount === 1 && this.emailService) {
      Promise.allSettled([
        this.emailService.sendAcompteRecu(r),
        this.emailService.sendAcompteRecuAdmin(r),
      ]).then(res => res.filter(x => x.status === 'rejected')
        .forEach(x => console.error('⚠️ Email acompte non envoyé :', x.reason?.message)));
    }
    return r.paiements.find(x => x.txId === txId);
  }

  // Mode simulation uniquement (démonstrations)
  async simuler(reservationId, client, txId) {
    if (acompte.mode() !== 'simulation') throw new ErreurPaiement('Simulation désactivée', 403);
    if (client.ref && client.ref !== String(reservationId)) throw new ErreurPaiement('Accès non autorisé', 403);
    const r = await this.collection.findOne({ id: String(reservationId), 'client.email': client.email, 'paiements.txId': txId });
    if (!r) throw new ErreurPaiement('Paiement introuvable', 404);
    return this.marquerPaye(r.id, txId, { end2endId: `SIMULATION-${txId}` });
  }

  // État d'un paiement pour le client (vérifie au passage auprès de PI-SPI)
  async statutPourClient(reservationId, client, txId) {
    if (client.ref && client.ref !== String(reservationId)) throw new ErreurPaiement('Accès non autorisé', 403);
    const r = await this.collection.findOne({ id: String(reservationId), 'client.email': client.email, 'paiements.txId': txId });
    if (!r) throw new ErreurPaiement('Paiement introuvable', 404);
    const p = await this.verifier(txId);
    const maj = await this.collection.findOne({ id: r.id }, { projection: { _id: 0 } });
    return { statut: p.statut, raison: p.raison || null, acompte: acompte.etatAcompte(maj) };
  }

  // ---------- Webhook ----------

  /**
   * Vérifie la signature X-Signature (HMAC-SHA256 du corps brut, secret PISPI_WEBHOOK_SECRET).
   * Accepte une signature hexadécimale ou base64, avec ou sans préfixe « sha256= ».
   */
  signatureValide(corpsBrut, signature) {
    const secret = (process.env.PISPI_WEBHOOK_SECRET || '').trim();
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
      if (!ev?.txId || !['PAIEMENT_RECU', 'RTP_REJETE'].includes(ev.evCode)) continue;
      try {
        await this.verifier(String(ev.txId), { forcer: true });
      } catch (error) {
        console.error('⚠️ Webhook PI-SPI :', error.message);
      }
    }
  }

  // ---------- Vérification périodique (secours si un webhook se perd) ----------

  async verifierEnAttente() {
    if (acompte.mode() !== 'pispi') return;
    const limite = new Date(Date.now() - acompte.MARGE_VERIFICATION_MS);
    const reservations = await this.collection
      .find({ paiements: { $elemMatch: { statut: 'en_attente', expireLe: { $gt: limite } } } }, { projection: { paiements: 1 } })
      .toArray();
    for (const r of reservations) {
      for (const p of r.paiements.filter(x => x.statut === 'en_attente')) {
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
    }, intervalleMs);
    this.minuterie.unref?.();
  }
}

const service = new PaymentService();
service.ErreurPaiement = ErreurPaiement;
service.messageRaison = messageRaison;
module.exports = service;
