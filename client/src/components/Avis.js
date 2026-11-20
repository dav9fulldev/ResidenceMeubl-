import React, { useEffect, useState } from 'react';
import { FaStar, FaRegStar } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest } from '../config/api';
import './Avis.css';

/**
 * Service de notation : étoiles, avis d'une résidence et formulaire du voyageur.
 */
export const CRITERES = {
  proprete: 'Propreté',
  conformite: 'Conformité à l\'annonce',
  accueil: 'Accueil et communication',
  qualitePrix: 'Rapport qualité-prix',
};
const LIBELLES_NOTE = ['', 'Très décevant', 'Décevant', 'Correct', 'Très bien', 'Excellent'];
const moisAnnee = (d) => new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

/** Affichage : 5 étoiles, pleines selon la note arrondie */
export const Etoiles = ({ note, taille = 'normale' }) => (
  <span className={`etoiles etoiles-${taille}`} role="img" aria-label={`${note} sur 5`}>
    {[1, 2, 3, 4, 5].map(i => (i <= Math.round(note) ? <FaStar key={i} aria-hidden="true" /> : <FaRegStar key={i} aria-hidden="true" />))}
  </span>
);

/** Saisie : groupe de boutons radio (clavier et lecteurs d'écran) */
const ChoixEtoiles = ({ nom, libelle, valeur, onChange }) => (
  <fieldset className="choix-etoiles">
    <legend>{libelle}</legend>
    <div className="choix-etoiles-ligne">
      {[1, 2, 3, 4, 5].map(i => (
        <label key={i} className={i <= valeur ? 'pleine' : ''}>
          <input type="radio" name={nom} value={i} checked={valeur === i} onChange={() => onChange(i)} />
          <span className="sr-seul">{i} étoile{i > 1 ? 's' : ''}</span>
          {i <= valeur ? <FaStar aria-hidden="true" /> : <FaRegStar aria-hidden="true" />}
        </label>
      ))}
      <span className="choix-etoiles-libelle" aria-hidden="true">{LIBELLES_NOTE[valeur] || ''}</span>
    </div>
  </fieldset>
);

/** Fiche résidence : moyenne, critères et avis des voyageurs */
export const AvisResidence = ({ residenceId }) => {
  const [d, setD] = useState(null);
  useEffect(() => {
    let actif = true;
    apiRequest(API_ENDPOINTS.residences.reviews(residenceId))
      .then(r => { if (actif) setD(r.data); })
      .catch(() => { if (actif) setD({ nombre: 0, avis: [] }); });
    return () => { actif = false; };
  }, [residenceId]);

  if (!d) return null;
  return (
    <section className="rd-section avis-residence" id="avis">
      <h2>Avis des voyageurs</h2>
      {d.nombre === 0 ? (
        <p className="avis-vide">Pas encore d'avis. Seuls les voyageurs qui ont séjourné ici peuvent noter la résidence.</p>
      ) : (
        <>
          <div className="avis-resume">
            <p className="avis-moyenne"><FaStar aria-hidden="true" /> <strong>{d.moyenne.toLocaleString('fr-FR')}</strong><span>· {d.nombre} avis</span></p>
            <dl className="avis-criteres">
              {Object.entries(CRITERES).map(([k, libelle]) => (
                <div key={k}>
                  <dt>{libelle}</dt>
                  <dd>
                    <span className="avis-barre" aria-hidden="true"><span style={{ width: `${(d.criteres[k] / 5) * 100}%` }} /></span>
                    <b>{d.criteres[k].toLocaleString('fr-FR')}</b>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <ul className="avis-liste">
            {d.avis.map(a => (
              <li key={a.id}>
                <p className="avis-entete"><b>{a.auteur}</b><span>{moisAnnee(a.creeLe)}</span></p>
                <Etoiles note={a.note} taille="petite" />
                {a.commentaire && <p className="avis-texte">{a.commentaire}</p>}
                {a.reponse && (
                  <div className="avis-reponse">
                    <p><b>Réponse du partenaire</b></p>
                    <p>{a.reponse.texte}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="avis-garantie">Avis vérifiés : seuls les voyageurs ayant séjourné via BABI RESIDENCE peuvent noter.</p>
        </>
      )}
    </section>
  );
};

/** « Mes réservations » : le voyageur note son séjour terminé */
export const FormulaireAvis = ({ reservationId, token, onEnvoye, onAnnuler }) => {
  const [note, setNote] = useState(0);
  const [criteres, setCriteres] = useState({ proprete: 0, conformite: 0, accueil: 0, qualitePrix: 0 });
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const envoyer = async (e) => {
    e.preventDefault();
    if (!note || Object.values(criteres).some(v => !v)) return setErreur('Donnez une note globale et notez les quatre critères.');
    setEnCours(true);
    setErreur('');
    try {
      const r = await apiRequest(API_ENDPOINTS.client.review(reservationId), { method: 'POST', token, body: { note, criteres, commentaire } });
      onEnvoye(note, r.message);
    } catch (err) {
      setErreur(err.message);
      setEnCours(false);
    }
  };

  return (
    <form className="formulaire-avis" onSubmit={envoyer}>
      <ChoixEtoiles nom={`note-${reservationId}`} libelle="Votre note globale" valeur={note} onChange={setNote} />
      <div className="formulaire-avis-criteres">
        {Object.entries(CRITERES).map(([k, libelle]) => (
          <ChoixEtoiles key={k} nom={`${k}-${reservationId}`} libelle={libelle} valeur={criteres[k]} onChange={(v) => setCriteres(c => ({ ...c, [k]: v }))} />
        ))}
      </div>
      <label htmlFor={`commentaire-${reservationId}`}>Votre commentaire <span className="facultatif">(facultatif, visible sur la fiche)</span></label>
      <textarea id={`commentaire-${reservationId}`} rows={4} maxLength={1000} value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
        placeholder="Ce qui vous a plu, ce qui pourrait être amélioré…" />
      {erreur && <div className="error-message" role="alert">{erreur}</div>}
      <div className="formulaire-avis-actions">
        <button type="submit" className="btn btn-primary" disabled={enCours}>{enCours ? 'Envoi…' : 'Publier mon avis'}</button>
        <button type="button" className="btn btn-outline" onClick={onAnnuler}>Annuler</button>
      </div>
      <p className="avis-garantie">Votre prénom et l'initiale de votre nom seront affichés. Un avis ne peut plus être modifié une fois publié.</p>
    </form>
  );
};
