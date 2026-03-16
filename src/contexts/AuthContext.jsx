import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import apiClient from '@/lib/apiClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';

const loadCachedUser = () => {
  try {
    const cachedUserRaw = localStorage.getItem(AUTH_USER_KEY);
    if (!cachedUserRaw) return null;
    return JSON.parse(cachedUserRaw);
  } catch (error) {
    localStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
};

const saveCachedUser = (user) => {
  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_USER_KEY);
  }
};

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionRequestIdRef = useRef(0);

  const clearSession = useCallback(() => {
    apiClient.setToken(null);
    saveCachedUser(null);
    setUser(null);
  }, []);

  const refreshSession = useCallback(async ({ background = false } = {}) => {
    const requestId = ++sessionRequestIdRef.current;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const cachedUser = loadCachedUser();

    apiClient.setToken(token || null);

    if (cachedUser) {
      setUser(cachedUser);
      setLoading(false);
    } else if (!background) {
      setLoading(true);
    }

    if (!token) {
      clearSession();
      setLoading(false);
      return;
    }

    try {
      const userData = await apiClient.getMe();
      if (requestId !== sessionRequestIdRef.current) return;
      setUser(userData);
      saveCachedUser(userData);
    } catch (err) {
      if (requestId !== sessionRequestIdRef.current) return;

      const status = err?.status;
      const isTransient = err?.code === 'TIMEOUT' || err?.code === 'NETWORK' || err?.name === 'AbortError';
      if (!isTransient) {
        console.error('Erro ao obter sessao:', err);
      }
      if (status === 401 || status === 403) {
        clearSession();
      }
    } finally {
      if (requestId === sessionRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [clearSession]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    let lastResumeAt = 0;
    const resumeSession = () => {
      const now = Date.now();
      if (now - lastResumeAt < 1500) return;
      lastResumeAt = now;
      refreshSession({ background: true });
    };

    const handleStorage = (event) => {
      if (event.key && ![AUTH_TOKEN_KEY, AUTH_USER_KEY].includes(event.key)) {
        return;
      }
      resumeSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resumeSession();
      }
    };

    window.addEventListener('focus', resumeSession);
    window.addEventListener('online', resumeSession);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', resumeSession);
      window.removeEventListener('online', resumeSession);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshSession]);

  const signUp = useCallback(async (email, password, nome) => {
    try {
      const data = await apiClient.register(email, password, nome);
      setUser(data.user);
      saveCachedUser(data.user);
      return { error: null };
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Falha no Cadastro',
        description: error.message || 'Algo deu errado. Tente novamente.',
      });
      return { error };
    }
  }, [toast]);

  const signIn = useCallback(async (email, password) => {
    try {
      const data = await apiClient.login(email, password);
      setUser(data.user);
      saveCachedUser(data.user);
      return { error: null };
    } catch (error) {
      console.error('Erro no login:', error);
      toast({
        variant: 'destructive',
        title: 'Falha no Login',
        description: error.message || 'Algo deu errado. Verifique suas credenciais.',
      });
      return { error };
    }
  }, [toast]);

  const signOut = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao sair',
        description: error.message || 'Algo deu errado.',
      });
    } finally {
      clearSession();
      setLoading(false);
    }
  }, [clearSession, toast]);

  const value = useMemo(() => ({
    user,
    session: user ? { user } : null,
    loading,
    signUp,
    signIn,
    signOut,
  }), [user, loading, signUp, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
