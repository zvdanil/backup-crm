import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const logAuth = (...args: any[]) => {
  try {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('auth_debug') !== '1') return;
    console.info('[Auth]', ...args);
  } catch {
    // ignore logging errors
  }
};

async function fetchOrCreateProfile(user: User): Promise<UserProfile | null> {
  const startedAt = performance.now();
  logAuth('fetchOrCreateProfile:start', { userId: user.id, email: user.email });
  const { data: existing, error: existingError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existingError) {
    logAuth('fetchOrCreateProfile:error:select', { message: existingError.message });
    throw existingError;
  }
  if (existing) {
    logAuth('fetchOrCreateProfile:found', {
      userId: user.id,
      role: (existing as UserProfile).role,
      isActive: (existing as UserProfile).is_active,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return existing as UserProfile;
  }

  const { data: existingProfiles, error: countError } = await supabase
    .from('user_profiles')
    .select('id')
    .limit(1);

  if (countError) {
    logAuth('fetchOrCreateProfile:error:count', { message: countError.message });
    throw countError;
  }

  const isFirstUser = !existingProfiles || existingProfiles.length === 0;
  const role: UserRole = isFirstUser ? 'owner' : 'newregistration';
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || null;
  logAuth('fetchOrCreateProfile:create', { userId: user.id, role, isFirstUser });

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

  if (createError) {
    logAuth('fetchOrCreateProfile:error:create', { message: createError.message });
    throw createError;
  }
  logAuth('fetchOrCreateProfile:created', {
    userId: user.id,
    role: (created as UserProfile).role,
    isActive: (created as UserProfile).is_active,
    durationMs: Math.round(performance.now() - startedAt),
  });
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

async function withRetry<T>(fn: () => Promise<T>, retries: number, delayMs: number): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastProfileUserIdRef = useRef<string | null>(null);
  const initialSessionHandledRef = useRef(false);
  const profilePromiseRef = useRef<Promise<UserProfile | null> | null>(null);
  const profileRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfile = useCallback(async (currentUser: User) => {
    if (profilePromiseRef.current) return profilePromiseRef.current;

    const request = withRetry(
      () => withTimeout(fetchOrCreateProfile(currentUser), 30000, 'Profile load timeout'),
      1,
      500
    );

    profilePromiseRef.current = request;
    try {
      return await request;
    } finally {
      profilePromiseRef.current = null;
    }
  }, []);

  // Обработка изменения состояния авторизации
  const handleAuthChange = useCallback(async (event: string, newSession: Session | null) => {
    logAuth('authStateChange', { event, hasSession: !!newSession });
    
    if (event === 'INITIAL_SESSION') {
      initialSessionHandledRef.current = true;
    }

    // Обновляем сессию и пользователя
    setSession(newSession);
    setUser(newSession?.user ?? null);

    if (newSession?.user) {
      const userId = newSession.user.id;
      
      // Проверяем, нужно ли загружать профиль
      // Используем только lastProfileUserIdRef, без проверки profile (избегаем проблем с замыканием)
      if (lastProfileUserIdRef.current === userId) {
        logAuth('authStateChange:profile-skip', { userId, reason: 'already-loaded' });
        setIsLoading(false);
        return;
      }

      // Загружаем профиль только если userId изменился
      try {
        const profileData = await loadProfile(newSession.user);
        setProfile(profileData);
        lastProfileUserIdRef.current = userId;
        logAuth('authStateChange:profile-ready', {
          userId,
          role: profileData?.role,
          isActive: profileData?.is_active,
        });
      } catch (profileError: any) {
        console.error('Profile load error', profileError);
        logAuth('authStateChange:profile-error', { message: profileError?.message });
        
        // Retry механизм с проверкой актуальности пользователя
        if (!profileRetryTimerRef.current) {
          const currentUserId = newSession.user.id;
          profileRetryTimerRef.current = setTimeout(async () => {
            profileRetryTimerRef.current = null;
            
            // Проверяем, что профиль все еще не загружен для этого пользователя
            // Если lastProfileUserIdRef.current === currentUserId, значит профиль уже загружен, retry не нужен
            if (lastProfileUserIdRef.current !== currentUserId) {
              try {
                const retryProfile = await loadProfile(newSession.user);
                setProfile(retryProfile);
                lastProfileUserIdRef.current = currentUserId;
                logAuth('authStateChange:profile-retry-success', { userId: currentUserId });
              } catch (retryError: any) {
                logAuth('authStateChange:profile-retry-error', { message: retryError?.message });
              }
            } else {
              logAuth('authStateChange:profile-retry-skip', { 
                reason: 'already-loaded', 
                userId: currentUserId 
              });
            }
          }, 2000);
        }
        toast({ 
          title: 'Помилка профілю', 
          description: 'Профіль завантажується довше. Зачекайте або оновіть сторінку.', 
          variant: 'destructive' 
        });
      }
    } else {
      // Пользователь вышел
      setProfile(null);
      lastProfileUserIdRef.current = null;
    }
    
    setIsLoading(false);
  }, [loadProfile]);

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
      toast({
        title: 'Помилка конфігурації',
        description: 'Не задано VITE_SUPABASE_URL або VITE_SUPABASE_PUBLISHABLE_KEY.',
        variant: 'destructive',
      });
      setSession(null);
      setUser(null);
      setProfile(null);
      setIsLoading(false);
      return;
    }

    // Явная загрузка начальной сессии
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting initial session:', error);
        setIsLoading(false);
        return;
      }
      
      if (session?.user) {
        logAuth('initialSession:found', { userId: session.user.id });
        handleAuthChange('INITIAL_SESSION', session);
      } else {
        logAuth('initialSession:none');
        setIsLoading(false);
      }
    });

    // Подписка на изменения состояния авторизации
    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // КРИТИЧНО: Игнорируем TOKEN_REFRESHED для загрузки профиля
      // Это предотвращает постоянные обращения к базе данных
      if (event === 'TOKEN_REFRESHED') {
        logAuth('authStateChange:token-refreshed', { hasSession: !!newSession });
        // Только обновляем сессию, но НЕ загружаем профиль
        setSession(newSession);
        return;
      }

      // Обрабатываем остальные события
      await handleAuthChange(event, newSession);
    });

    // Очистка при размонтировании
    return () => {
      subscription.subscription.unsubscribe();
      // Очищаем retry таймер при размонтировании
      if (profileRetryTimerRef.current) {
        clearTimeout(profileRetryTimerRef.current);
        profileRetryTimerRef.current = null;
      }
    };
  }, [handleAuthChange]);

  const signInWithProvider = useCallback(async (provider: 'google' | 'apple') => {
    if (!supabaseUrl || !supabaseKey) {
      toast({
        title: 'Помилка конфігурації',
        description: 'Не задано VITE_SUPABASE_URL або VITE_SUPABASE_PUBLISHABLE_KEY.',
        variant: 'destructive',
      });
      return;
    }
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
