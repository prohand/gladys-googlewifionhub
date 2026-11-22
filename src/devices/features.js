// -----------------------------------------------------------------------------
// Feature builders shared by the device files.
//
// Every feature carries `name`, `min`, `max`, `read_only` and `has_feedback`:
// Gladys stores them NOT NULL, and a device missing one is refused when the
// user clicks "Add" in Discovery (HTTP 422). `min`/`max` are 0/1 for a binary
// feature, the real range for a numeric one, 0/0 for a text one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

// Highest throughput a Google Wifi / Nest Wifi WAN port can carry, in Mb/s.
export const MAX_RATE_MBPS = 10000;

/** A characters-safe platform id: Google ids are opaque, keep them stable but tidy. */
export function platformId(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '-');
}

/** Read-only on/off value (internet, link, update available, point online). */
export function binaryState(name, externalId, { keepHistory = true } = {}) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.SWITCH,
    type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
    min: 0,
    max: 1,
    read_only: true,
    has_feedback: false,
    keep_history: keepHistory,
  };
}

/** Controllable on/off (internet access of a device). */
export function binarySwitch(name, externalId) {
  return {
    ...binaryState(name, externalId),
    read_only: false,
    has_feedback: true,
  };
}

/** A device is on the Wi-Fi (1) or not (0). */
export function presence(name, externalId) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    min: 0,
    max: 1,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

/** Throughput in Mb/s. */
export function rate(name, externalId, { keepHistory = true } = {}) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.DATARATE,
    type: DEVICE_FEATURE_TYPES.DATARATE.RATE,
    unit: DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND,
    min: 0,
    max: MAX_RATE_MBPS,
    read_only: true,
    has_feedback: false,
    keep_history: keepHistory,
  };
}

/** Uptime, in days (two decimals: one change every ~15 minutes). */
export function uptime(name, externalId) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
    unit: DEVICE_FEATURE_UNITS.DAYS,
    min: 0,
    max: 100000,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  };
}

/** A count (devices connected). */
export function counter(name, externalId) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    min: 0,
    max: 1000,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

/** Free text (firmware version, WAN address). */
export function text(name, externalId) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    min: 0,
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  };
}

/** Brightness of the light ring, 0-100 %, controllable. */
export function brightness(name, externalId) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.LIGHT,
    type: DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS,
    unit: DEVICE_FEATURE_UNITS.PERCENT,
    min: 0,
    max: 100,
    read_only: false,
    has_feedback: true,
    keep_history: false,
  };
}

/** A numeric state, or nothing when the value is unknown. */
export function numberState(externalId, value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? []
    : [{ device_feature_external_id: externalId, state: Number(value) }];
}

/** A boolean as a 0/1 state, or nothing when unknown. */
export function booleanState(externalId, value) {
  return value === null || value === undefined ? [] : numberState(externalId, value ? 1 : 0);
}

/** A text state, or nothing when empty. */
export function textState(externalId, value) {
  return value ? [{ device_feature_external_id: externalId, text: String(value) }] : [];
}
