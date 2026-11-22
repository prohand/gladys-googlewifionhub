// -----------------------------------------------------------------------------
// Commercial name of a router, from the board name that starts the
// `system.hardwareId` of the local status page ("GALE C2E-A2A-…").
//
// Only used for display (device names, widget): never part of an external id.
// An unknown board falls back to the generic family name.
// -----------------------------------------------------------------------------

export const DEFAULT_MODEL = 'Google Wifi';

const BOARDS = {
  GALE: 'Google Wifi',
  WHIRLWIND: 'OnHub (TP-Link)',
  ARKHAM: 'OnHub (ASUS)',
  MISTRAL: 'Nest Wifi',
};

/**
 * @param {string} hardwareId e.g. "GALE C2E-A2A-A3A-A4A-E5Q"
 * @returns {string}
 */
export function modelName(hardwareId) {
  const board = String(hardwareId ?? '')
    .trim()
    .split(/[\s_-]/)[0]
    .toUpperCase();
  return BOARDS[board] ?? DEFAULT_MODEL;
}
