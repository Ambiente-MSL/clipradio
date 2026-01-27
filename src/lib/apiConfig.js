const FALLBACK_API_URL = 'http://localhost:5000/api';

const getWindowOrigin = () => {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.origin || '';
};

const normalizeEnvUrl = () => {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
};

const resolveApiUrl = () => {
  const envUrl = normalizeEnvUrl();
  if (!envUrl || envUrl.toLowerCase() === 'auto') {
    const origin = getWindowOrigin();
    return origin ? `${origin}/api` : FALLBACK_API_URL;
  }

  if (/^https?:\/\//i.test(envUrl)) {
    return envUrl;
  }

  const rel = envUrl.startsWith('/') ? envUrl : `/${envUrl}`;
  const origin = getWindowOrigin();
  return origin ? `${origin}${rel}` : rel;
};

const resolveOrigin = (apiUrl) => {
  if (/^https?:\/\//i.test(apiUrl)) {
    try {
      return new URL(apiUrl).origin;
    } catch (error) {
      return '';
    }
  }
  return getWindowOrigin();
};

const API_URL = resolveApiUrl();
const API_ORIGIN = resolveOrigin(API_URL);
const WS_BASE_URL = API_ORIGIN ? API_ORIGIN.replace(/^http/i, 'ws') : '';

export { API_URL, API_ORIGIN, WS_BASE_URL };
