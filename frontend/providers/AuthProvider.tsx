'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authService } from '../lib/services/authService';
import { ApiError } from '../lib/apiClient';
import type { Admin } from '../types/api';

interface AuthContextValue {
  admin: Admin | null;
  authError: string | null;
  loading: boolean;
  refresh: () => Promise<Admin | null>;
  logout: () => Promise<void>;
  setAdmin: (admin: Admin) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the signed-in admin. The session itself lives in an HttpOnly cookie,
 * so this only mirrors the server's answer from `/auth/me` — it is never the
 * source of truth and never persists anything to localStorage.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdminState] = useState<Admin | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async (): Promise<Admin | null> => {
    setLoading(true);
    setAuthError(null);
    try {
      const me = await authService.me();
      setAdminState(me);
      return me;
    } catch (err) {
      setAdminState(null);
      if (!(err instanceof ApiError) || !err.isUnauthorized) {
        setAuthError(err instanceof Error ? err.message : 'Could not verify your session.');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const isPublicPath = pathname === '/login' || pathname.startsWith('/login/') ||
      pathname === '/setup' || pathname.startsWith('/setup/');
    if (isPublicPath) {
      setAdminState(null);
      setAuthError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setAuthError(null);

    authService.me()
      .then((me) => {
        if (active) {
          setAdminState(me);
          setAuthError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setAdminState(null);
          if (!(err instanceof ApiError) || !err.isUnauthorized) {
            setAuthError(err instanceof Error ? err.message : 'Could not verify your session.');
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setAdminState(null);
      router.replace('/login');
    }
  }, [router]);

  const setAdmin = useCallback((next: Admin) => setAdminState(next), []);

  const value = useMemo<AuthContextValue>(
    () => ({ admin, authError, loading, refresh, logout, setAdmin }),
    [admin, authError, loading, refresh, logout, setAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
