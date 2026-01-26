import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import apiClient from '@/lib/apiClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

const loadCachedUser = () => {
  try {
    const cachedUserRaw = localStorage.getItem('auth_user');
    if (!cachedUserRaw) return null;
    return JSON.parse(cachedUserRaw);
  } catch (error) {
    localStorage.removeItem('auth_user');
    return null;
  }
};

const saveCachedUser = (user) => {
  if (user) {
    localStorage.setItem('auth_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('auth_user');
  }
};

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const getSession = async () => {
      const token = localStorage.getItem('auth_token');
      const cachedUser = loadCachedUser();
      const hasCachedUser = Boolean(cachedUser);

      if (cachedUser) {
        setUser(cachedUser);
        setLoading(false);
      }
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await apiClient.getMe();
        if (cancelled) return;
        setUser(userData);
        saveCachedUser(userData);
      } catch (err) {
        const status = err?.status;
        const isTransient = err?.code === 'TIMEOUT' || err?.code === 'NETWORK';
        if (!isTransient) {
          console.error('Erro ao obter sessao:', err);
        }
        if (status === 401 || status === 403) {
          localStorage.removeItem('auth_token');
          saveCachedUser(null);
          if (!cancelled) {
            setUser(null);
          }
        }
      } finally {
        if (!cancelled && !hasCachedUser) {
          setLoading(false);
        }
      }
    };

    getSession();
    return () => {
      cancelled = true;
    };
  }, []);

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
      setUser(null);
      saveCachedUser(null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao sair',
        description: error.message || 'Algo deu errado.',
      });
    }
  }, [toast]);

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
