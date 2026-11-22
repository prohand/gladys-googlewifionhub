// -----------------------------------------------------------------------------
// User-facing answers shared by the Configuration actions, the scene actions
// and the widget buttons. Each one is a `{ en, fr, de, es }` object.
// -----------------------------------------------------------------------------

import { localize, pick } from '../i18n.js';

const formatMbps = (value) => (value === null || value === undefined ? '?' : String(value));

/** "Speed test: 912.4 Mb/s down, 41.2 Mb/s up." */
export function speedTestMessage({ downloadMbps, uploadMbps }) {
  const down = formatMbps(downloadMbps);
  const up = formatMbps(uploadMbps);
  return localize((language) =>
    pick(language, {
      en: `Speed test: ${down} Mb/s down, ${up} Mb/s up.`,
      fr: `Test de débit : ${down} Mb/s en descente, ${up} Mb/s en montée.`,
      de: `Geschwindigkeitstest: ${down} Mbit/s Download, ${up} Mbit/s Upload.`,
      es: `Test de velocidad: ${down} Mb/s de bajada, ${up} Mb/s de subida.`,
    }),
  );
}

/** The error of a failed operation, as a short message. */
export function failureMessage(err) {
  const reason = String(err?.message ?? err).slice(0, 140);
  return localize((language) =>
    pick(language, {
      en: `Failed: ${reason}`,
      fr: `Échec : ${reason}`,
      de: `Fehlgeschlagen: ${reason}`,
      es: `Error: ${reason}`,
    }),
  );
}

export const RESTART_REQUESTED = {
  en: 'Restart requested: the Wi-Fi will be back in a few minutes.',
  fr: 'Redémarrage demandé : le Wi-Fi revient dans quelques minutes.',
  de: 'Neustart angefordert: Das WLAN ist in wenigen Minuten wieder da.',
  es: 'Reinicio solicitado: el Wi-Fi volverá en unos minutos.',
};

export const RESTART_NOT_CONFIRMED = {
  en: 'Nothing done: tick the confirmation box to restart the Wi-Fi.',
  fr: 'Rien n’a été fait : cochez la case de confirmation pour redémarrer le Wi-Fi.',
  de: 'Nichts getan: Aktiviere das Bestätigungsfeld, um das WLAN neu zu starten.',
  es: 'No se hizo nada: marque la casilla de confirmación para reiniciar el Wi-Fi.',
};

export const CLOUD_REQUIRED = {
  en: 'This needs the Google cloud connection: add a refresh token in the configuration.',
  fr: 'Cela nécessite la connexion cloud Google : ajoutez un jeton (refresh token) dans la configuration.',
  de: 'Dafür ist die Google-Cloud-Verbindung nötig: Füge in der Konfiguration ein Refresh-Token hinzu.',
  es: 'Esto requiere la conexión a la nube de Google: añada un token (refresh token) en la configuración.',
};
