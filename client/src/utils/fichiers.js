/**
 * Préparation des fichiers envoyés à l'API (en base64 dans du JSON).
 * Les photos sont redimensionnées et recompressées dans le navigateur : envoi rapide
 * sur mobile, et stockage léger côté serveur.
 */
const TAILLE_MAX = 5 * 1024 * 1024;

/** Lit un fichier tel quel (PDF, justificatifs) en base64. */
export const fichierEnBase64 = (file) => new Promise((resolve, reject) => {
  if (file.size > TAILLE_MAX) { reject(new Error(`« ${file.name} » dépasse 5 Mo`)); return; }
  const lecteur = new FileReader();
  lecteur.onload = () => resolve(String(lecteur.result).split(',')[1] || '');
  lecteur.onerror = () => reject(new Error(`Lecture de « ${file.name} » impossible`));
  lecteur.readAsDataURL(file);
});

/** Photo redimensionnée (1600 px au plus) et convertie en JPEG, en base64. */
export const compresserImage = async (file, { cote = 1600, qualite = 0.82 } = {}) => {
  if (!file.type.startsWith('image/')) throw new Error(`« ${file.name} » n'est pas une image`);
  let image;
  try {
    image = await createImageBitmap(file);
  } catch {
    // Format non lu par le navigateur (HEIC…) : envoi tel quel, le serveur contrôle le type réel
    return fichierEnBase64(file);
  }
  const echelle = Math.min(1, cote / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * echelle);
  canvas.height = Math.round(image.height * echelle);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', qualite);
  return dataUrl.split(',')[1];
};

/** Position actuelle du téléphone (preuves prises sur place). Null si refusée ou indisponible. */
export const positionActuelle = () => new Promise((resolve) => {
  if (!navigator.geolocation) { resolve(null); return; }
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});
