import { useSyncExternalStore } from 'react';

/**
 * One-time tips ("Got it" hides them). Remembered in this browser; if storage
 * isn't available they stay hidden for the rest of the visit.
 */

const listeners = new Set<() => void>();
const hiddenThisVisit = new Set<string>();
const storageKey = (id: string) => `aixie:tip:${id}`;

function isDismissed(id: string): boolean {
  if (hiddenThisVisit.has(id)) return true;
  try {
    return window.localStorage.getItem(storageKey(id)) === '1';
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function dismissTip(id: string) {
  hiddenThisVisit.add(id);
  try {
    window.localStorage.setItem(storageKey(id), '1');
  } catch {
    // private window or storage blocked: hidden for this visit only
  }
  listeners.forEach((l) => l());
}

/** True once the teacher has dismissed the tip (also on the server, so nothing flashes). */
export function useTipDismissed(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isDismissed(id),
    () => true
  );
}
