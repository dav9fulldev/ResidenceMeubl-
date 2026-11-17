/**
 * Lecture de l'adresse de paiement (alias PI-SPI) d'un client à partir de son QR Code.
 *
 * Format EMV PI-SPI (cf. SDK officiel @pi-spi/qrcode) : tag 36 = { 00: "int.bceao.pi", 01: <alias UUID> }.
 * Le texte du QR peut aussi être directement une adresse de paiement.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

// Découpe une chaîne TLV EMV : « IIllvaleur… » (identifiant 2 car., longueur 2 chiffres)
function lireTlv(texte) {
  const champs = {};
  let i = 0;
  while (i + 4 <= texte.length) {
    const id = texte.slice(i, i + 2);
    const longueur = parseInt(texte.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(longueur)) break;
    champs[id] = texte.slice(i + 4, i + 4 + longueur);
    i += 4 + longueur;
  }
  return champs;
}

/** Retourne l'alias (UUID en minuscules) contenu dans le texte d'un QR, ou null. */
export function aliasDepuisQr(texte) {
  if (!texte) return null;
  const brut = String(texte).trim();
  if (brut.startsWith('000201')) {
    const compte = lireTlv(brut)['36'];
    if (compte) {
      const sous = lireTlv(compte);
      if (sous['00'] === 'int.bceao.pi' && UUID.test(sous['01'] || '')) return sous['01'].toLowerCase();
    }
  }
  const trouve = brut.match(UUID);
  return trouve ? trouve[0].toLowerCase() : null;
}

// Décodage d'une image (photo, capture d'écran, image de la caméra)
async function decoderImage(source, largeur, hauteur) {
  if ('BarcodeDetector' in window) {
    try {
      const detecteur = new window.BarcodeDetector({ formats: ['qr_code'] });
      const codes = await detecteur.detect(source);
      if (codes[0]?.rawValue) return codes[0].rawValue;
    } catch {
      // repli sur jsQR
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, largeur, hauteur);
  const { default: jsQR } = await import(/* webpackChunkName: "jsqr" */ 'jsqr');
  const pixels = ctx.getImageData(0, 0, largeur, hauteur);
  return jsQR(pixels.data, largeur, hauteur, { inversionAttempts: 'attemptBoth' })?.data || null;
}

/** Lit le QR d'une image importée (capture d'écran du QR de l'application bancaire). */
export async function lireQrDepuisFichier(fichier) {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = ko;
      i.src = url;
    });
    // Réduire les très grandes photos (plus rapide, aussi fiable)
    const echelle = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    return await decoderImage(img, Math.round(img.naturalWidth * echelle), Math.round(img.naturalHeight * echelle));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Décode une image de la caméra (élément <video>). */
export function lireQrDepuisVideo(video) {
  if (!video.videoWidth) return Promise.resolve(null);
  const echelle = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
  return decoderImage(video, Math.round(video.videoWidth * echelle), Math.round(video.videoHeight * echelle));
}

export const cameraDisponible = () =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;
