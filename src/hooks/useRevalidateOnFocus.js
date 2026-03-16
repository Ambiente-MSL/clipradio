import { useEffect, useRef } from 'react';

const DEFAULT_MIN_INTERVAL_MS = 3000;

const useRevalidateOnFocus = (
  callback,
  { enabled = true, minIntervalMs = DEFAULT_MIN_INTERVAL_MS } = {},
) => {
  const callbackRef = useRef(callback);
  const lastRunAtRef = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const run = () => {
      if (document.visibilityState === 'hidden') return;

      const now = Date.now();
      if (now - lastRunAtRef.current < minIntervalMs) return;

      lastRunAtRef.current = now;
      callbackRef.current?.();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        run();
      }
    };

    window.addEventListener('focus', run);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', run);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, minIntervalMs]);
};

export default useRevalidateOnFocus;
