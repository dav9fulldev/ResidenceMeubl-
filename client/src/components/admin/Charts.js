import React, { useEffect, useRef, useState } from 'react';
import './Charts.css';

/**
 * Petits graphiques SVG du back-office (sans dépendance).
 * - Dessinés à la taille réelle de leur cadre (1 unité = 1 px) : texte toujours lisible,
 *   sur téléphone comme sur grand écran.
 * - Couleurs : variables --series-* (palette validée clair / sombre, voir Charts.css).
 * - Infobulle au survol / au toucher sur toute la colonne du mois.
 */

export const formatFCFA = (n) => `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`;

// Graduation lisible de l'axe : 0, 500 k, 1 M…
export const formatCompact = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k`;
  return String(Math.round(n));
};

// Graduations « rondes » de 0 au maximum (entières si demandé)
function graduations(max, nb = 4, entiers = false) {
  if (max <= 0) return [0, 1];
  const brut = max / nb;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  let pas = [1, 2, 2.5, 5, 10].map(f => f * puissance).find(p => p >= brut);
  if (entiers) pas = Math.max(1, Math.ceil(pas));
  const ticks = [];
  for (let v = 0; v < max + pas; v += pas) {
    ticks.push(v);
    if (v >= max) break;
  }
  return ticks;
}

// Largeur réelle du conteneur
function useLargeur() {
  const ref = useRef(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const mesurer = () => setLargeur(Math.round(el.getBoundingClientRect().width));
    mesurer();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', mesurer);
      return () => window.removeEventListener('resize', mesurer);
    }
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, largeur];
}

// Géométrie commune
function geometrie(largeur, n) {
  const etroit = largeur < 480;
  const H = etroit ? 200 : 240;
  const M = { top: 12, right: 8, bottom: 26, left: etroit ? 40 : 52 };
  const PW = Math.max(10, largeur - M.left - M.right);
  const PH = H - M.top - M.bottom;
  return { W: largeur, H, M, PW, PH, pasX: PW / n, etroit };
}

// Barre aux coins supérieurs arrondis, posée sur la ligne de base
function barreArrondie(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function Cadre({ g, ticks, labels, formatAxe, titre, highlight, onLeave, children }) {
  const max = ticks[ticks.length - 1] || 1;
  const y = (v) => g.M.top + g.PH - (v / max) * g.PH;
  return (
    <svg width={g.W} height={g.H} viewBox={`0 0 ${g.W} ${g.H}`} className="chart-svg" role="img" aria-label={titre} onMouseLeave={onLeave}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={g.M.left} x2={g.W - g.M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-baseline' : 'chart-grid'} />
          <text x={g.M.left - 6} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">{formatAxe(t)}</text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={i} x={g.M.left + g.pasX * i + g.pasX / 2} y={g.H - 8}
          className={`chart-axis ${highlight === i ? 'chart-axis-active' : ''}`} textAnchor="middle">
          {g.etroit ? l.charAt(0) : l}
        </text>
      ))}
      {children(y, max)}
    </svg>
  );
}

function Infobulle({ survol, largeur }) {
  if (!survol) return null;
  const ratio = survol.x / (largeur || 1);
  const translation = ratio > 0.65 ? '-100%' : ratio < 0.35 ? '0' : '-50%';
  return (
    <div className="chart-tooltip" style={{ left: survol.x, transform: `translateX(${translation})` }} role="status">
      <strong>{survol.titre}</strong>
      {survol.lignes.map(([couleur, texte, valeur]) => (
        <span key={texte} className="chart-tooltip-row">
          {couleur && <i style={{ background: couleur }} aria-hidden="true" />}
          <span>{texte}</span>
          <b>{valeur}</b>
        </span>
      ))}
    </div>
  );
}

// Zones de survol : une colonne entière par mois (cible plus grande que la marque)
function Zones({ g, n, onSurvol }) {
  return Array.from({ length: n }, (_, i) => (
    <rect key={i} x={g.M.left + g.pasX * i} y={g.M.top} width={g.pasX} height={g.PH} className="chart-hit"
      onMouseEnter={() => onSurvol(i)} onClick={() => onSurvol(i)} />
  ));
}

const largeurBarre = (g) => Math.max(4, Math.min(28, g.pasX * 0.6));

/** Barres simples (une série) : revenus par mois. */
export function BarChart({ donnees, titre, couleur = 'var(--series-1)', format = formatFCFA }) {
  const [ref, largeur] = useLargeur();
  const [survol, setSurvol] = useState(null);
  const g = geometrie(largeur, donnees.length);
  const ticks = graduations(Math.max(...donnees.map(d => d.valeur), 0));
  return (
    <div className="chart" ref={ref}>
      {largeur > 0 && (
        <Cadre g={g} ticks={ticks} labels={donnees.map(d => d.label)} formatAxe={formatCompact} titre={titre}
          highlight={survol?.i} onLeave={() => setSurvol(null)}>
          {(y) => (
            <>
              {donnees.map((d, i) => {
                const w = largeurBarre(g);
                const x = g.M.left + g.pasX * i + (g.pasX - w) / 2;
                const haut = y(d.valeur);
                const h = g.M.top + g.PH - haut;
                return h > 0 ? (
                  <path key={i} className={`chart-bar ${survol && survol.i !== i ? 'dim' : ''}`} fill={couleur}
                    d={barreArrondie(x, haut, w, h, Math.min(4, h))} />
                ) : null;
              })}
              <Zones g={g} n={donnees.length} onSurvol={(i) => setSurvol({
                i, x: g.M.left + g.pasX * i + g.pasX / 2,
                titre: donnees[i].titre || donnees[i].label,
                lignes: [[couleur, titre, format(donnees[i].valeur)]],
              })} />
            </>
          )}
        </Cadre>
      )}
      <Infobulle survol={survol} largeur={largeur} />
    </div>
  );
}

/** Courbe (une série) : chiffre d'affaires cumulé, avec repère vertical au survol. */
export function LineChart({ donnees, titre, couleur = 'var(--series-1)', format = formatFCFA, jusqua }) {
  const [ref, largeur] = useLargeur();
  const [survol, setSurvol] = useState(null);
  const g = geometrie(largeur, donnees.length);
  const visibles = jusqua ? donnees.slice(0, jusqua) : donnees;
  const ticks = graduations(Math.max(...visibles.map(d => d.valeur), 0));
  return (
    <div className="chart" ref={ref}>
      {largeur > 0 && (
        <Cadre g={g} ticks={ticks} labels={donnees.map(d => d.label)} formatAxe={formatCompact} titre={titre}
          highlight={survol?.i} onLeave={() => setSurvol(null)}>
          {(y) => {
            const pts = visibles.map((d, i) => [g.M.left + g.pasX * i + g.pasX / 2, y(d.valeur)]);
            if (pts.length === 0) return null;
            const ligne = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
            const bas = g.M.top + g.PH;
            const aire = `${ligne} L${pts[pts.length - 1][0]},${bas} L${pts[0][0]},${bas} Z`;
            const point = survol ? pts[survol.i] : pts[pts.length - 1];
            return (
              <>
                <path d={aire} fill={couleur} className="chart-area" />
                <path d={ligne} stroke={couleur} className="chart-line" />
                {survol && <line x1={point[0]} x2={point[0]} y1={g.M.top} y2={bas} className="chart-crosshair" />}
                <circle cx={point[0]} cy={point[1]} r={survol ? 5 : 4.5} fill={couleur} className="chart-dot" />
                <Zones g={g} n={visibles.length} onSurvol={(i) => setSurvol({
                  i, x: pts[i][0],
                  titre: visibles[i].titre || visibles[i].label,
                  lignes: [[couleur, titre, format(visibles[i].valeur)]],
                })} />
              </>
            );
          }}
        </Cadre>
      )}
      <Infobulle survol={survol} largeur={largeur} />
    </div>
  );
}

/** Barres empilées : réservations par mois et par statut (2 px d'espace entre segments). */
export function StackedBarChart({ donnees, series, titre }) {
  const [ref, largeur] = useLargeur();
  const [survol, setSurvol] = useState(null);
  const g = geometrie(largeur, donnees.length);
  const totaux = donnees.map(d => series.reduce((s, se) => s + (d.valeurs[se.cle] || 0), 0));
  const ticks = graduations(Math.max(...totaux, 0), 4, true);
  return (
    <div className="chart" ref={ref}>
      <div className="chart-legend">
        {series.map(s => (
          <span key={s.cle}><i style={{ background: s.couleur }} aria-hidden="true" />{s.label}</span>
        ))}
      </div>
      {largeur > 0 && (
        <Cadre g={g} ticks={ticks} labels={donnees.map(d => d.label)} formatAxe={(t) => String(t)} titre={titre}
          highlight={survol?.i} onLeave={() => setSurvol(null)}>
          {(y, max) => (
            <>
              {donnees.map((d, i) => {
                const w = largeurBarre(g);
                const x = g.M.left + g.pasX * i + (g.pasX - w) / 2;
                const segments = series.filter(s => d.valeurs[s.cle] > 0);
                let base = g.M.top + g.PH;
                return segments.map((s, k) => {
                  const hauteur = (d.valeurs[s.cle] / max) * g.PH;
                  const haut = base - hauteur;
                  const dernier = k === segments.length - 1;
                  const espace = k > 0 ? 2 : 0; // espace sous le segment (sauf le premier, posé sur la base)
                  const h = Math.max(0, hauteur - espace);
                  const chemin = dernier
                    ? barreArrondie(x, haut, w, h, Math.min(4, h))
                    : `M${x},${haut}h${w}v${h}h${-w}Z`;
                  base = haut;
                  return (
                    <path key={s.cle} className={`chart-bar ${survol && survol.i !== i ? 'dim' : ''}`}
                      fill={s.couleur} d={chemin} />
                  );
                });
              })}
              <Zones g={g} n={donnees.length} onSurvol={(i) => setSurvol({
                i, x: g.M.left + g.pasX * i + g.pasX / 2,
                titre: `${donnees[i].titre || donnees[i].label} · ${totaux[i]} réservation${totaux[i] > 1 ? 's' : ''}`,
                lignes: series.map(s => [s.couleur, s.label, String(donnees[i].valeurs[s.cle] || 0)]),
              })} />
            </>
          )}
        </Cadre>
      )}
      <Infobulle survol={survol} largeur={largeur} />
    </div>
  );
}
