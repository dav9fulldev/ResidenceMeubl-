import React, { useState } from 'react';
import { FaFlag, FaTimes, FaCheckCircle } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest } from '../config/api';
import './SignalerAnnonce.css';

const MOTIFS = [
  ['fausse_annonce', 'Ce logement n\'existe pas ou n\'est pas à louer'],
  ['photos_trompeuses', 'Les photos ne correspondent pas au logement'],
  ['adresse', 'L\'adresse est fausse'],
  ['paiement_hors_plateforme', 'On m\'a demandé de payer en dehors de BABI RESIDENCE'],
  ['autre', 'Autre problème'],
];

/** Lien « Signaler cette annonce » et formulaire envoyé à l'équipe de BABI RESIDENCE. */
const SignalerAnnonce = ({ residenceId }) => {
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState({ motif: '', message: '', email: '' });
  const [etat, setEtat] = useState({ enCours: false, erreur: '', ok: false });

  const envoyer = async (e) => {
    e.preventDefault();
    setEtat({ enCours: true, erreur: '', ok: false });
    try {
      await apiRequest(API_ENDPOINTS.residences.report(residenceId), { method: 'POST', body: f });
      setEtat({ enCours: false, erreur: '', ok: true });
    } catch (error) {
      setEtat({ enCours: false, erreur: error.message, ok: false });
    }
  };
  const fermer = () => { setOuvert(false); setEtat({ enCours: false, erreur: '', ok: false }); setF({ motif: '', message: '', email: '' }); };

  return (
    <>
      <button type="button" className="signaler-lien" onClick={() => setOuvert(true)}><FaFlag aria-hidden="true" /> Signaler cette annonce</button>
      {ouvert && (
        <div className="signaler-fond" role="dialog" aria-modal="true" aria-labelledby="signaler-titre" onClick={fermer}>
          <div className="signaler-boite" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="signaler-fermer" onClick={fermer} aria-label="Fermer"><FaTimes /></button>
            {etat.ok ? (
              <div className="signaler-merci">
                <FaCheckCircle aria-hidden="true" />
                <h2 id="signaler-titre">Merci pour votre signalement</h2>
                <p>Notre équipe va examiner cette annonce. Si on vous a demandé de payer en dehors du site, ne versez rien.</p>
                <button type="button" className="btn btn-primary" onClick={fermer}>Fermer</button>
              </div>
            ) : (
              <form onSubmit={envoyer}>
                <h2 id="signaler-titre">Signaler cette annonce</h2>
                <fieldset>
                  <legend>Quel est le problème ?</legend>
                  {MOTIFS.map(([valeur, libelle]) => (
                    <label key={valeur} className={f.motif === valeur ? 'actif' : ''}>
                      <input type="radio" name="motif" value={valeur} checked={f.motif === valeur} onChange={() => setF(v => ({ ...v, motif: valeur }))} required />
                      {libelle}
                    </label>
                  ))}
                </fieldset>
                <label className="signaler-champ" htmlFor="signaler-message">Précisions (facultatif)
                  <textarea id="signaler-message" rows={3} maxLength={1000} value={f.message} onChange={(e) => setF(v => ({ ...v, message: e.target.value }))} />
                </label>
                <label className="signaler-champ" htmlFor="signaler-email">Votre email, si vous acceptez d'être recontacté (facultatif)
                  <input id="signaler-email" type="email" maxLength={254} value={f.email} onChange={(e) => setF(v => ({ ...v, email: e.target.value }))} />
                </label>
                {etat.erreur && <p className="signaler-erreur" role="alert">{etat.erreur}</p>}
                <button type="submit" className="btn btn-primary" disabled={etat.enCours || !f.motif}>{etat.enCours ? 'Envoi…' : 'Envoyer le signalement'}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default SignalerAnnonce;
