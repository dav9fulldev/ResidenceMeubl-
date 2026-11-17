import React, { useCallback, useEffect, useState } from 'react';
import { FaFileExcel, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import { BarChart, LineChart, StackedBarChart, formatFCFA } from '../components/admin/Charts';
import '../components/admin/Charts.css';
import './AdminStatsPage.css';

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const SERIES_RESERVATIONS = [
  { cle: 'confirmees', label: 'Confirmées', couleur: 'var(--series-1)' },
  { cle: 'enAttente', label: 'En attente', couleur: 'var(--series-2)' },
  { cle: 'annulees', label: 'Annulées', couleur: 'var(--series-3)' },
];

/**
 * Statistiques : revenus du mois, chiffre d'affaires cumulé, réservations par mois,
 * occupation par résidence, export Excel.
 */
const AdminStatsPage = () => {
  const { getStats, downloadReservationsCsv } = useResidences();
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportEnCours, setExportEnCours] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await getStats(annee));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getStats, annee]);

  useEffect(() => {
    charger();
  }, [charger]);

  const exporter = async (toutes = false) => {
    setExportEnCours(true);
    setError('');
    try {
      await downloadReservationsCsv(toutes ? null : annee);
    } catch (err) {
      setError(err.message);
    } finally {
      setExportEnCours(false);
    }
  };

  const r = stats?.resume;
  const variation = r && r.revenusMoisPrecedent
    ? Math.round(((r.revenusMoisCourant - r.revenusMoisPrecedent) / r.revenusMoisPrecedent) * 100)
    : null;
  // Cumul : on s'arrête au mois en cours pour l'année en cours (pas de plateau futur)
  const jusqua = r?.moisCourant || 12;

  return (
    <div className="admin-stats-page viz-root">
      <div className="admin-page-header">
        <div>
          <h1>Statistiques</h1>
          <p>Revenus des réservations confirmées, réparties nuit par nuit.</p>
        </div>
        <div className="stats-actions">
          <label className="stats-year">
            <span>Année</span>
            <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
              {(stats?.anneesDisponibles || [annee]).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => exporter(false)} disabled={exportEnCours}>
            <FaFileExcel /> {exportEnCours ? 'Export…' : `Exporter ${annee}`}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => exporter(true)} disabled={exportEnCours}>
            Tout exporter
          </button>
        </div>
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}
      {loading && !stats && <p className="stats-muted">Chargement…</p>}

      {stats && (
        <>
          {/* Chiffres clés */}
          <section className="stats-kpis" aria-label="Chiffres clés">
            <div className="stats-kpi stats-kpi--hero">
              <span className="stats-kpi-label">Chiffre d'affaires {annee}</span>
              <span className="stats-kpi-value">{formatFCFA(r.revenusAnnee)}</span>
              <span className="stats-kpi-sub">+ {formatFCFA(r.revenusPrevisionnels)} en attente de confirmation</span>
            </div>
            {r.moisCourant && (
              <div className="stats-kpi">
                <span className="stats-kpi-label">Ce mois-ci ({NOMS_MOIS[r.moisCourant - 1]})</span>
                <span className="stats-kpi-value">{formatFCFA(r.revenusMoisCourant)}</span>
                {variation !== null && (
                  <span className={`stats-kpi-trend ${variation >= 0 ? 'up' : 'down'}`}>
                    {variation >= 0 ? <FaArrowUp /> : <FaArrowDown />} {Math.abs(variation)} % vs {NOMS_MOIS[r.moisCourant - 2]}
                  </span>
                )}
              </div>
            )}
            <div className="stats-kpi">
              <span className="stats-kpi-label">Réservations</span>
              <span className="stats-kpi-value">{r.reservations}</span>
              <span className="stats-kpi-sub">{r.confirmees} confirmées · {r.enAttente} en attente · {r.annulees} annulées</span>
            </div>
            <div className="stats-kpi">
              <span className="stats-kpi-label">Taux d'occupation</span>
              <span className="stats-kpi-value">{r.tauxOccupation.toLocaleString('fr-FR')} %</span>
              <span className="stats-kpi-sub">{r.nuitsOccupees} nuits sur {stats.nbResidences} résidences</span>
            </div>
            <div className="stats-kpi">
              <span className="stats-kpi-label">Acomptes encaissés (PI-SPI)</span>
              <span className="stats-kpi-value">{formatFCFA(r.acomptesEncaisses)}</span>
              <span className="stats-kpi-sub">Paiements reçus en {annee}</span>
            </div>
            <div className="stats-kpi">
              <span className="stats-kpi-label">Panier moyen</span>
              <span className="stats-kpi-value">{formatFCFA(r.panierMoyen)}</span>
              <span className="stats-kpi-sub">Séjour moyen : {r.dureeMoyenne.toLocaleString('fr-FR')} nuits</span>
            </div>
            <div className="stats-kpi">
              <span className="stats-kpi-label">Taux d'annulation</span>
              <span className="stats-kpi-value">{r.tauxAnnulation.toLocaleString('fr-FR')} %</span>
              <span className="stats-kpi-sub">{r.annulees} annulation{r.annulees > 1 ? 's' : ''}</span>
            </div>
          </section>

          {/* Graphiques : deux mesures d'échelles différentes → deux graphiques, jamais deux axes */}
          <div className="stats-charts">
            <section className="stats-card">
              <h2>Revenus par mois</h2>
              <BarChart
                titre="Revenus"
                donnees={stats.mois.map(m => ({ label: m.libelle, titre: `${NOMS_MOIS[m.mois - 1]} ${annee}`, valeur: m.revenus }))}
              />
            </section>
            <section className="stats-card">
              <h2>Chiffre d'affaires cumulé</h2>
              <LineChart
                titre="Cumul depuis janvier"
                jusqua={jusqua}
                donnees={stats.mois.map(m => ({ label: m.libelle, titre: `Fin ${NOMS_MOIS[m.mois - 1]} ${annee}`, valeur: m.cumul }))}
              />
            </section>
            <section className="stats-card wide">
              <h2>Réservations par mois d'arrivée</h2>
              <StackedBarChart
                titre="Réservations par mois"
                series={SERIES_RESERVATIONS}
                donnees={stats.mois.map(m => ({ label: m.libelle, titre: `${NOMS_MOIS[m.mois - 1]} ${annee}`, valeurs: m.reservations }))}
              />
            </section>
          </div>

          {/* Classement des résidences */}
          <section className="stats-card">
            <h2>Revenus par résidence</h2>
            {stats.residences.length === 0 ? (
              <p className="stats-muted">Aucune réservation confirmée en {annee}.</p>
            ) : (
              <div className="stats-table-wrap">
                <table className="stats-table">
                  <thead>
                    <tr><th>Résidence</th><th>Revenus</th><th className="num">Séjours</th><th className="num">Nuits</th><th>Occupation</th></tr>
                  </thead>
                  <tbody>
                    {stats.residences.map(res => {
                      const max = stats.residences[0].revenus || 1;
                      return (
                        <tr key={res.residenceId}>
                          <td>{res.nom}</td>
                          <td>
                            <div className="cell-bar">
                              <span className="cell-bar-fill" style={{ width: `${(res.revenus / max) * 100}%` }} aria-hidden="true" />
                              <span className="cell-bar-value">{formatFCFA(res.revenus)}</span>
                            </div>
                          </td>
                          <td className="num">{res.reservations}</td>
                          <td className="num">{res.nuits}</td>
                          <td>{res.occupation.toLocaleString('fr-FR')} %</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Tableau des données mensuelles (accessibilité / lecture précise) */}
          <details className="stats-card stats-details">
            <summary>Voir le tableau mois par mois</summary>
            <div className="stats-table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Mois</th><th className="num">Revenus</th><th className="num">Cumul</th><th className="num">En attente</th>
                    <th className="num">Confirmées</th><th className="num">Annulées</th><th className="num">Occupation</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.mois.map(m => (
                    <tr key={m.mois}>
                      <td>{NOMS_MOIS[m.mois - 1]}</td>
                      <td className="num">{formatFCFA(m.revenus)}</td>
                      <td className="num">{formatFCFA(m.cumul)}</td>
                      <td className="num">{formatFCFA(m.revenusPrevisionnels)}</td>
                      <td className="num">{m.reservations.confirmees}</td>
                      <td className="num">{m.reservations.annulees}</td>
                      <td className="num">{m.occupation.toLocaleString('fr-FR')} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
};

export default AdminStatsPage;
