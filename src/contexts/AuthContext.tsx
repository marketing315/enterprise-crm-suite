import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { purgeSupabaseBrowserCaches } from '@/lib/auth-cache-purge';
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

  const syncRealtimeAuth = useCallback(async (nextSession: Session | null) => {
    const accessToken = nextSession?.access_token;
    if (!accessToken) {
      setIsRealtimeReady(false);
      return;
    }

    try {
      setIsRealtimeReady(false);
      await supabase.realtime.setAuth(accessToken);
      setIsRealtimeReady(true);
    } catch (error) {
      setIsRealtimeReady(false);
      console.warn('Failed to sync realtime auth:', error);
    }
  }, []);

  // H01 FIX: Track current auth user ID to prevent stale fetches
  const currentAuthIdRef = useRef<string | null>(null);
  // H02 FIX: Track if initial fetch is done to prevent double fetch
  const initialFetchDoneRef = useRef(false);

  // H01 FIX: Stable fetchUserData with stale-check via ref
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
        // R07: Reset state on error to prevent stale privileges
        setUser(null);
        setUserRoles([]);
        return;
      }

      // Re-check: user might have logged out while we were fetching
      if (currentAuthIdRef.current !== authUserId) return;

      if (!userData) {
        // R07: No user record found — reset to prevent stale state
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
        // R07: Reset roles on error
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
          currentAuthIdRef.current = newSession.user.id;

          // H02 FIX: Skip if getSession already handled this
          if (!initialFetchDoneRef.current) {
            // Will be handled by getSession below
            return;
          }
          // H01 FIX: Direct call, no setTimeout
          fetchUserData(newSession.user.id);
        } else {
          currentAuthIdRef.current = null;
          setUser(null);
          setUserRoles([]);
        }

        if (event === 'SIGNED_OUT') {
          currentAuthIdRef.current = null;
          setUser(null);
          setUserRoles([]);
          // SECURITY: purge any SW-cached Supabase responses so the next
          // session doesn't inherit the previous user's authorizations.
          void purgeSupabaseBrowserCaches();
        }

        // SECURITY: on token refresh / user update (e.g. role change applied
        // server-side) drop SW caches so stale RLS-filtered responses are
        // not replayed from cache.
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          void purgeSupabaseBrowserCaches();
        }
      }
    );

    // THEN check for existing session — B2 FIX: wrap in try/catch/finally
    // so isLoading is ALWAYS set to false even if getSession rejects
    (async () => {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        setSession(existingSession);
        setSupabaseUser(existingSession?.user ?? null);
        await syncRealtimeAuth(existingSession);

        if (existingSession?.user) {
          currentAuthIdRef.current = existingSession.user.id;
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
        // H03 FIX: Only set loading false AFTER fetchUserData completes
        initialFetchDoneRef.current = true;
        setIsLoading(false);
      }
    })();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserData, syncRealtimeAuth]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
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
    currentAuthIdRef.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setUserRoles([]);
    setSession(null);
    setSupabaseUser(null);
    setIsRealtimeReady(false);
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
