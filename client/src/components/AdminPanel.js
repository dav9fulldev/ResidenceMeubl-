import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaPlus, FaTrash, FaSearch, FaTools, FaCheck, FaRegCalendarAlt, FaPen, FaUsers, FaBed, FaTimes, FaSave,
} from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import AddResidenceForm from './AddResidenceForm';
import './AdminPanel.css';

const STATUTS = {
  disponible: { libelle: 'Disponible', classe: 'confirmee' },
  'réservé': { libelle: 'Dates prises', classe: 'attente' },
  'occupé': { libelle: 'Occupée', classe: 'demande' },
  maintenance: { libelle: 'Maintenance', classe: 'maintenance' },
};

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

/**
 * Gestion des résidences : cartes visuelles, filtres par statut, maintenance en un clic,
 * panneau de modification (statut, durée des séjours).
 */
const AdminPanel = () => {
  const navigate = useNavigate();
  const { residences, updateResidenceStatus, updateStayLimits, addResidence, deleteResidence } = useResidences();

  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [filtre, setFiltre] = useState('');
  const [recherche, setRecherche] = useState('');
  const [editingResidence, setEditingResidence] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editForm, setEditForm] = useState({});

  const runAction = async (action, ok = '') => {
    setSaving(true); setActionError(''); setNotice('');
    try {
      await action();
      if (ok) setNotice(ok);
      return true;
    } catch (error) {
      setActionError(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (residence) => {
    setEditingResidence(residence);
    setEditForm({
      status: residence.availability.status,
      currentOccupant: residence.availability.currentOccupant || '',
      checkIn: residence.availability.checkIn || '',
      checkOut: residence.availability.checkOut || '',
      nextAvailable: residence.availability.nextAvailable || '',
      minStay: residence.availability.minStay ?? 2,
      maxStay: residence.availability.maxStay ?? 30,
    });
  };

  const handleDelete = (residence) => {
    if (window.confirm(`Supprimer définitivement « ${residence.name} » ?`)) {
      runAction(() => deleteResidence(residence.id), `« ${residence.name} » supprimée.`);
      if (editingResidence?.id === residence.id) setEditingResidence(null);
    }
  };

  const handleAdd = async (newResidence) => {
    const ok = await runAction(() => addResidence(newResidence), 'Résidence ajoutée.');
    if (ok) setShowAddForm(false);
  };

  const basculerMaintenance = (residence) => {
    const enMaintenance = residence.availability.status === 'maintenance';
    runAction(
      () => updateResidenceStatus(residence.id, enMaintenance ? 'disponible' : 'maintenance'),
      enMaintenance ? `« ${residence.name} » est de nouveau réservable.` : `« ${residence.name} » est en maintenance : plus de réservation possible.`
    );
  };

  const handleSave = async () => {
    if (!editingResidence || !editForm.status) return;
    if (Number(editForm.minStay) > Number(editForm.maxStay)) {
      setActionError('Le séjour minimum doit être inférieur ou égal au maximum.');
      return;
    }
    const a = editingResidence.availability;
    const statutChange = editForm.status !== a.status || !a.automatic;
    const sejourChange = Number(editForm.minStay) !== a.minStay || Number(editForm.maxStay) !== a.maxStay;
    const ok = await runAction(async () => {
      if (sejourChange) await updateStayLimits(editingResidence.id, editForm.minStay, editForm.maxStay);
      // Un statut calculé automatiquement depuis une réservation n'est pas transformé en statut manuel
      if (statutChange) {
        await updateResidenceStatus(editingResidence.id, editForm.status, {
          currentOccupant: editForm.currentOccupant,
          checkIn: editForm.checkIn,
          checkOut: editForm.checkOut,
          nextAvailable: editForm.nextAvailable,
        });
      }
    }, 'Modifications enregistrées.');
    if (ok) setEditingResidence(null);
  };

  const compte = (s) => residences.filter(r => r.availability.status === s).length;
  const q = recherche.trim().toLowerCase();
  const visibles = residences
    .filter(r => !filtre || r.availability.status === filtre)
    .filter(r => !q || `${r.name} ${r.reference} ${r.location} ${r.neighborhood}`.toLowerCase().includes(q));

  const champ = (cle) => ({ value: editForm[cle] ?? '', onChange: (e) => setEditForm(prev => ({ ...prev, [cle]: e.target.value })) });

  return (
    <div className="admin-panel">
      <div className="res-outils">
        <label className="resa-recherche">
          <FaSearch aria-hidden="true" />
          <input type="search" placeholder="Nom, quartier, référence…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher une résidence" />
        </label>
        <button type="button" className="adm-btn principal" onClick={() => setShowAddForm(true)}>
          <FaPlus /> Ajouter une résidence
        </button>
      </div>

      <div className="adm-onglets" role="tablist" aria-label="Filtrer par statut">
        {[['', 'Toutes', residences.length], ...Object.entries(STATUTS).map(([s, v]) => [s, v.libelle, compte(s)])].map(([valeur, libelle, n]) => (
          <button key={valeur || 'toutes'} type="button" role="tab" aria-selected={filtre === valeur}
            className={`adm-onglet ${filtre === valeur ? 'actif' : ''}`} onClick={() => setFiltre(valeur)}>
            {libelle} <span className="adm-compte">{n}</span>
          </button>
        ))}
      </div>

      {actionError && <div className="res-message erreur" role="alert">{actionError}</div>}
      {notice && <div className="res-message ok" role="status">{notice}</div>}

      <div className={`adm-maitre-detail ${editingResidence ? '' : 'sans-detail'}`}>
        <div className="res-grille">
          {visibles.length === 0 && <p className="adm-vide">Aucune résidence ne correspond.</p>}
          {visibles.map((residence) => {
            const st = STATUTS[residence.availability.status] || { libelle: residence.availability.status, classe: 'neutre' };
            const maintenance = residence.availability.status === 'maintenance';
            return (
              <article key={residence.id} className={`adm-carte res-carte ${maintenance ? 'en-maintenance' : ''} ${editingResidence?.id === residence.id ? 'choisie' : ''}`}>
                <div className="res-photo">
                  {residence.images?.[0] && <img src={residence.images[0]} alt="" loading="lazy" />}
                  <span className={`adm-badge ${st.classe}`}>{st.libelle}</span>
                  {maintenance && <span className="res-voile"><FaTools /> Non réservable</span>}
                </div>
                <div className="res-corps">
                  <div className="res-tete">
                    <h3>{residence.name}</h3>
                    <span className="res-prix">{Number(residence.price).toLocaleString('fr-FR')} <small>FCFA / nuit</small></span>
                  </div>
                  <p className="res-lieu">{residence.location} · <span>Réf. {residence.reference}</span></p>
                  <ul className="res-specs">
                    <li><FaBed aria-hidden="true" /> {residence.bedrooms} ch.</li>
                    <li><FaUsers aria-hidden="true" /> {residence.maxGuests} pers.</li>
                    <li><FaRegCalendarAlt aria-hidden="true" /> {residence.availability.minStay}–{residence.availability.maxStay} nuits</li>
                  </ul>
                  {residence.availability.automatic && residence.availability.checkIn && (
                    <p className="res-sejour">
                      {residence.availability.status === 'occupé' ? 'Occupée' : 'Prochain séjour'} : {formatDate(residence.availability.checkIn)} → {formatDate(residence.availability.checkOut)}
                    </p>
                  )}
                  <div className="res-actions">
                    <button type="button" className="adm-btn" onClick={() => handleEdit(residence)}><FaPen /> Modifier</button>
                    <button type="button" className="adm-btn" onClick={() => navigate('/admin/calendrier')} aria-label={`Calendrier de ${residence.name}`}><FaRegCalendarAlt /></button>
                    <button type="button" className={`adm-btn ${maintenance ? 'principal' : ''}`} onClick={() => basculerMaintenance(residence)} disabled={saving}
                      aria-label={maintenance ? `Remettre ${residence.name} en location` : `Passer ${residence.name} en maintenance`}
                      title={maintenance ? 'Remettre en location' : 'Passer en maintenance'}>
                      {maintenance ? <FaCheck /> : <FaTools />}
                    </button>
                    <button type="button" className="adm-btn discret res-suppr" onClick={() => handleDelete(residence)} disabled={saving}
                      aria-label={`Supprimer ${residence.name}`} title="Supprimer la résidence"><FaTrash /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {editingResidence && (
          <aside className="adm-carte adm-panneau res-panneau" aria-label={`Modifier ${editingResidence.name}`}>
            <div className="cal-panneau-tete">
              <div>
                <p className="surtitre">Modifier</p>
                <h2>{editingResidence.name}</h2>
              </div>
              <button type="button" className="resa-fermer" onClick={() => setEditingResidence(null)} aria-label="Fermer"><FaTimes /></button>
            </div>

            {editingResidence.availability.automatic && editingResidence.availability.reservationId && (
              <div className="res-info-auto">
                <strong>{editingResidence.availability.status === 'occupé' ? 'Occupée' : 'Réservée'}</strong> par {editingResidence.availability.currentOccupant},
                du {formatDate(editingResidence.availability.checkIn)} au {formatDate(editingResidence.availability.checkOut)} (réservation confirmée).
                Elle se libère si le client demande l'annulation et que vous l'acceptez.
              </div>
            )}

            <div className="cal-bloc">
              <h3>Durée des séjours</h3>
              <div className="cal-champs">
                <label>Minimum (nuits)<input type="number" min="1" max="365" {...champ('minStay')} /></label>
                <label>Maximum (nuits)<input type="number" min="1" max="365" {...champ('maxStay')} /></label>
              </div>
            </div>

            <div className="cal-bloc">
              <h3>Statut</h3>
              <div className="res-statuts" role="radiogroup" aria-label="Statut">
                {Object.entries(STATUTS).map(([s, v]) => (
                  <label key={s} className={`res-statut ${editForm.status === s ? 'actif' : ''}`}>
                    <input type="radio" name="statut" value={s} checked={editForm.status === s} onChange={() => setEditForm(prev => ({ ...prev, status: s }))} />
                    <span className={`adm-badge ${v.classe}`}>{v.libelle}</span>
                  </label>
                ))}
              </div>
              {editForm.status === 'occupé' && (
                <div className="cal-champs">
                  <label>Occupant<input type="text" {...champ('currentOccupant')} /></label>
                  <label>Libre le<input type="date" {...champ('nextAvailable')} /></label>
                </div>
              )}
              {editForm.status === 'réservé' && (
                <div className="cal-champs">
                  <label>Client<input type="text" {...champ('currentOccupant')} /></label>
                  <label>Arrivée<input type="date" {...champ('checkIn')} /></label>
                  <label>Départ<input type="date" {...champ('checkOut')} /></label>
                </div>
              )}
              <p className="res-aide">« Dates prises » et « Occupée » se calculent seuls à partir des réservations confirmées.</p>
            </div>

            <div className="resa-actions">
              <button type="button" className="adm-btn" onClick={() => setEditingResidence(null)}>Annuler</button>
              <button type="button" className="adm-btn principal" onClick={handleSave} disabled={saving}><FaSave /> Enregistrer</button>
            </div>
          </aside>
        )}
      </div>

      {showAddForm && <AddResidenceForm onAddResidence={handleAdd} onClose={() => setShowAddForm(false)} />}
    </div>
  );
};

export default AdminPanel;
