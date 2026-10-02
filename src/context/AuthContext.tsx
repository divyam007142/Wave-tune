import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  image?: string;
  emailVerified: boolean;
};

type AuthContextValue = {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  signInWithGoogle: (credential: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function authRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; user?: AuthenticatedUser | null };
  if (!response.ok) throw new Error(payload.error || `Authentication failed (${response.status}).`);
  return payload as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await authRequest<{ user: AuthenticatedUser | null }>("/api/auth/me");
      setUser(result.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signInWithGoogle = useCallback(async (credential: string) => {
    const result = await authRequest<{ user: AuthenticatedUser }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    setUser(result.user);
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const result = await authRequest<{ user: AuthenticatedUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(result.user);
  }, []);

  const registerWithPassword = useCallback(async (email: string, password: string) => {
    const result = await authRequest<{ user: AuthenticatedUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    await authRequest<{ ok: true }>("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      refresh,
      signInWithGoogle,
      signInWithPassword,
      registerWithPassword,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
