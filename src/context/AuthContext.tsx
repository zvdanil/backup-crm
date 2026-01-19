import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type UserRole = Database['public']['Enums']['user_role'];

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  signInWithProvider: (provider: 'google' | 'apple') => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchOrCreateProfile(user: User): Promise<UserProfile | null> {
  const { data: existing, error: existingError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as UserProfile;

  const { count, error: countError } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true });

  if (countError) throw countError;

  const isFirstUser = count === 0;
  const role: UserRole = isFirstUser ? 'owner' : 'viewer';
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || null;

  const { data: created, error: createError } = await supabase
    .from('user_profiles')
    .insert({
      id: user.id,
      full_name: fullName,
      role,
      is_active: isFirstUser,
    })
    .select('*')
    .single();

  if (createError) throw createError;
  return created as UserProfile;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        10000,
        'Auth session timeout'
      );
      if (error) {
        console.error('Auth session error', error);
        return;
      }

      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        try {
          const profileData = await withTimeout(
            fetchOrCreateProfile(data.session.user),
            10000,
            'Profile load timeout'
          );
          if (profileData && !profileData.is_active) {
            await supabase.auth.signOut();
            toast({
              title: 'Доступ обмежено',
              description: 'Ваш акаунт очікує активації адміністратором.',
            });
            setProfile(null);
          } else {
            setProfile(profileData);
          }
        } catch (profileError: any) {
          console.error('Profile load error', profileError);
          toast({ title: 'Помилка', description: profileError.message, variant: 'destructive' });
        }
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error('Auth session error', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        try {
          const profileData = await withTimeout(
            fetchOrCreateProfile(newSession.user),
            10000,
            'Profile load timeout'
          );
          if (profileData && !profileData.is_active) {
            await supabase.auth.signOut();
            toast({
              title: 'Доступ обмежено',
              description: 'Ваш акаунт очікує активації адміністратором.',
            });
            setProfile(null);
          } else {
            setProfile(profileData);
          }
        } catch (profileError: any) {
          console.error('Profile load error', profileError);
          toast({ title: 'Помилка', description: profileError.message, variant: 'destructive' });
        }
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });
    return () => subscription.subscription.unsubscribe();
  }, [loadSession]);

  const signInWithProvider = useCallback(async (provider: 'google' | 'apple') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      toast({ title: 'Помилка входу', description: error.message, variant: 'destructive' });
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    profile,
    role: profile?.role ?? null,
    isLoading,
    signInWithProvider,
    signOut,
  }), [user, session, profile, isLoading, signInWithProvider, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
