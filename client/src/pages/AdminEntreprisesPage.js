import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FaCheck, FaBan, FaUndo, FaEnvelope, FaPhone, FaHome, FaCalendarAlt } from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import './AdminEntreprisesPage.css';

const STATUTS = {
  en_attente: { libelle: 'À valider', classe: 'attente' },
  validee: { libelle: 'Validée', classe: 'validee' },
  suspendue: { libelle: 'Suspendue', classe: 'suspendue' },
};
const FILTRES = [['tous', 'Toutes'], ['en_attente', 'À valider'], ['validee', 'Validées'], ['suspendue', 'Suspendues']];
const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Administrateur de la plateforme : entreprises inscrites, validation et suspension. */
const AdminEntreprisesPage = () => {
  const { adminRequest } = useResidences();
  const { compte, recharger } = useCompte();
  const [liste, setListe] = useState(null);
  const [filtre, setFiltre] = useState('tous');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(null);
  const [suspension, setSuspension] = useState(null); // { id, nom, motif }

  const charger = useCallback(async () => {
    try {
      setListe((await adminRequest(API_ENDPOINTS.admin.companies)).data);
    } catch (e) {
      setErreur(e.message);
    }
  }, [adminRequest]);
  useEffect(() => { charger(); }, [charger]);

  const changer = async (id, statut, motif = '') => {
    setEnCours(id);
    setErreur('');
    try {
      await adminRequest(API_ENDPOINTS.admin.companyStatus(id), { method: 'PUT', body: { statut, motif } });
      await charger();
      recharger(); // compteur « à valider » du menu
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnCours(null);
      setSuspension(null);
    }
  };

  const visibles = useMemo(() => (liste || []).filter(e => filtre === 'tous' || e.statut === filtre), [liste, filtre]);
  const compter = (s) => (liste || []).filter(e => e.statut === s).length;

  if (compte && !compte.superAdmin) return <Navigate to="/admin/dashboard" replace />;

  return (
    <div className="entreprises-page">
      <header className="admin-page-header">
        <div>
          <h1>Entreprises</h1>
          <p>Les résidences d'une entreprise n'apparaissent sur le site qu'une fois l'entreprise validée.</p>
        </div>
      </header>

      <div className="ent-filtres" role="tablist" aria-label="Filtrer les entreprises">
        {FILTRES.map(([cle, libelle]) => (
          <button key={cle} type="button" role="tab" aria-selected={filtre === cle} className={filtre === cle ? 'actif' : ''} onClick={() => setFiltre(cle)}>
            {libelle}{cle !== 'tous' && liste ? <span>{compter(cle)}</span> : null}
          </button>
        ))}
      </div>

      {erreur && <div className="error-message" role="alert">{erreur}</div>}
      {!liste && !erreur && <p className="ent-vide">Chargement…</p>}
      {liste && visibles.length === 0 && <p className="ent-vide">Aucune entreprise dans cette catégorie.</p>}

      <ul className="ent-liste">
        {visibles.map(e => {
          const s = STATUTS[e.statut] || STATUTS.en_attente;
          const g = e.gestionnaires[0];
          return (
            <li key={e.id} className="ent-carte">
              <div className="ent-tete">
                <div>
                  <h2>{e.nom}{e.principale && <small> · compte de la plateforme</small>}{e.interne && <small> · résidences de la plateforme</small>}</h2>
                  <p className="ent-date">Inscrite le {date(e.creeLe)}{e.valideeLe ? ` · validée le ${date(e.valideeLe)}` : ''}</p>
                </div>
                <span className={`ent-statut ${s.classe}`}>{s.libelle}</span>
              </div>

              {g && (
                <div className="ent-contact">
                  <span>{g.prenom} {g.nom}</span>
                  <a href={`mailto:${g.email}`}><FaEnvelope aria-hidden="true" /> {g.email}</a>
                  {g.telephone && <a href={`tel:${g.telephone.replace(/\s/g, '')}`}><FaPhone aria-hidden="true" /> {g.telephone}</a>}
                </div>
              )}

              <div className="ent-chiffres">
                <span><FaHome aria-hidden="true" /> {e.residences} résidence{e.residences > 1 ? 's' : ''}</span>
                <span><FaCalendarAlt aria-hidden="true" /> {e.reservations} réservation{e.reservations > 1 ? 's' : ''}</span>
              </div>
              {e.motif && e.statut === 'suspendue' && <p className="ent-motif">Motif : {e.motif}</p>}

              {!e.principale && !e.interne && (
                <div className="ent-actions">
                  {e.statut !== 'validee' && (
                    <button type="button" className="btn btn-primary" disabled={enCours === e.id} onClick={() => changer(e.id, 'validee')}>
                      {e.statut === 'suspendue' ? <><FaUndo aria-hidden="true" /> Réactiver</> : <><FaCheck aria-hidden="true" /> Valider</>}
                    </button>
                  )}
                  {e.statut !== 'suspendue' && (
                    <button type="button" className="btn btn-outline ent-suspendre" disabled={enCours === e.id} onClick={() => setSuspension({ id: e.id, nom: e.nom, motif: '' })}>
                      <FaBan aria-hidden="true" /> {e.statut === 'en_attente' ? 'Refuser' : 'Suspendre'}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {suspension && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="susp-titre" onClick={() => setSuspension(null)}>
          <form className="admin-modal" onClick={(ev) => ev.stopPropagation()} onSubmit={(ev) => { ev.preventDefault(); changer(suspension.id, 'suspendue', suspension.motif); }}>
            <h2 id="susp-titre">Suspendre {suspension.nom} ?</h2>
            <p>Ses résidences ne seront plus visibles et son espace de gestion sera fermé. Le gestionnaire est prévenu par email.</p>
            <label htmlFor="susp-motif">Message au gestionnaire (facultatif)</label>
            <textarea id="susp-motif" rows={3} maxLength={500} value={suspension.motif} onChange={(ev) => setSuspension(v => ({ ...v, motif: ev.target.value }))} />
            <div className="ent-actions">
              <button type="button" className="btn btn-outline" onClick={() => setSuspension(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary ent-confirmer-suspension">Suspendre</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminEntreprisesPage;
