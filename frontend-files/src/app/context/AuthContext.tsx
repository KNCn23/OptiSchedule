import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Account } from '@/app/features/auth/types/authTypes';
import * as authService from '@/app/services/authService';
import { getToken } from '@/app/services/apiClient';

export type { Account };

interface AuthContextType {
  currentUser: Account | null;
  /** Resolves the Account on success, null on bad credentials. Throws on network errors. */
  login: (id: string, pass: string) => Promise<Account | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const USER_CACHE_KEY = 'optisched-user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Restore the cached account for instant UI on refresh. The auth token lives
  // separately (see apiClient) and is what actually authorizes API requests.
  const [currentUser, setCurrentUser] = useState<Account | null>(() => {
    try {
      if (!getToken()) {
        localStorage.removeItem(USER_CACHE_KEY);
        return null;
      }
      const stored = localStorage.getItem(USER_CACHE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      // Reject stale/incompatible cached shapes (e.g. pre-backend-alignment
      // accounts that lack user_id/full_name) so a bad cache can never crash the app.
      if (parsed && typeof parsed.user_id === 'number' && typeof parsed.full_name === 'string') {
        return parsed as Account;
      }
      localStorage.removeItem(USER_CACHE_KEY);
      return null;
    } catch {
      localStorage.removeItem(USER_CACHE_KEY);
      return null;
    }
  });

  useEffect(() => {
    if (!getToken()) {
      setCurrentUser(null);
      localStorage.removeItem(USER_CACHE_KEY);
      return;
    }

    let cancelled = false;
    authService.getCurrentUser()
      .then(account => {
        if (cancelled) return;
        setCurrentUser(account);
        if (account) {
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(account));
        } else {
          localStorage.removeItem(USER_CACHE_KEY);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentUser(null);
        localStorage.removeItem(USER_CACHE_KEY);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (id: string, pass: string) => {
    const account = await authService.login(id, pass);
    if (account) {
      setCurrentUser(account);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(account));
      return account;
    }
    return null;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setCurrentUser(null);
    localStorage.removeItem(USER_CACHE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
