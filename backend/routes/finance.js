const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const Finance = require('../services/finance');
const Rapprochement = require('../services/finance/Rapprochement');
const Tenant = require('../services/Tenant');

/**
 * Module financier (voir docs/finance/API_SPEC.md).
 *  - /api/admin/finance/…  administrateur de la plateforme
 *  - /api/admin/revenus/…  entreprise connectée : ses sommes dues, ses reversements, ses coordonnées
 */
const plateforme = express.Router();
const entreprise = express.Router();
plateforme.use(requireAdmin, requireAdmin.superAdmin);
entreprise.use(requireAdmin);

const erreur = (res, e, contexte) => {
  if (e instanceof Finance.ErreurFinance || e instanceof Finance.Ledger.ErreurLedger || e?.status) {
    return res.status(e.status || 400).json({ success: false, message: e.message });
  }
  console.error(`Erreur ${contexte} :`, e);
  return res.status(500).json({ success: false, message: `Erreur ${contexte}` });
};
const qui = (req) => (req.admin.uid ? `utilisateur:${req.admin.uid}` : `plateforme:${req.admin.sub}`);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : undefined);
const envoyerFichier = (res, { flux, mime, nom }) => {
  res.set({ 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${String(nom).replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, no-store' });
  flux.on('error', () => res.destroy()).pipe(res);
};

// ---------- Plateforme ----------

plateforme.get('/apercu', async (req, res) => {
  try { res.json({ success: true, data: await Finance.apercu({ du: date(req.query.du), au: date(req.query.au) }) }); } catch (e) { erreur(res, e, 'lors du calcul de l\'aperçu'); }
});

plateforme.get('/registre', async (req, res) => {
  try {
    res.json({ success: true, data: await Finance.registre({ type: req.query.type, entrepriseId: req.query.entreprise, du: date(req.query.du), au: date(req.query.au), page: req.query.page }) });
  } catch (e) { erreur(res, e, 'lors de la lecture du registre'); }
});

plateforme.get('/registre.csv', async (req, res) => {
  try {
    const filtre = {};
    if (date(req.query.du) || date(req.query.au)) filtre.creeLe = { ...(date(req.query.du) ? { $gte: new Date(req.query.du) } : {}), ...(date(req.query.au) ? { $lte: new Date(`${req.query.au}T23:59:59.999Z`) } : {}) };
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="registre-financier-babi.csv"' });
    res.send(await Finance.registreCsv(filtre));
  } catch (e) { erreur(res, e, 'lors de l\'export'); }
});

plateforme.post('/registre/:id/contrepassation', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    if (!/^[0-9a-f]{24}$/.test(String(req.params.id))) throw new Finance.ErreurFinance('Transaction introuvable', 404);
    const motif = String(req.body?.motif || '').trim().slice(0, 300);
    if (motif.length < 5) throw new Finance.ErreurFinance('Indiquez le motif de la correction');
    const { transaction } = await Finance.Ledger.contrePasser(new ObjectId(String(req.params.id)), { motif, par: qui(req) });
    await Finance.journaliser(qui(req), 'CONTREPASSATION', { transaction: transaction.reference, motif });
    res.status(201).json({ success: true, data: { reference: transaction.reference } });
  } catch (e) { erreur(res, e, 'lors de la contre-passation'); }
});

plateforme.get('/dettes', async (req, res) => {
  try { res.json({ success: true, data: await Finance.listerDettes(req.query.entreprise ? { entrepriseId: String(req.query.entreprise) } : {}) }); } catch (e) { erreur(res, e, 'lors de la lecture des sommes dues'); }
});

plateforme.put('/dettes/:reservationId/blocage', async (req, res) => {
  try {
    await Finance.bloquerDette(req.params.reservationId, { bloque: Boolean(req.body?.bloque), motif: req.body?.motif }, qui(req));
    res.json({ success: true });
  } catch (e) { erreur(res, e, 'lors du blocage'); }
});

plateforme.get('/entreprises', async (req, res) => {
  // Par entreprise : versable maintenant, coordonnées de versement, reversement en cours
  try {
    const EntrepriseService = require('../services/EntrepriseService');
    const liste = (await EntrepriseService.lister()).filter(e => !e.principale);
    const data = [];
    for (const e of liste) {
      const [dispo, b, enCours] = await Promise.all([
        Finance.disponible(e.id), Finance.beneficiaire(e.id),
        Finance.reversements.findOne({ entrepriseId: e.id, statut: { $in: ['EN_ATTENTE_APPROBATION', 'APPROUVE', 'EXECUTE'] } }),
      ]);
      data.push({
        id: e.id, nom: e.nom, statut: e.statut, versable: dispo.montant,
        enAttente: dispo.toutes.filter(d => d.statut === 'EN_ATTENTE').reduce((s, d) => s + d.reste, 0),
        bloque: dispo.toutes.filter(d => ['BLOQUEE', 'LITIGE'].includes(d.statut)).reduce((s, d) => s + d.reste, 0),
        beneficiaire: b ? { type: b.type, operateur: b.operateur, beneficiaire: b.beneficiaire, destination: b.destination, statut: b.statut, motif: b.motif } : null,
        reversementEnCours: enCours ? { id: enCours._id.toString(), reference: enCours.reference, statut: enCours.statut, montant: enCours.montant } : null,
      });
    }
    res.json({ success: true, data });
  } catch (e) { erreur(res, e, 'lors de la lecture des entreprises'); }
});

plateforme.put('/beneficiaires/:entrepriseId', async (req, res) => {
  try { res.json({ success: true, data: await Finance.verifierBeneficiaire(req.params.entrepriseId, { valide: Boolean(req.body?.valide), motif: req.body?.motif }, qui(req)) }); } catch (e) { erreur(res, e, 'lors de la vérification des coordonnées'); }
});

plateforme.get('/reversements', async (req, res) => {
  try {
    const filtre = {};
    if (Finance.STATUTS_REVERSEMENT.includes(req.query.statut)) filtre.statut = req.query.statut;
    if (req.query.entreprise) filtre.entrepriseId = String(req.query.entreprise);
    res.json({ success: true, data: await Finance.listerReversements(filtre) });
  } catch (e) { erreur(res, e, 'lors de la lecture des reversements'); }
});

plateforme.post('/reversements', async (req, res) => {
  try {
    const p = await Finance.creerReversement(String(req.body?.entrepriseId || ''), req.body?.montant, qui(req));
    res.status(201).json({ success: true, data: { ...p, id: p._id.toString() } });
  } catch (e) { erreur(res, e, 'lors de la création du reversement'); }
});

plateforme.put('/reversements/:id', async (req, res) => {
  try {
    const p = await Finance.agirReversement(req.params.id, req.body?.action, req.body || {}, qui(req));
    res.json({ success: true, data: { ...p, id: p._id.toString() } });
  } catch (e) { erreur(res, e, 'lors du traitement du reversement'); }
});

plateforme.post('/reversements/:id/preuve', async (req, res) => {
  try {
    const p = await Finance.ajouterPreuve(req.params.id, req.body?.contenu, req.body?.nom, qui(req));
    res.json({ success: true, data: { ...p, id: p._id.toString() } });
  } catch (e) {
    const Verification = require('../services/VerificationService');
    if (e instanceof Verification.ErreurVerification) return res.status(e.status).json({ success: false, message: e.message });
    erreur(res, e, 'lors de l\'envoi de la preuve');
  }
});

plateforme.get('/reversements/:id/preuve', async (req, res) => {
  try { envoyerFichier(res, await Finance.lirePreuve(req.params.id)); } catch (e) { erreur(res, e, 'lors du téléchargement de la preuve'); }
});

plateforme.get('/commission', async (req, res) => {
  try {
    const [actuelle, historique] = await Promise.all([Finance.Commission.regleA(), Finance.Commission.historique()]);
    res.json({ success: true, data: { tauxPourcent: (actuelle?.tauxPb ?? 800) / 100, historique: historique.map(r => ({ tauxPourcent: r.tauxPb / 100, actifDepuis: r.actifDepuis, par: r.par })) } });
  } catch (e) { erreur(res, e, 'lors de la lecture de la commission'); }
});

plateforme.put('/commission', async (req, res) => {
  try {
    const r = await Finance.Commission.changerTaux(req.body?.tauxPourcent, qui(req));
    await Finance.journaliser(qui(req), 'COMMISSION_MODIFIEE', { tauxPourcent: r.tauxPb / 100 });
    res.json({ success: true, data: { tauxPourcent: r.tauxPb / 100, actifDepuis: r.actifDepuis } });
  } catch (e) { erreur(res, e, 'lors du changement de commission'); }
});

plateforme.post('/rapprochements', async (req, res) => {
  try {
    const r = await Rapprochement.lancer({ du: date(req.body?.du), au: date(req.body?.au), verifierPrestataire: Boolean(req.body?.verifierPrestataire) }, qui(req));
    await Finance.journaliser(qui(req), 'RAPPROCHEMENT', { anomalies: r.anomalies.length });
    res.status(201).json({ success: true, data: r });
  } catch (e) { erreur(res, e, 'lors du rapprochement'); }
});

plateforme.get('/rapprochements', async (req, res) => {
  try { res.json({ success: true, data: await Rapprochement.lister() }); } catch (e) { erreur(res, e, 'lors de la lecture des rapprochements'); }
});

plateforme.get('/webhooks', async (req, res) => {
  try {
    const liste = await Finance.webhooks.find({}, { projection: { corps: 0 } }).sort({ derniereReceptionLe: -1 }).limit(100).toArray();
    res.json({ success: true, data: liste.map(w => ({ ...w, id: w._id.toString() })) });
  } catch (e) { erreur(res, e, 'lors de la lecture des notifications'); }
});

plateforme.get('/audit', async (req, res) => {
  try { res.json({ success: true, data: await Finance.audit.find({}).sort({ le: -1 }).limit(200).toArray() }); } catch (e) { erreur(res, e, 'lors de la lecture du journal'); }
});

// ---------- Entreprise ----------

entreprise.get('/', async (req, res) => {
  if (Tenant.estPrincipale()) return res.json({ success: true, data: null }); // la plateforme encaisse pour elle-même
  try { res.json({ success: true, data: await Finance.revenusEntreprise(Tenant.courante()) }); } catch (e) { erreur(res, e, 'lors de la lecture des revenus'); }
});

entreprise.put('/beneficiaire', requireAdmin.proprietaire, async (req, res) => {
  if (Tenant.estPrincipale()) return res.status(409).json({ success: false, message: 'Réservé aux entreprises' });
  try {
    await Finance.enregistrerBeneficiaire(Tenant.courante(), req.body || {}, qui(req));
    res.json({ success: true, data: await Finance.revenusEntreprise(Tenant.courante()) });
  } catch (e) { erreur(res, e, 'lors de l\'enregistrement des coordonnées'); }
});

module.exports = { plateforme, entreprise };
