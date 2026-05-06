import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { purgeSupabaseBrowserCaches } from '@/lib/auth-cache-purge';
import { purgeSupabaseAuthStorage } from '@/lib/auth-storage-purge';
import { clearAllQueryCaches } from '@/lib/queryClient';
import { setUserScope, purgeUserScopedStorage } from '@/lib/userScopedStorage';
import { clearIdleActivity, markIdleActivity } from '@/lib/idle-activity';
import type { User, UserRole, AppRole } from '@/types/database';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  supabaseUser: SupabaseUser | null;
  userRoles: UserRole[];
  isLoading: boolean;
  isRealtimeReady: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole, brandId?: string) => boolean;
  isAdmin: boolean;
  isCeo: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRealtimeReady, setIsRealtimeReady] = useState(false);

  const realtimeAttemptRef = useRef(0);
  const realtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncRealtimeAuth = useCallback(async (nextSession: Session | null) => {
    const accessToken = nextSession?.access_token;
    if (realtimeRetryTimerRef.current) {
      clearTimeout(realtimeRetryTimerRef.current);
      realtimeRetryTimerRef.current = null;
    }
    if (!accessToken) {
      setIsRealtimeReady(false);
      realtimeAttemptRef.current = 0;
      return;
    }

    // F8: decode exp; if token is already expired skip the call — onAuthStateChange
    // TOKEN_REFRESHED will fire shortly with a fresh one.
    try {
      const { secondsUntilExpiry } = await import('@/lib/jwt-decode');
      const ttl = secondsUntilExpiry(accessToken);
      if (ttl !== null && ttl <= 0) {
        setIsRealtimeReady(false);
        window.dispatchEvent(new CustomEvent('realtime-stale', { detail: { reason: 'expired' } }));
        return;
      }
    } catch { /* no-op */ }

    try {
      setIsRealtimeReady(false);
      await supabase.realtime.setAuth(accessToken);
      setIsRealtimeReady(true);
      realtimeAttemptRef.current = 0;
      window.dispatchEvent(new CustomEvent('realtime-stale', { detail: { reason: 'ok', ok: true } }));
    } catch (error) {
      setIsRealtimeReady(false);
      console.warn('Failed to sync realtime auth:', error);
      // F8: exponential backoff retry, capped at 30s, max 5 attempts.
      const attempt = Math.min(realtimeAttemptRef.current + 1, 5);
      realtimeAttemptRef.current = attempt;
      const delay = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
      window.dispatchEvent(new CustomEvent('realtime-stale', { detail: { reason: 'retry', attempt, delay } }));
      realtimeRetryTimerRef.current = setTimeout(() => {
        void syncRealtimeAuth(nextSession);
      }, delay);
    }
  }, []);

  // Track current auth user ID to prevent stale fetches
  const currentAuthIdRef = useRef<string | null>(null);
  // Track if initial fetch is done to prevent double fetch
  const initialFetchDoneRef = useRef(false);

  // Stable fetchUserData with stale-check via ref
  const fetchUserData = useCallback(async (authUserId: string) => {
    // If the auth user changed while we were fetching, abort
    if (currentAuthIdRef.current !== authUserId) return;

    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('supabase_auth_id', authUserId)
        .maybeSingle();

      if (userError) {
        console.error('Error fetching user:', userError);
        // Reset state on error to prevent stale privileges
        setUser(null);
        setUserRoles([]);
        return;
      }

      // Re-check: user might have logged out while we were fetching
      if (currentAuthIdRef.current !== authUserId) return;

      if (!userData) {
        // No user record found — reset to prevent stale state
        setUser(null);
        setUserRoles([]);
        return;
      }

      setUser(userData as User);

      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userData.id)
        .eq('is_active', true);

      // Final stale check before setting roles
      if (currentAuthIdRef.current !== authUserId) return;

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        // Reset roles on error
        setUserRoles([]);
      } else {
        setUserRoles((rolesData || []) as UserRole[]);
      }
    } catch (error) {
      console.error('Error in fetchUserData:', error);
      // BUG-APP-003 FIX: Reset state on unexpected exceptions to prevent stale privileges
      setUser(null);
      setUserRoles([]);
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setSupabaseUser(newSession?.user ?? null);
        void syncRealtimeAuth(newSession);

        if (newSession?.user) {
          if (event === 'SIGNED_IN' || event === 'MFA_CHALLENGE_VERIFIED') {
            markIdleActivity();
          }
          currentAuthIdRef.current = newSession.user.id;
          // GDPR: scope UI-preference localStorage keys under this user id.
          // If a different user was previously active, their keys are
          // purged automatically by setUserScope().
          setUserScope(newSession.user.id);

          // Skip if getSession already handled this
          if (!initialFetchDoneRef.current) {
            // Will be handled by getSession below
            return;
          }
          // Direct call, no setTimeout
          fetchUserData(newSession.user.id);
        } else {
          currentAuthIdRef.current = null;
          setUser(null);
          setUserRoles([]);
          setUserScope(null);
        }

        // A6: session audit (best-effort, never blocks)
        if (event === 'SIGNED_IN' && newSession?.user) {
          void import('@/lib/session-audit').then(({ logSessionEvent }) =>
            logSessionEvent('signin', { sessionId: newSession.access_token?.slice(-16) ?? null }),
          );
        }
        if (event === 'PASSWORD_RECOVERY') {
          void import('@/lib/session-audit').then(({ logSessionEvent }) =>
            logSessionEvent('password_reset'),
          );
        }

        if (event === 'SIGNED_OUT') {
          // Best-effort signout audit BEFORE clearing local state (RPC needs auth.uid)
          // Actually session is already gone here, so signout is logged in signOut() below.
          currentAuthIdRef.current = null;
          clearIdleActivity();
          setUser(null);
          setUserRoles([]);
          // SECURITY: purge any SW-cached Supabase responses so the next
          // session doesn't inherit the previous user's authorizations.
          void purgeSupabaseBrowserCaches();
          // GDPR: wipe React Query in-memory cache + localStorage persister
          // so the next login on the same device cannot restore the previous
          // user's lead/deal/ticket/brand data.
          void clearAllQueryCaches();
          // GDPR: wipe per-user UI preferences (filters, saved views, …).
          purgeUserScopedStorage();
          setUserScope(null);
        }

        // SECURITY: on token refresh / user update (e.g. role change applied
        // server-side) drop SW caches so stale RLS-filtered responses are
        // not replayed from cache.
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          void purgeSupabaseBrowserCaches();
        }
      }
    );

    // THEN check for existing session: wrap in try/catch/finally
    // so isLoading is ALWAYS set to false even if getSession rejects
    (async () => {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        setSession(existingSession);
        setSupabaseUser(existingSession?.user ?? null);
        await syncRealtimeAuth(existingSession);

        if (existingSession?.user) {
          currentAuthIdRef.current = existingSession.user.id;
          setUserScope(existingSession.user.id);
          await fetchUserData(existingSession.user.id);
        }
      } catch (err) {
        console.error('B2: getSession bootstrap failed, clearing auth state', err);
        setSession(null);
        setSupabaseUser(null);
        setUser(null);
        setUserRoles([]);
        setIsRealtimeReady(false);
      } finally {
        // Only set loading false AFTER fetchUserData completes
        initialFetchDoneRef.current = true;
        setIsLoading(false);
      }
    })();

    // F3: cross-tab signout. When another tab signs out, this tab also
    // drops its session so a stale UI cannot keep serving authenticated
    // requests on shared workstations.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'crm_auth_signal' || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue);
        if (msg?.type === 'SIGNED_OUT') {
          // Force a local supabase signOut (clears its own storage too)
          void supabase.auth.signOut().catch(() => { /* no-op */ });
        }
      } catch { /* no-op */ }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, [fetchUserData, syncRealtimeAuth]);

  const signIn = async (email: string, password: string) => {
    // A4-A10: anti-brute-force rate limit (15 min window, 10 attempts, 15 min lock).
    const { consumeAuthRateLimit, resetAuthRateLimit, formatRetryAfter } = await import(
      "@/lib/auth-rate-limit"
    );
    const rl = await consumeAuthRateLimit(email, "signin");
    if (!rl.allowed) {
      const wait = rl.retry_after_seconds ?? 900;
      // A8: send lockout notification email (fire-and-forget, server-side dedup 1h)
      if (rl.locked) {
        void supabase.functions.invoke("auth-lockout-email", {
          body: {
            email,
            retry_minutes: Math.ceil(wait / 60),
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          },
        }).catch(() => { /* best-effort */ });
      }
      return {
        error: new Error(
          `Troppi tentativi di accesso. Riprova fra ${formatRetryAfter(wait)}.`,
        ),
      };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      void resetAuthRateLimit(email, "signin");
    }
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    // A7: enforce password policy at runtime (mirror of edge _shared/password-policy)
    const { validatePassword } = await import("@/lib/password-policy");
    const policy = validatePassword(password);
    if (!policy.ok) {
      return { error: new Error(policy.error || "Password non valida") };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName || email
        }
      }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    // Capture identifiers BEFORE local teardown — once supabase.auth.signOut()
    // runs, auth.uid() in the RPC would be NULL and the purge would be skipped.
    const outgoingAuthId = supabaseUser?.id ?? session?.user?.id ?? null;
    let outgoingBrandId: string | null = null;
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('crm_current_brand_id') : null;
      outgoingBrandId = raw && raw !== 'all' ? raw : null;
    } catch { /* no-op */ }

    try {
      const { logSessionEvent } = await import('@/lib/session-audit');
      await logSessionEvent('signout');
    } catch { /* best-effort */ }

    // F3: server-side session-data purge (RPC). Must run BEFORE supabase.auth.signOut()
    // so the JWT is still valid; failure is non-fatal (cron is the safety net).
    try {
      const { purgeServerSessionData } = await import('@/lib/session-purge');
      await purgeServerSessionData(outgoingAuthId, outgoingBrandId);
    } catch { /* best-effort */ }

    currentAuthIdRef.current = null;
    await supabase.auth.signOut();
    clearIdleActivity();
    setUser(null);
    setUserRoles([]);
    setSession(null);
    setSupabaseUser(null);
    setIsRealtimeReady(false);
    // F3: explicit purge of any residual sb-*-auth-token entries.
    purgeSupabaseAuthStorage();
    await purgeSupabaseBrowserCaches();
    await clearAllQueryCaches();
    purgeUserScopedStorage();
    setUserScope(null);
    // F3: broadcast signout to other tabs on the same origin.
    try {
      localStorage.setItem('crm_auth_signal', JSON.stringify({ type: 'SIGNED_OUT', t: Date.now() }));
      localStorage.removeItem('crm_auth_signal');
    } catch { /* no-op */ }
  };

  const hasRole = (role: AppRole, brandId?: string): boolean => {
    if (brandId) {
      return userRoles.some(r => r.role === role && r.brand_id === brandId);
    }
    return userRoles.some(r => r.role === role);
  };

  const isAdmin = hasRole('admin');
  const isCeo = hasRole('ceo');

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        supabaseUser,
        userRoles,
        isLoading,
        isRealtimeReady,
        signIn,
        signUp,
        signOut,
        hasRole,
        isAdmin,
        isCeo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
