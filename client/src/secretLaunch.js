/**
 * Secret open: PIN gate for the Android app. Only available when running inside the Capacitor Android app.
 * Use to hide the app from the launcher and open only via the "dialer" screen (code + PIN).
 */

import { registerPlugin } from '@capacitor/core';

let plugin = null;

function getPlugin() {
  if (plugin !== undefined) return plugin;
  try {
    const cap = typeof window !== 'undefined' && window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
      plugin = registerPlugin('SecretLaunch');
      return plugin;
    }
  } catch (_) {}
  plugin = null;
  return null;
}

export function isSecretLaunchAvailable() {
  return getPlugin() != null;
}

export async function secretLaunchSetPin(pin) {
  const p = getPlugin();
  if (!p) return { ok: false, error: 'Not available' };
  try {
    await p.setPin({ pin: String(pin) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'Failed' };
  }
}

export async function secretLaunchGetDialNumber() {
  const p = getPlugin();
  if (!p) return { dialNumber: '' };
  try {
    const r = await p.getDialNumber();
    return { dialNumber: r?.dialNumber ?? '123456' };
  } catch (_) {
    return { dialNumber: '123456' };
  }
}

export async function secretLaunchIsEnabled() {
  const p = getPlugin();
  if (!p) return { enabled: false };
  try {
    const r = await p.isEnabled();
    return { enabled: !!r?.enabled };
  } catch (_) {
    return { enabled: false };
  }
}

export async function secretLaunchClearPin() {
  const p = getPlugin();
  if (!p) return { ok: false };
  try {
    await p.clearPin();
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
}
