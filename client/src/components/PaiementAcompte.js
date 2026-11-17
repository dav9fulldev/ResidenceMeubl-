import React, { useEffect, useRef, useState } from 'react';
import { FaQrcode, FaMobileAlt, FaCheckCircle, FaTimes, FaCamera, FaImage, FaPaste } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest } from '../config/api';
import { aliasDepuisQr, lireQrDepuisFichier, lireQrDepuisVideo, cameraDisponible } from '../utils/pispiQr';

// Adresse de paiement mémorisée sur cet appareil (choix du client)
const CLE_ALIAS = 'pispiAlias';
const lireAliasMemorise = () => { try { return localStorage.getItem(CLE_ALIAS) || ''; } catch { return ''; } };
const memoriserAlias = (v) => { try { if (v) localStorage.setItem(CLE_ALIAS, v); else localStorage.removeItem(CLE_ALIAS); } catch { /* indisponible */ } };
import './PaiementAcompte.css';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Nettoie une adresse de paiement saisie ou collée : espaces, tirets typographiques (iOS),
// majuscules ; accepte aussi 32 caractères sans tirets.
const normaliserAlias = (valeur) => {
  const brut = String(valeur || '').toLowerCase().replace(/[‐-―−﹘﹣－]/g, '-').replace(/[^0-9a-f-]/g, '');
  const hex = brut.replace(/-/g, '');
  return hex.length === 32 ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : brut;
};

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;

/**
 * Paiement de l'acompte par PI-SPI : QR Code dynamique ou demande vers l'adresse de paiement.
 * Le statut est suivi jusqu'à confirmation (IRREVOCABLE côté serveur).
 */
const PaiementAcompte = ({ reservation, token, onPaye, onFermer }) => {
  const a = reservation.acompte;
  const mobile = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches;
  const [methode, setMethode] = useState(mobile ? 'demande' : 'qr');
  const [alias, setAlias] = useState(lireAliasMemorise);
  const [memoriser, setMemoriser] = useState(true);
  const [scan, setScan] = useState(false);
  const [lecture, setLecture] = useState(false);
  const videoRef = useRef(null);
  const fichierRef = useRef(null);
  const peutColler = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);
  const [paiement, setPaiement] = useState(null); // réponse du démarrage
  const [statut, setStatut] = useState(null);     // en_attente | paye | refuse | expire
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const minuterie = useRef(null);

  const base = API_ENDPOINTS.client.reservations;
  const urlAcompte = `${base}/${reservation.id}/acompte`;

  // Suivi du paiement toutes les 4 secondes
  useEffect(() => {
    if (!paiement || statut === 'paye') return undefined;
    const suivre = async () => {
      try {
        const r = await apiRequest(`${urlAcompte}/${paiement.txId}`, { token });
        setStatut(r.data.statut);
        if (r.data.statut === 'paye' || r.data.acompte?.paye) {
          setStatut('paye');
          onPaye?.(r.data.acompte);
        } else if (['refuse', 'expire'].includes(r.data.statut)) {
          setMessage(r.data.raison || 'Le paiement n\'a pas abouti.');
        }
      } catch {
        // erreur réseau passagère : on réessaie au prochain passage
      }
    };
    minuterie.current = setInterval(suivre, 4000);
    // Retour depuis l'application bancaire : vérifier tout de suite
    const auRetour = () => { if (document.visibilityState === 'visible') suivre(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      clearInterval(minuterie.current);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [paiement, statut, urlAcompte, token, onPaye]);

  // Adresse trouvée (QR scanné, image importée ou collée)
  const utiliserTexte = (texte) => {
    const trouve = aliasDepuisQr(texte);
    if (trouve) {
      setAlias(trouve);
      setErreur('');
      return true;
    }
    setErreur('Aucune adresse de paiement PI-SPI trouvée. Utilisez le QR « Recevoir / Mon QR » de votre application bancaire.');
    return false;
  };

  const importer = async (e) => {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    setLecture(true);
    try {
      utiliserTexte(await lireQrDepuisFichier(fichier));
    } catch {
      setErreur('Image illisible. Réessayez avec une capture d\'écran nette de votre QR.');
    } finally {
      setLecture(false);
    }
  };

  const coller = async () => {
    try {
      const texte = await navigator.clipboard.readText();
      if (!utiliserTexte(texte)) setAlias(texte);
    } catch {
      setErreur('Collage refusé par le navigateur : appuyez longuement dans le champ puis « Coller ».');
    }
  };

  // Scan caméra : lecture d'une image toutes les 300 ms jusqu'à trouver un QR PI-SPI
  useEffect(() => {
    if (!scan) return undefined;
    let flux = null;
    let actif = true;
    (async () => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!actif) return;
        const video = videoRef.current;
        video.srcObject = flux;
        await video.play();
        while (actif) {
          const texte = await lireQrDepuisVideo(video).catch(() => null);
          if (texte && aliasDepuisQr(texte)) {
            utiliserTexte(texte);
            setScan(false);
            break;
          }
          await new Promise(r => setTimeout(r, 300));
        }
      } catch {
        setErreur('Caméra indisponible. Importez plutôt une capture d\'écran de votre QR.');
        setScan(false);
      }
    })();
    return () => {
      actif = false;
      flux?.getTracks().forEach(t => t.stop());
    };
  }, [scan]); // eslint-disable-line react-hooks/exhaustive-deps

  const demarrer = async () => {
    setErreur('');
    setMessage('');
    const aliasPropre = normaliserAlias(alias);
    if (methode === 'demande' && !UUID_V4.test(aliasPropre)) {
      const n = aliasPropre.replace(/-/g, '').length;
      setErreur(`Adresse de paiement incomplète ou incorrecte (${n} caractères sur 32). Le plus simple : copiez-la depuis l'application de votre banque et collez-la ici.`);
      return;
    }
    setEnvoi(true);
    try {
      const r = await apiRequest(urlAcompte, {
        method: 'POST', token,
        body: methode === 'demande' ? { methode, payeurAlias: aliasPropre } : { methode },
      });
      setPaiement(r.data);
      setStatut('en_attente');
      if (methode === 'demande') memoriserAlias(memoriser ? aliasPropre : '');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  const simuler = async () => {
    try {
      const r = await apiRequest(`${urlAcompte}/${paiement.txId}/simuler`, { method: 'POST', token });
      setStatut('paye');
      onPaye?.(r.data.acompte);
    } catch (err) {
      setErreur(err.message);
    }
  };

  const recommencer = () => {
    setPaiement(null);
    setStatut(null);
    setMessage('');
  };

  return (
    <div className="acompte-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="acompte-titre" onClick={onFermer}>
      <div className="acompte-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="acompte-fermer" onClick={onFermer} aria-label="Fermer"><FaTimes /></button>
        <h2 id="acompte-titre">Payer l'acompte</h2>
        <p className="acompte-resume">
          {reservation.residence.nom} · <strong>{fcfa(a.montant)}</strong> ({a.pourcentage} % du séjour)
        </p>

        {statut === 'paye' ? (
          <div className="acompte-succes" role="status">
            <FaCheckCircle />
            <h3>Acompte reçu</h3>
            <p>Merci ! Votre séjour est garanti. Un reçu vous a été envoyé par email.</p>
            <button type="button" className="btn btn-primary" onClick={onFermer}>Fermer</button>
          </div>
        ) : !paiement ? (
          <>
            <div className="acompte-methodes" role="tablist">
              {mobile ? (<><button type="button" role="tab" aria-selected={methode === 'demande'} className={methode === 'demande' ? 'active' : ''} onClick={() => setMethode('demande')}>
                <FaMobileAlt /> {mobile ? 'Sur ce téléphone' : 'Demande dans mon appli'}
              </button>
              <button type="button" role="tab" aria-selected={methode === 'qr'} className={methode === 'qr' ? 'active' : ''} onClick={() => setMethode('qr')}>
                <FaQrcode /> {mobile ? 'QR (autre appareil)' : 'QR Code'}
              </button></>) : (<><button type="button" role="tab" aria-selected={methode === 'qr'} className={methode === 'qr' ? 'active' : ''} onClick={() => setMethode('qr')}>
                <FaQrcode /> {mobile ? 'QR (autre appareil)' : 'QR Code'}
              </button>
              <button type="button" role="tab" aria-selected={methode === 'demande'} className={methode === 'demande' ? 'active' : ''} onClick={() => setMethode('demande')}>
                <FaMobileAlt /> {mobile ? 'Sur ce téléphone' : 'Demande dans mon appli'}
              </button></>)}
            </div>

            {methode === 'qr' ? (
              <p className="acompte-aide">
                Un QR Code va s'afficher : scannez-le avec l'application de votre banque.
                {mobile && ' Pratique si vous payez depuis un autre appareil (ordinateur, tablette).'}
              </p>
            ) : (
              <>
                <p className="acompte-aide acompte-etapes">
                  <b>1.</b> Indiquez votre adresse de paiement PI-SPI · <b>2.</b> validez la demande dans l'application de votre banque.
                </p>
                <div className="acompte-sources">
                  <button type="button" onClick={() => fichierRef.current?.click()} disabled={lecture}>
                    <FaImage /> {lecture ? 'Lecture…' : 'Importer mon QR'}
                  </button>
                  {cameraDisponible() && (
                    <button type="button" onClick={() => { setErreur(''); setScan(true); }}>
                      <FaCamera /> Scanner mon QR
                    </button>
                  )}
                  {peutColler && (
                    <button type="button" onClick={coller}><FaPaste /> Coller</button>
                  )}
                </div>
                <input ref={fichierRef} type="file" accept="image/*" hidden onChange={importer} />
                <p className="acompte-astuce">
                  Astuce : dans l'application de votre banque, ouvrez « Recevoir / Mon QR PI-SPI », faites une capture d'écran,
                  puis « Importer mon QR ».
                </p>
                {scan && (
                  <div className="acompte-camera">
                    <video ref={videoRef} playsInline muted />
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setScan(false)}>Arrêter</button>
                  </div>
                )}
                <label htmlFor="acompte-alias">Votre adresse de paiement PI-SPI</label>
                <input id="acompte-alias" value={alias} onChange={(e) => setAlias(e.target.value)}
                  placeholder="Collez votre adresse de paiement" autoComplete="off" autoCorrect="off"
                  autoCapitalize="off" spellCheck="false" inputMode="text" />
                {alias && (
                  <p className={`acompte-alias-etat ${UUID_V4.test(normaliserAlias(alias)) ? 'ok' : ''}`}>
                    {UUID_V4.test(normaliserAlias(alias)) ? '✓ Adresse au bon format' : `${normaliserAlias(alias).replace(/-/g, '').length} / 32 caractères`}
                  </p>
                )}
                <label className="acompte-memoriser">
                  <input type="checkbox" checked={memoriser} onChange={(e) => setMemoriser(e.target.checked)} />
                  Mémoriser sur cet appareil pour mes prochains paiements
                </label>
              </>
            )}

            {erreur && <div className="error-message" role="alert">{erreur}</div>}
            <button type="button" className="btn btn-primary acompte-valider" onClick={demarrer} disabled={envoi}>
              {envoi ? 'Patientez…' : methode === 'qr' ? 'Afficher le QR Code' : 'Envoyer la demande'}
            </button>
          </>
        ) : (
          <>
            {paiement.methode === 'qr' ? (
              <div className="acompte-qr">
                {/* SVG produit par le SDK officiel PI-SPI côté serveur, affiché comme image */}
                <div className="acompte-qr-image">
                  <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(paiement.qrSvg)}`} alt="QR Code de paiement PI-SPI" />
                </div>
                <p>Scannez ce QR Code avec l'application de votre banque, puis validez le paiement de <strong>{fcfa(paiement.montant)}</strong>.</p>
              </div>
            ) : (
              <div className="acompte-envoyee">
                <FaMobileAlt />
                <p>
                  {paiement.dejaEnvoyee ? 'Une demande vous a déjà été envoyée.' : 'Demande envoyée !'}
                  <br />
                  <strong>Ouvrez l'application de votre banque</strong>, puis validez le paiement de <strong>{fcfa(paiement.montant)}</strong>.
                  Revenez ensuite sur cette page : elle se met à jour toute seule.
                </p>
              </div>
            )}

            {statut === 'en_attente' && (
              <p className="acompte-attente" role="status"><span className="acompte-spinner" aria-hidden="true" /> En attente de votre validation…</p>
            )}
            {message && <div className="error-message" role="alert">{message}</div>}
            {erreur && <div className="error-message" role="alert">{erreur}</div>}

            <div className="acompte-actions">
              {['refuse', 'expire'].includes(statut) && (
                <button type="button" className="btn btn-primary" onClick={recommencer}>Réessayer</button>
              )}
              {a.mode === 'simulation' && statut === 'en_attente' && (
                <button type="button" className="btn btn-outline" onClick={simuler}>Simuler le paiement (démo)</button>
              )}
              {statut === 'en_attente' && (
                <button type="button" className="btn btn-outline" onClick={recommencer}>Changer de méthode</button>
              )}
            </div>
          </>
        )}
        <p className="acompte-pied">Paiement instantané sécurisé PI-SPI (BCEAO)</p>
      </div>
    </div>
  );
};

export default PaiementAcompte;
