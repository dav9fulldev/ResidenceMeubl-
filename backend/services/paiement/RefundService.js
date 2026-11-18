const db = require('../../db');
const PiSpi = require('./PiSpiClient');
const acompte = require('./acompte');

/**
 * Remboursement automatique de l'acompte (retour de fonds PI-SPI) quand une réservation
 * dont l'acompte est payé est annulée.
 *
 * acompte.remboursement.statut :
 *   en_cours      retour demandé à PI-SPI (INITIE), en attente de confirmation
 *   rembourse     retour IRREVOCABLE (ou marqué remboursé à la main par l'admin)
 *   echec         PI-SPI a rejeté le retour (ou délai de 90 jours dépassé) : action admin
 *   a_rembourser  remboursement à effectuer (paiement en simulation sans end2endId réel, mode désactivé…)
 */
const RAISONS = {
  AG10: 'Le participant du client est désactivé',
  AC04: 'Compte du client clôturé',
  AC06: 'Compte du client bloqué',
};

class RefundService {
  constructor() {
    this.emailService = null; // fourni par ReservationService
  }

  get collection() {
    return db.collection('reservations');
  }

  async majRemboursement(id, champs) {
    const set = {};
    for (const [k, v] of Object.entries(champs)) set[`acompte.remboursement.${k}`] = v;
    await this.collection.updateOne({ id }, { $set: set });
    return this.collection.findOne({ id }, { projection: { _id: 0 } });
  }

  /**
   * Lance le remboursement d'une réservation annulée dont l'acompte est payé.
   * Sans effet si rien n'est à rembourser ou si c'est déjà fait.
   */
  async rembourser(reservationId, { ignorerPolitique = false } = {}) {
    const r = await this.collection.findOne({ id: String(reservationId) }, { projection: { _id: 0 } });
    if (!r?.acompte?.paye || r.statut !== 'annulee') return null;
    const etat = r.acompte.remboursement?.statut;
    if (etat === 'rembourse' || etat === 'en_cours') return r;

    // Politique (paliers 100 % / partiel / rien) évaluée à la date de la demande d'annulation du client.
    // Relance ou geste commercial (ignorerPolitique) : même part qu'à la première tentative, sinon 100 %.
    let pourcentage;
    if (ignorerPolitique) {
      pourcentage = Number(r.acompte.remboursement?.pourcentage) || 100;
    } else {
      const politique = acompte.politiqueRemboursement(r, r.demandeAnnulation?.dateDemande || new Date());
      if (politique && !politique.remboursable) {
        return this.majRemboursement(r.id, { statut: 'non_remboursable', depuis: new Date(), raison: politique.raison });
      }
      pourcentage = politique ? politique.pourcentage : acompte.pourcentageRembourse();
    }

    const maintenant = new Date();
    const montant = acompte.montantRembourse(r.acompte.montant, pourcentage);
    if (montant <= 0) {
      return this.majRemboursement(r.id, { statut: 'non_remboursable', depuis: maintenant, raison: 'Acompte non remboursable' });
    }
    const base = {
      pourcentage,
      montant, depuis: r.acompte.remboursement?.depuis || maintenant, tentatives: (r.acompte.remboursement?.tentatives || 0) + 1, derniereTentative: maintenant };

    // GeniusPay n'offre pas d'API de remboursement : à faire depuis son tableau de bord
    if (r.acompte.methode === 'geniuspay') {
      return this.majRemboursement(r.id, { ...base, statut: 'a_rembourser', raison: `À rembourser depuis le tableau de bord GeniusPay (paiement ${r.acompte.end2endId || r.acompte.txId})` });
    }

    if (acompte.mode() === 'simulation') {
      const maj = await this.majRemboursement(r.id, { ...base, statut: 'rembourse', le: maintenant, reference: 'SIMULATION', automatique: true, methode: pourcentage >= 100 ? 'retour' : 'paiement' });
      this.prevenir(maj);
      return maj;
    }
    const end2endId = r.acompte.end2endId;
    if (acompte.mode() !== 'pispi' || !end2endId || end2endId.startsWith('SIMULATION')) {
      return this.majRemboursement(r.id, { ...base, statut: 'a_rembourser', raison: 'Remboursement automatique indisponible : à effectuer manuellement' });
    }

    try {
      if (pourcentage >= 100) {
        // Remboursement intégral : retour de fonds (idempotent)
        const reponse = await PiSpi.retournerFonds(end2endId);
        return this.appliquerStatut(r.id, reponse, { ...base, methode: 'retour' });
      }
      // Remboursement partiel : paiement sortant du montant exact vers l'adresse du client
      let payeAlias = r.acompte.payeurAlias;
      if (!payeAlias) {
        const recu = await PiSpi.lirePaiementRecu(r.acompte.txId);
        payeAlias = recu?.payeurAlias;
      }
      if (!payeAlias) {
        return this.majRemboursement(r.id, { ...base, statut: 'echec', raison: 'Adresse de paiement du client introuvable' });
      }
      const txId = r.acompte.remboursement?.txId && r.acompte.remboursement.statut !== 'echec'
        ? r.acompte.remboursement.txId
        : `RMB${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await this.majRemboursement(r.id, { ...base, methode: 'paiement', txId, payeAlias });
      const reponse = await PiSpi.envoyerPaiement({ txId, payeAlias, montant, motif: `Remboursement acompte ${r.id}` });
      return this.appliquerStatutPaiement(r.id, reponse);
    } catch (error) {
      const delai = error.status === 403;
      console.error(`⚠️ Retour de fonds impossible (${r.id}) :`, error.message);
      return this.majRemboursement(r.id, {
        ...base,
        statut: 'echec',
        raison: delai ? 'Délai de 90 jours dépassé : remboursement à faire hors PI-SPI' : `PI-SPI : ${error.message}`,
      });
    }
  }

  // Traduit le retourStatut PI-SPI en statut de remboursement
  async appliquerStatut(id, paiement, base = {}) {
    const statutPiSpi = paiement?.retourStatut;
    if (statutPiSpi === 'IRREVOCABLE') {
      const avant = await this.collection.findOne({ id }, { projection: { _id: 0, 'acompte.remboursement': 1 } });
      const maj = await this.majRemboursement(id, { ...base, statut: 'rembourse', le: paiement.retourDateReponse ? new Date(paiement.retourDateReponse) : new Date(), reference: paiement.end2endId, automatique: true, raison: null });
      if (avant?.acompte?.remboursement?.statut !== 'rembourse') this.prevenir(maj);
      return maj;
    }
    if (statutPiSpi === 'REJETE') {
      return this.majRemboursement(id, { ...base, statut: 'echec', raison: RAISONS[paiement.retourStatutRaison] || `Retour rejeté (${paiement.retourStatutRaison || 'motif inconnu'})` });
    }
    return this.majRemboursement(id, { ...base, statut: 'en_cours', raison: null });
  }

  // Statut d'un paiement sortant de remboursement (ENVOYE / IRREVOCABLE / REJETE)
  async appliquerStatutPaiement(id, paiement) {
    if (paiement?.statut === 'IRREVOCABLE') {
      const avant = await this.collection.findOne({ id }, { projection: { _id: 0, 'acompte.remboursement': 1 } });
      const maj = await this.majRemboursement(id, { statut: 'rembourse', le: new Date(), reference: paiement.end2endId || paiement.txId, automatique: true, raison: null });
      if (avant?.acompte?.remboursement?.statut !== 'rembourse') this.prevenir(maj);
      return maj;
    }
    if (['REJETE', 'ANNULE'].includes(paiement?.statut)) {
      return this.majRemboursement(id, { statut: 'echec', raison: RAISONS[paiement.statutRaison] || `Paiement de remboursement rejeté (${paiement.statutRaison || 'motif inconnu'})` });
    }
    return this.majRemboursement(id, { statut: 'en_cours', raison: null });
  }

  // Relit le statut des remboursements en cours (webhooks ou vérification périodique)
  async verifier(reservationId) {
    const r = await this.collection.findOne({ id: String(reservationId) }, { projection: { _id: 0 } });
    if (r?.acompte?.remboursement?.statut !== 'en_cours') return r;
    try {
      if (r.acompte.remboursement.methode === 'paiement') {
        const paiement = await PiSpi.lirePaiementEnvoye(r.acompte.remboursement.txId);
        if (paiement) return this.appliquerStatutPaiement(r.id, paiement);
        return r;
      }
      if (!r.acompte.end2endId) return r;
      const paiement = await PiSpi.lirePaiement(r.acompte.end2endId);
      if (paiement) return this.appliquerStatut(r.id, paiement);
    } catch (error) {
      console.error(`⚠️ Suivi du remboursement impossible (${r.id}) :`, error.message);
    }
    return r;
  }

  async verifierEnCours() {
    if (acompte.mode() !== 'pispi') return;
    const enCours = await this.collection.find({ 'acompte.remboursement.statut': 'en_cours' }, { projection: { id: 1 } }).toArray();
    for (const r of enCours) await this.verifier(r.id);
  }

  async verifierParEnd2endId(end2endId) {
    const r = await this.collection.findOne({ 'acompte.end2endId': end2endId }, { projection: { id: 1 } });
    if (r) await this.verifier(r.id);
  }

  prevenir(r) {
    if (!this.emailService) return;
    this.emailService.sendRemboursementEffectue(r)
      .catch(e => console.error('⚠️ Email de remboursement non envoyé :', e.message));
  }
}

module.exports = new RefundService();
