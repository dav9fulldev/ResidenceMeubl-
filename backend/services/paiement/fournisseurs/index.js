/**
 * Registre des moyens de paiement.
 * Ajouter un moyen = créer son module dans ce dossier (même forme que pispi.js) et l'ajouter à FOURNISSEURS.
 */
const Settings = require('../../SettingsService');

const FOURNISSEURS = [require('./pispi'), require('./geniuspay')];

const parId = (id) => FOURNISSEURS.find(f => f.id === id) || null;

class ErreurMoyen extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** État d'un moyen : configuré sur le serveur ? activable ? activé par l'admin ? */
function etat(f) {
  const configure = !f.aVenir && f.estConfigure();
  return {
    id: f.id,
    nom: f.nom,
    organisme: f.organisme,
    description: f.description,
    modes: f.modes,
    capacites: f.capacites,
    aVenir: f.aVenir,
    configure,
    problemes: f.aVenir ? [] : f.problemes(),
    activable: configure,
    actif: configure && Settings.moyenActif(f.id),
    variables: f.variables,
  };
}

const liste = () => FOURNISSEURS.map(etat);
const actifs = () => liste().filter(m => m.actif);

async function activer(id, actif) {
  const f = parId(id);
  if (!f) throw new ErreurMoyen('Moyen de paiement inconnu', 404);
  if (actif && f.aVenir) throw new ErreurMoyen(`${f.nom} n'est pas encore intégré : il ne peut pas être activé`);
  if (actif && !f.estConfigure()) throw new ErreurMoyen(`${f.nom} n'est pas configuré sur le serveur : ${f.problemes().join(', ')}`);
  await Settings.modifierMoyen(id, actif);
  return etat(f);
}

module.exports = { FOURNISSEURS, parId, etat, liste, actifs, activer, ErreurMoyen };
