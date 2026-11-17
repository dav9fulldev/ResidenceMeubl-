import React, { useEffect, useRef, useState } from 'react';
import { FaQrcode, FaMobileAlt, FaCheckCircle, FaTimes } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest } from '../config/api';
import './PaiementAcompte.css';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;

/**
 * Paiement de l'acompte par PI-SPI : QR Code dynamique ou demande vers l'adresse de paiement.
 * Le statut est suivi jusqu'à confirmation (IRREVOCABLE côté serveur).
 */
const PaiementAcompte = ({ reservation, token, onPaye, onFermer }) => {
  const a = reservation.acompte;
  const mobile = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches;
  const [methode, setMethode] = useState(mobile ? 'demande' : 'qr');
  const [alias, setAlias] = useState('');
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
    return () => clearInterval(minuterie.current);
  }, [paiement, statut, urlAcompte, token, onPaye]);

  const demarrer = async () => {
    setErreur('');
    setMessage('');
    if (methode === 'demande' && !UUID_V4.test(alias.trim())) {
      setErreur('Adresse de paiement invalide. Copiez-la depuis l\'application de votre banque (format xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx).');
      return;
    }
    setEnvoi(true);
    try {
      const r = await apiRequest(urlAcompte, {
        method: 'POST', token,
        body: methode === 'demande' ? { methode, payeurAlias: alias.trim() } : { methode },
      });
      setPaiement(r.data);
      setStatut('en_attente');
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
              <button type="button" role="tab" aria-selected={methode === 'qr'} className={methode === 'qr' ? 'active' : ''} onClick={() => setMethode('qr')}>
                <FaQrcode /> QR Code
              </button>
              <button type="button" role="tab" aria-selected={methode === 'demande'} className={methode === 'demande' ? 'active' : ''} onClick={() => setMethode('demande')}>
                <FaMobileAlt /> Demande dans mon appli
              </button>
            </div>

            {methode === 'qr' ? (
              <p className="acompte-aide">Un QR Code va s'afficher : scannez-le avec l'application de votre banque ou de votre wallet compatible PI-SPI.</p>
            ) : (
              <>
                <label htmlFor="acompte-alias">Votre adresse de paiement PI-SPI</label>
                <input id="acompte-alias" value={alias} onChange={(e) => setAlias(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx" autoComplete="off" spellCheck="false" inputMode="text" />
                <p className="acompte-aide">Elle figure dans l'application de votre banque (rubrique PI-SPI / adresse de paiement). Vous recevrez la demande dans cette application.</p>
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
              <p className="acompte-aide">
                {paiement.dejaEnvoyee ? 'Une demande vous a déjà été envoyée. ' : 'Demande envoyée ! '}
                Ouvrez l'application de votre banque et validez le paiement de <strong>{fcfa(paiement.montant)}</strong> demandé par Sankofart.
              </p>
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
