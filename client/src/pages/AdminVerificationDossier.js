import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FaArrowLeft, FaCamera, FaCheckCircle, FaExclamationTriangle, FaFileAlt, FaMapMarkerAlt, FaPaperPlane,
  FaPlus, FaShieldAlt, FaTrash, FaCrosshairs, FaExternalLinkAlt,
} from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { VERIFICATION } from '../components/AdminPanel';
import { ImagePrivee, ouvrirPrive } from '../components/admin/FichierPrive';
import { compresserImage, fichierEnBase64, positionActuelle } from '../utils/fichiers';
import './AdminVerification.css';

const taille = (o) => (o > 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1024))} ko`);
const date = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const carte = (g) => `https://www.google.com/maps?q=${g.lat},${g.lng}`;
export const distanceTexte = (m) => (m == null ? 'Position non transmise' : m < 1000 ? `à ${m} m de l'adresse déclarée` : `à ${(m / 1000).toFixed(1)} km de l'adresse déclarée`);
export const distanceClasse = (m) => (m == null ? 'inconnue' : m <= 200 ? 'proche' : m <= 1000 ? 'moyenne' : 'loin');

/**
 * Dossier de vérification d'une résidence (gestionnaire) : photos de l'annonce, localisation,
 * justificatifs, photos prises sur place avec le code, puis envoi à BABI RESIDENCE.
 */
const AdminVerificationDossier = () => {
  const { id } = useParams();
  const { adminRequest, addResidencePhoto, removeResidencePhoto } = useResidences();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState('');
  const [ok, setOk] = useState('');
  const [enCours, setEnCours] = useState('');
  const [gps, setGps] = useState({ lat: '', lng: '' });
  const inputs = useRef({});

  const charger = useCallback(async () => {
    try {
      const r = (await adminRequest(API_ENDPOINTS.admin.verification(id))).data;
      setD(r);
      if (r.gps) setGps({ lat: String(r.gps.lat), lng: String(r.gps.lng) });
    } catch (e) {
      setErreur(e.message);
    }
  }, [adminRequest, id]);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { document.title = 'Vérification · BABI Admin'; }, []);

  const action = async (cle, fn, message) => {
    setEnCours(cle); setErreur(''); setOk('');
    try {
      const r = await fn();
      if (r && r.statut) setD(r); else await charger();
      if (message) setOk(message);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnCours('');
    }
  };
  const appel = (suffixe, options) => adminRequest(`${API_ENDPOINTS.admin.verification(id)}${suffixe}`, options).then(r => r.data);

  if (!d) return <p className="verif-chargement">{erreur || 'Chargement…'}</p>;
  const v = VERIFICATION[d.statut] || { libelle: d.libelle, classe: 'neutre' };
  const modifiable = d.modifiable;
  const peutEnvoyer = ['brouillon', 'a_completer', 'refusee'].includes(d.statut);

  const ajouterPhotos = (files) => action('photos', async () => {
    for (const f of files) await addResidencePhoto(id, f);
  }, `${files.length} photo(s) ajoutée(s).`);

  const ajouterDocument = (type, file) => action(`doc-${type}`, async () => appel('/documents', {
    method: 'POST', body: { type, nom: file.name, contenu: file.type.startsWith('image/') ? await compresserImage(file, { cote: 2200, qualite: 0.85 }) : await fichierEnBase64(file) },
  }), 'Document ajouté.');

  const ajouterPreuve = (type, file) => action(`preuve-${type}`, async () => {
    const [position, contenu] = await Promise.all([positionActuelle(), compresserImage(file)]);
    return appel('/preuves', { method: 'POST', body: { type, contenu, gps: position } });
  }, 'Photo ajoutée.');

  const choisir = (cle) => inputs.current[cle]?.click();
  const fichierInput = (cle, props, onFiles) => (
    <input ref={el => { inputs.current[cle] = el; }} type="file" hidden {...props}
      onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) onFiles(files); }} />
  );

  return (
    <div className="verif-page">
      <Link to="/admin/residences" className="verif-retour"><FaArrowLeft aria-hidden="true" /> Résidences</Link>
      <header className="admin-page-header verif-entete">
        <div>
          <h1>{d.residence.nom}</h1>
          <p>Vérification par BABI RESIDENCE : la résidence n'apparaît sur le site qu'une fois vérifiée.</p>
        </div>
        <span className={`adm-badge ${v.classe}`}><FaShieldAlt aria-hidden="true" /> {v.libelle}</span>
      </header>

      {d.motif && ['a_completer', 'refusee', 'suspendue'].includes(d.statut) && (
        <div className="verif-alerte" role="alert"><FaExclamationTriangle aria-hidden="true" /><p><strong>Message de l'équipe :</strong> {d.motif}</p></div>
      )}
      {['en_attente', 'en_verification'].includes(d.statut) && (
        <div className="verif-info" role="status"><FaShieldAlt aria-hidden="true" /><p>Dossier envoyé{d.soumiseLe ? ` le ${date(d.soumiseLe)}` : ''}. Notre équipe l'examine ; vous serez prévenu par email.{d.statut === 'en_verification' ? ' Pendant l\'examen, le dossier ne peut plus être modifié.' : ''}</p></div>
      )}
      {d.statut === 'verifiee' && (
        <div className="verif-ok" role="status"><FaCheckCircle aria-hidden="true" /><p>Résidence vérifiée et publiée. Modifier l'adresse, les photos ou les justificatifs la renverra en vérification.</p></div>
      )}
      {erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {erreur}</p>}
      {ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {ok}</p>}

      {/* 1. Photos de l'annonce */}
      <section className="adm-carte verif-bloc" aria-labelledby="v-photos">
        <h2 id="v-photos"><span>1</span> Photos de l'annonce</h2>
        <p className="verif-aide">Vos propres photos du logement, sans montage ni logo ({d.photosMin} au moins). Elles sont publiées sur le site une fois la résidence vérifiée.</p>
        <div className="verif-photos">
          {d.residence.photos.map(url => (
            <figure key={url}>
              <img src={url} alt="" loading="lazy" />
              {modifiable && (
                <button type="button" className="verif-retirer" disabled={!!enCours} aria-label="Retirer cette photo"
                  onClick={() => window.confirm('Retirer cette photo ?') && action('photos', () => removeResidencePhoto(id, url), 'Photo retirée.')}><FaTrash /></button>
              )}
            </figure>
          ))}
          {modifiable && (
            <button type="button" className="verif-ajout" onClick={() => choisir('photos')} disabled={!!enCours}>
              <FaPlus aria-hidden="true" /> {enCours === 'photos' ? 'Envoi…' : 'Ajouter des photos'}
            </button>
          )}
        </div>
        {fichierInput('photos', { accept: 'image/*', multiple: true }, ajouterPhotos)}
      </section>

      {/* 2. Localisation */}
      <section className="adm-carte verif-bloc" aria-labelledby="v-gps">
        <h2 id="v-gps"><span>2</span> Localisation exacte</h2>
        <p className="verif-aide">Le plus simple : sur place, avec votre téléphone, touchez « Utiliser ma position ». Sinon, copiez les coordonnées depuis Google Maps (appui long sur le logement).</p>
        <div className="verif-gps">
          <label>Latitude<input inputMode="decimal" value={gps.lat} onChange={(e) => setGps(g => ({ ...g, lat: e.target.value }))} disabled={!modifiable} placeholder="5.3600" /></label>
          <label>Longitude<input inputMode="decimal" value={gps.lng} onChange={(e) => setGps(g => ({ ...g, lng: e.target.value }))} disabled={!modifiable} placeholder="-3.9500" /></label>
        </div>
        {modifiable && (
          <div className="verif-actions">
            <button type="button" className="adm-btn" disabled={!!enCours} onClick={async () => {
              setEnCours('position');
              const p = await positionActuelle();
              setEnCours('');
              if (p) setGps({ lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }); else setErreur('Position indisponible : autorisez la localisation dans le navigateur.');
            }}><FaCrosshairs /> {enCours === 'position' ? 'Localisation…' : 'Utiliser ma position'}</button>
            <button type="button" className="adm-btn principal" disabled={!!enCours || !gps.lat || !gps.lng}
              onClick={() => action('gps', () => appel('/gps', { method: 'PUT', body: { lat: Number(gps.lat.replace(',', '.')), lng: Number(gps.lng.replace(',', '.')) } }), 'Position enregistrée.')}>
              <FaMapMarkerAlt /> Enregistrer la position
            </button>
          </div>
        )}
        {d.gps && <a className="verif-lien" href={carte(d.gps)} target="_blank" rel="noopener noreferrer"><FaExternalLinkAlt aria-hidden="true" /> Vérifier sur Google Maps</a>}
      </section>

      {/* 3. Justificatifs */}
      <section className="adm-carte verif-bloc" aria-labelledby="v-docs">
        <h2 id="v-docs"><span>3</span> Justificatifs</h2>
        <p className="verif-aide">PDF ou photo lisible, 5 Mo au plus. Ils restent privés : seule l'équipe de BABI RESIDENCE les consulte. Il faut prouver que vous êtes <strong>autorisé à louer</strong> ce logement, pas forcément que vous en êtes propriétaire.</p>
        <ul className="verif-docs">
          {Object.entries(d.types.documents).map(([type, t]) => {
            const docs = d.documents.filter(x => x.type === type);
            return (
              <li key={type} className={docs.length ? 'fait' : ''}>
                <div className="verif-doc-tete">
                  {docs.length ? <FaCheckCircle className="ok" aria-hidden="true" /> : <FaFileAlt aria-hidden="true" />}
                  <p>{t.libelle}{t.requis ? <em> · obligatoire</em> : <em> · facultatif</em>}</p>
                  {modifiable && <button type="button" className="adm-btn" disabled={!!enCours} onClick={() => choisir(`doc-${type}`)}><FaPlus /> {enCours === `doc-${type}` ? 'Envoi…' : 'Ajouter'}</button>}
                </div>
                {docs.map(f => (
                  <div key={f.id} className="verif-fichier">
                    <button type="button" className="verif-nom" onClick={() => ouvrirPrive(API_ENDPOINTS.admin.verificationFile(id, f.id))}>{f.nom}</button>
                    <span>{taille(f.taille)}</span>
                    {modifiable && <button type="button" className="verif-retirer-doc" aria-label={`Retirer ${f.nom}`} disabled={!!enCours}
                      onClick={() => window.confirm(`Retirer « ${f.nom} » ?`) && action('retrait', () => appel(`/fichiers/${f.id}`, { method: 'DELETE' }), 'Document retiré.')}><FaTrash /></button>}
                  </div>
                ))}
                {fichierInput(`doc-${type}`, { accept: 'application/pdf,image/*' }, (files) => ajouterDocument(type, files[0]))}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 4. Preuves sur place */}
      <section className="adm-carte verif-bloc" aria-labelledby="v-preuves">
        <h2 id="v-preuves"><span>4</span> Photos prises sur place</h2>
        <div className="verif-code">
          <p>Écrivez ce code sur une feuille et tenez-la visible sur chaque photo :</p>
          <strong aria-label={`Code ${d.code.split('').join(' ')}`}>{d.code}</strong>
        </div>
        <p className="verif-aide">Prenez les photos <strong>avec votre téléphone, devant le logement</strong> et autorisez la localisation : sa position est comparée à l'adresse déclarée.</p>
        <ul className="verif-preuves">
          {Object.entries(d.types.preuves).map(([type, t]) => {
            const preuves = d.preuves.filter(x => x.type === type);
            return (
              <li key={type}>
                <div className="verif-doc-tete">
                  {preuves.length ? <FaCheckCircle className="ok" aria-hidden="true" /> : <FaCamera aria-hidden="true" />}
                  <p>{t.libelle}</p>
                  {modifiable && <button type="button" className="adm-btn principal" disabled={!!enCours} onClick={() => choisir(`preuve-${type}`)}><FaCamera /> {enCours === `preuve-${type}` ? 'Envoi…' : 'Prendre la photo'}</button>}
                </div>
                <div className="verif-preuves-liste">
                  {preuves.map(p => (
                    <figure key={p.id}>
                      <ImagePrivee url={API_ENDPOINTS.admin.verificationFile(id, p.id)} alt={t.libelle} />
                      <figcaption className={`verif-distance ${distanceClasse(p.distanceM)}`}>{distanceTexte(p.distanceM)}</figcaption>
                      {modifiable && <button type="button" className="verif-retirer" aria-label="Retirer cette photo" disabled={!!enCours}
                        onClick={() => window.confirm('Retirer cette photo ?') && action('retrait', () => appel(`/fichiers/${p.id}`, { method: 'DELETE' }), 'Photo retirée.')}><FaTrash /></button>}
                    </figure>
                  ))}
                </div>
                {fichierInput(`preuve-${type}`, { accept: 'image/*', capture: 'environment' }, (files) => ajouterPreuve(type, files[0]))}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Envoi */}
      {peutEnvoyer && (
        <section className="adm-carte verif-bloc verif-envoi">
          {d.manquants.length > 0 ? (
            <>
              <h2>Il manque encore</h2>
              <ul className="verif-manquants">{d.manquants.map(m => <li key={m}>{m}</li>)}</ul>
            </>
          ) : <h2><FaCheckCircle className="ok" aria-hidden="true" /> Dossier complet</h2>}
          <p className="verif-aide">En envoyant ce dossier, vous certifiez que les informations et documents sont exacts et que vous êtes autorisé à louer ce logement. Une fausse déclaration entraîne la suspension du compte.</p>
          <button type="button" className="btn btn-primary" disabled={!!enCours || d.manquants.length > 0}
            onClick={() => action('envoi', () => appel('/soumettre', { method: 'POST' }), 'Dossier envoyé. Vous serez prévenu par email de la décision.')}>
            <FaPaperPlane /> {enCours === 'envoi' ? 'Envoi…' : 'Envoyer le dossier à BABI RESIDENCE'}
          </button>
        </section>
      )}

      {d.historique.length > 0 && (
        <section className="adm-carte verif-bloc">
          <h2>Historique</h2>
          <ol className="verif-historique">
            {[...d.historique].reverse().map((h, i) => (
              <li key={i}><span>{date(h.le)}</span> <b>{VERIFICATION[h.statut]?.libelle || h.statut}</b>{h.motif ? ` — ${h.motif}` : ''}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
};

export default AdminVerificationDossier;
