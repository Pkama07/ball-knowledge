"use client";

// Ensures every visitor has an anonymous Supabase session.
//
// On mount it reuses an existing session or signs in anonymously, then tracks
// the session via onAuthStateChange so the in-memory token stays fresh across
// refreshes. Children read `isReady` (gate UI until we have a token) and
// `getAccessToken()` (a fresh JWT to hand to the game server at connect time).

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

interface AuthContextValue {
  /** true once an anonymous (or any) session exists */
  isReady: boolean;
  /** the authenticated user's id (Supabase `sub`), or null before sign-in */
  userId: string | null;
  /** non-null if anonymous sign-in failed (e.g. provider disabled) */
  error: string | null;
  /** returns a current, non-expired access token, refreshing if needed */
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    // Reuse an existing session or create an anonymous one. Surface failures
    // (most commonly anonymous sign-ins being disabled for the project) instead
    // of leaving the UI stuck waiting for a session that never arrives.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setSession(data.session);
      } else {
        void supabase.auth.signInAnonymously().then(({ error }) => {
          if (active && error) setError(error.message);
        });
      }
    });

    // Keep the session current (initial sign-in, token refresh, sign-out).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    isReady: session !== null,
    userId: session?.user.id ?? null,
    error,
    getAccessToken: async () => {
      // getSession() refreshes the token if it's close to expiry.
      const { data } = await getSupabase().auth.getSession();
      return data.session?.access_token ?? null;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
