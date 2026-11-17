import { useCallback, useEffect, useState } from 'react';

const estInstallee = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const estIOS = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
  (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

/**
 * Installation de l'application (PWA).
 * - Chrome / Edge / Android : vraie invite d'installation (beforeinstallprompt)
 * - iPhone / iPad : pas d'invite possible, on affiche la marche à suivre (Partager → Sur l'écran d'accueil)
 */
export default function useInstallPrompt() {
  const [invite, setInvite] = useState(null);
  const [installee, setInstallee] = useState(estInstallee);

  useEffect(() => {
    const surInvite = (e) => {
      e.preventDefault(); // on garde l'invite pour notre propre bouton
      setInvite(e);
    };
    const surInstallation = () => {
      setInstallee(true);
      setInvite(null);
    };
    window.addEventListener('beforeinstallprompt', surInvite);
    window.addEventListener('appinstalled', surInstallation);
    return () => {
      window.removeEventListener('beforeinstallprompt', surInvite);
      window.removeEventListener('appinstalled', surInstallation);
    };
  }, []);

  const installer = useCallback(async () => {
    if (!invite) return false;
    invite.prompt();
    const { outcome } = await invite.userChoice;
    setInvite(null);
    return outcome === 'accepted';
  }, [invite]);

  return {
    installee,
    peutInstaller: Boolean(invite),
    ios: estIOS() && !installee,
    installer,
  };
}
