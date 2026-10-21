'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  CyberBookClient,
  type AuthedUser,
  type Role,
} from '@cyberbook/api-client';
import { API_BASE_URL } from './api';
import { session } from './session';

interface AuthState {
  user: AuthedUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthedUser>;
  register: (input: { email: string; password: string; fullName: string; phone?: string; role?: Role }) => Promise<AuthedUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(null);
  const [loading, setLoading] = useState(true);

  // A client bound to the current session; recreating it is cheap and always
  // reads the freshest token from localStorage.
  const client = useMemo(
    () =>
      new CyberBookClient({
        baseUrl: API_BASE_URL,
        getAccessToken: () => session.getAccessToken(),
        onUnauthorized: () => {
          session.clear();
          setUser(null);
        },
      }),
    [],
  );

  const refreshUser = useCallback(async () => {
    if (!session.getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await client.me());
    } catch {
      session.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await client.login({ email, password });
      session.set(tokens.accessToken, tokens.refreshToken);
      setUser(tokens.user);
      return tokens.user;
    },
    [client],
  );

  const register = useCallback(
    async (input: { email: string; password: string; fullName: string; phone?: string; role?: Role }) => {
      const tokens = await client.register(input);
      session.set(tokens.accessToken, tokens.refreshToken);
      setUser(tokens.user);
      return tokens.user;
    },
    [client],
  );

  const logout = useCallback(async () => {
    const refreshToken = session.getRefreshToken();
    if (refreshToken) {
      try {
        await client.logout(refreshToken);
      } catch {
        // ignore network errors on logout
      }
    }
    session.clear();
    setUser(null);
  }, [client]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, refreshUser }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Client bound to the current session token (for use inside client components). */
export function useApi(): CyberBookClient {
  return useMemo(
    () =>
      new CyberBookClient({
        baseUrl: API_BASE_URL,
        getAccessToken: () => session.getAccessToken(),
        onUnauthorized: () => {
          session.clear();
        },
      }),
    [],
  );
}
