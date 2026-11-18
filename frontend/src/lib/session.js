/**
 * Session storage for the two audiences of the web app. Values live in
 * localStorage so a dropped connection or a closed tab doesn't sign anyone out.
 */
const KEYS = {
  app: { token: 'tsp.token', profile: 'tsp.profile' },
  console: { token: 'tsp.console.token', profile: 'tsp.console.profile' },
};

const read = (key) => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage can be unavailable in private mode */
  }
};

const make = (scope) => ({
  token: () => read(KEYS[scope].token),
  profile: () => {
    try {
      return JSON.parse(read(KEYS[scope].profile) || 'null');
    } catch {
      return null;
    }
  },
  save: (token, profile) => {
    write(KEYS[scope].token, token);
    write(KEYS[scope].profile, JSON.stringify(profile));
  },
  updateProfile: (patch) => {
    const current = make(scope).profile() || {};
    write(KEYS[scope].profile, JSON.stringify({ ...current, ...patch }));
  },
  clear: () => {
    write(KEYS[scope].token, null);
    write(KEYS[scope].profile, null);
  },
});

export const appSession = make('app');
export const consoleSession = make('console');

/** Small per-device preferences (e.g. "was online before reload"). */
export const prefs = {
  get: (k) => read(`tsp.pref.${k}`),
  set: (k, v) => write(`tsp.pref.${k}`, v == null ? null : String(v)),
};

export const homeFor = (role) => ({ rider: '/rider', driver: '/driver', courier: '/courier' }[role] || '/login');
