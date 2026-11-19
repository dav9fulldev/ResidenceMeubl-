import React, { useEffect, useState } from 'react';
import { getAdminToken } from '../../config/api';

/** Télécharge un fichier privé du back-office (jeton requis) et renvoie une adresse locale (blob:). */
export const chargerPrive = async (url) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${getAdminToken()}` } });
  if (!r.ok) throw new Error('Fichier indisponible');
  return URL.createObjectURL(await r.blob());
};

/** Ouvre un justificatif dans un nouvel onglet. */
export const ouvrirPrive = async (url) => {
  // Onglet ouvert tout de suite (sinon bloqué comme fenêtre surgissante), rempli une fois le fichier reçu
  const fenetre = window.open('', '_blank');
  if (fenetre) fenetre.opener = null;
  try {
    const local = await chargerPrive(url);
    if (fenetre) fenetre.location.href = local; else window.location.href = local;
    setTimeout(() => URL.revokeObjectURL(local), 60000);
  } catch (e) {
    if (fenetre) fenetre.close();
    window.alert(e.message);
  }
};

/** Vignette d'une image privée (photo prise sur place). */
export const ImagePrivee = ({ url, alt, className }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let local = null;
    let actif = true;
    chargerPrive(url).then(u => { local = u; if (actif) setSrc(u); }).catch(() => {});
    return () => { actif = false; if (local) URL.revokeObjectURL(local); };
  }, [url]);
  return src
    ? <button type="button" className={`fp-vignette ${className || ''}`} onClick={() => { const f = window.open(src, '_blank'); if (f) f.opener = null; }} aria-label={`Agrandir : ${alt}`}><img src={src} alt={alt} /></button>
    : <span className={`fp-vignette chargement ${className || ''}`} aria-label={alt} />;
};
