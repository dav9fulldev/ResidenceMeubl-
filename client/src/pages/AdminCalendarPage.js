import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight, FaTimes, FaTools, FaCheck } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import useAdminReservations from '../hooks/useAdminReservations';
import './AdminCalendarPage.css';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const iso = (d) => d.toISOString().slice(0, 10);
const jourUTC = (s) => new Date(`${s}T00:00:00Z`);

/**
 * Calendrier des disponibilités : une ligne par résidence, un jour par colonne.
 * Séjours confirmés, demandes en attente, maintenance ; réglage rapide d'une résidence.
 */
const AdminCalendarPage = () => {
  const navigate = useNavigate();
  const { residences, updateResidenceStatus, updateStayLimits } = useResidences();
  const { reservations } = useAdminReservations();
  const now = new Date();
  const [mois, setMois] = useState({ a: now.getFullYear(), m: now.getMonth() });
  const [choisie, setChoisie] = useState(null);
  const [form, setForm] = useState({ min: 2, max: 30 });
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState('');

  const debut = new Date(Date.UTC(mois.a, mois.m, 1));
  const nbJours = new Date(Date.UTC(mois.a, mois.m + 1, 0)).getUTCDate();
  const jours = Array.from({ length: nbJours }, (_, i) => new Date(Date.UTC(mois.a, mois.m, i + 1)));
  const finIso = iso(new Date(Date.UTC(mois.a, mois.m, nbJours + 1)));
  const debutIso = iso(debut);
  const aujourdHui = iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));

  // Séjours visibles ce mois-ci, par résidence
  const sejours = useMemo(() => {
    const parRes = new Map();
    for (const r of reservations) {
      if (r.statut === 'annulee') continue;
      if (r.dates.depart <= debutIso || r.dates.arrivee >= finIso) continue;
      const cle = String(r.residence?.id ?? r.residenceId);
      const a = Math.max(0, Math.round((jourUTC(r.dates.arrivee) - debut) / 86400000));
      const b = Math.min(nbJours, Math.round((jourUTC(r.dates.depart) - debut) / 86400000));
      const type = r.demandeAnnulation?.statut === 'en_attente' ? 'demande' : r.statut === 'confirmee' ? 'confirme' : 'attente';
      if (!parRes.has(cle)) parRes.set(cle, []);
      parRes.get(cle).push({ r, a, b, type, coupeAvant: r.dates.arrivee < debutIso, coupeApres: r.dates.depart > finIso });
    }
    return parRes;
  }, [reservations, debutIso, finIso, nbJours, debut]);

  const occupationMois = useMemo(() => {
    let nuits = 0;
    for (const liste of sejours.values()) for (const s of liste) if (s.type !== 'attente') nuits += s.b - s.a;
    const actives = residences.filter(r => r.availability?.status !== 'maintenance').length || 1;
    return Math.round((nuits / (actives * nbJours)) * 100);
  }, [sejours, residences, nbJours]);

  const changerMois = (pas) => setMois(({ a, m }) => {
    const d = new Date(a, m + pas, 1);
    return { a: d.getFullYear(), m: d.getMonth() };
  });

  const ouvrir = (res) => {
    setChoisie(res.id);
    setForm({ min: res.availability?.minStay || 2, max: res.availability?.maxStay || 30 });
    setMessage('');
  };

  const residence = residences.find(r => r.id === choisie);
  const enMaintenance = residence?.availability?.status === 'maintenance';

  const basculerMaintenance = async () => {
    setEnCours(true); setMessage('');
    try {
      await updateResidenceStatus(residence.id, enMaintenance ? 'disponible' : 'maintenance');
      setMessage(enMaintenance ? 'Résidence remise en location.' : 'Résidence passée en maintenance : elle n\'est plus réservable.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setEnCours(false);
    }
  };

  const enregistrerSejour = async (e) => {
    e.preventDefault();
    if (Number(form.min) > Number(form.max)) { setMessage('Le minimum doit être inférieur ou égal au maximum.'); return; }
    setEnCours(true); setMessage('');
    try {
      await updateStayLimits(residence.id, form.min, form.max);
      setMessage('Durées de séjour enregistrées.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="cal-page">
      <div className="admin-page-header">
        <div>
          <h1>Calendrier</h1>
          <p>Disponibilités de toutes vos résidences. Touchez un séjour pour l'ouvrir, une résidence pour la régler.</p>
        </div>
        <div className="cal-mois">
          <button type="button" className="adm-btn" onClick={() => changerMois(-1)} aria-label="Mois précédent"><FaChevronLeft /></button>
          <strong aria-live="polite">{MOIS[mois.m]} {mois.a}</strong>
          <button type="button" className="adm-btn" onClick={() => changerMois(1)} aria-label="Mois suivant"><FaChevronRight /></button>
          <button type="button" className="adm-btn discret" onClick={() => setMois({ a: now.getFullYear(), m: now.getMonth() })}>Aujourd'hui</button>
        </div>
      </div>

      <div className="cal-resume">
        <span><b>{occupationMois} %</b> d'occupation ce mois</span>
        <ul className="cal-legende">
          <li><i className="leg confirme" />Séjour confirmé</li>
          <li><i className="leg attente" />À confirmer</li>
          <li><i className="leg demande" />Annulation demandée</li>
          <li><i className="leg maintenance" />Maintenance</li>
        </ul>
      </div>

      <div className={`adm-maitre-detail ${residence ? '' : 'sans-detail'}`}>
        <section className="adm-carte cal-carte">
          <div className="cal-defilement">
            <div className="cal-grille" style={{ '--jours': nbJours }}>
              <div className="cal-entete cal-coin">Résidence</div>
              {jours.map(d => {
                const j = iso(d);
                const we = [0, 6].includes(d.getUTCDay());
                return (
                  <div key={j} className={`cal-entete cal-jour ${we ? 'we' : ''} ${j === aujourdHui ? 'aujourdhui' : ''}`}>
                    <span>{JOURS[d.getUTCDay()]}</span><b>{d.getUTCDate()}</b>
                  </div>
                );
              })}

              {residences.map(res => {
                const maintenance = res.availability?.status === 'maintenance';
                const liste = sejours.get(String(res.id)) || [];
                return (
                  <React.Fragment key={res.id}>
                    <button type="button" className={`cal-res ${choisie === res.id ? 'choisie' : ''}`} onClick={() => ouvrir(res)}>
                      {res.images?.[0] && <img src={res.images[0]} alt="" loading="lazy" />}
                      <span><b>{res.name}</b><small>{Number(res.price).toLocaleString('fr-FR')} FCFA · {res.availability?.minStay || 1}–{res.availability?.maxStay || 30} n.</small></span>
                    </button>
                    <div className="cal-ligne" style={{ gridColumn: `2 / span ${nbJours}` }}>
                      {jours.map((d, i) => {
                        const j = iso(d);
                        return <span key={j} style={{ gridColumn: i + 1 }} className={`cal-case ${[0, 6].includes(d.getUTCDay()) ? 'we' : ''} ${j === aujourdHui ? 'aujourdhui' : ''}`} />;
                      })}
                      {maintenance && (
                        <span className="cal-maintenance" style={{ gridColumn: `1 / span ${nbJours}` }}><FaTools /> En maintenance</span>
                      )}
                      {!maintenance && liste.map(({ r, a, b, type, coupeAvant, coupeApres }) => (b > a) && (
                        <button
                          type="button"
                          key={r.id}
                          className={`cal-sejour ${type} ${coupeAvant ? 'coupe-avant' : ''} ${coupeApres ? 'coupe-apres' : ''}`}
                          style={{ gridColumn: `${a + 1} / ${b + 1}` }}
                          onClick={() => navigate(`/admin/reservations?id=${encodeURIComponent(r.id)}`)}
                          title={`${r.client.prenom} ${r.client.nom} · ${r.dates.arrivee} → ${r.dates.depart}`}
                        >
                          {r.client.prenom} {r.client.nom.charAt(0)}.
                        </button>
                      ))}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </section>

        {residence && (
          <aside className="adm-carte adm-panneau cal-panneau" aria-label={`Réglages de ${residence.name}`}>
            <div className="cal-panneau-tete">
              <div>
                <p className="surtitre">Résidence</p>
                <h2>{residence.name}</h2>
                <p className="cal-panneau-lieu">{residence.location}</p>
              </div>
              <button type="button" className="resa-fermer" onClick={() => setChoisie(null)} aria-label="Fermer"><FaTimes /></button>
            </div>
            {residence.images?.[0] && <img className="cal-panneau-photo" src={residence.images[0]} alt="" />}

            <div className="cal-bloc">
              <h3>Disponibilité</h3>
              <p>
                {enMaintenance
                  ? 'En maintenance : la résidence est masquée des réservations jusqu\'à sa remise en location.'
                  : 'En location : les dates libres du calendrier sont réservables par les clients.'}
              </p>
              <button type="button" className={`adm-btn ${enMaintenance ? 'principal' : ''}`} onClick={basculerMaintenance} disabled={enCours}>
                {enMaintenance ? <><FaCheck /> Remettre en location</> : <><FaTools /> Passer en maintenance</>}
              </button>
            </div>

            <form className="cal-bloc" onSubmit={enregistrerSejour}>
              <h3>Durée des séjours</h3>
              <div className="cal-champs">
                <label>Minimum<input type="number" min="1" max="365" value={form.min} onChange={(e) => setForm(f => ({ ...f, min: e.target.value }))} /> nuits</label>
                <label>Maximum<input type="number" min="1" max="365" value={form.max} onChange={(e) => setForm(f => ({ ...f, max: e.target.value }))} /> nuits</label>
              </div>
              <button type="submit" className="adm-btn principal" disabled={enCours}>Enregistrer</button>
            </form>

            {message && <p className="cal-message" role="status">{message}</p>}
          </aside>
        )}
      </div>
    </div>
  );
};

export default AdminCalendarPage;
