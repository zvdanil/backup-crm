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
    // Всегда логируем важные события в консоль
    console.log('[Auth]', ...args);
    // Дополнительное детальное логирование при включенной отладке
    if (window.localStorage.getItem('auth_debug') === '1') {
      console.info('[Auth Debug]', ...args);
    }
  } catch {
    // ignore logging errors
  }
};

// Кэширование профиля в localStorage
const PROFILE_CACHE_KEY = 'auth_profile_cache';
const PROFILE_CACHE_TTL = 30 * 60 * 1000; // 30 минут

interface ProfileCache {
  profile: UserProfile;
  timestamp: number;
  userId: string;
}

function getCachedProfile(userId: string): UserProfile | null {
  try {
    if (typeof window === 'undefined') return null;
    const cached = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!cached) return null;
    
    const cache: ProfileCache = JSON.parse(cached);
    const now = Date.now();
    
    // Проверяем валидность кэша
    if (cache.userId !== userId) {
      logAuth('cache:invalid-user', { cachedUserId: cache.userId, currentUserId: userId });
      clearCachedProfile();
      return null;
    }
    
    if (now - cache.timestamp > PROFILE_CACHE_TTL) {
      logAuth('cache:expired', { ageMs: now - cache.timestamp });
      clearCachedProfile();
      return null;
    }
    
    logAuth('cache:hit', { userId, ageMs: now - cache.timestamp });
    return cache.profile;
  } catch (error) {
    logAuth('cache:error', { error });
    clearCachedProfile();
    return null;
  }
}

function setCachedProfile(profile: UserProfile): void {
  try {
    if (typeof window === 'undefined') return;
    const cache: ProfileCache = {
      profile,
      timestamp: Date.now(),
      userId: profile.id,
    };
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cache));
    logAuth('cache:set', { userId: profile.id });
    
    // Уведомляем другие вкладки об обновлении кэша
    window.localStorage.setItem(`${PROFILE_CACHE_KEY}_updated`, Date.now().toString());
  } catch (error) {
    logAuth('cache:set-error', { error });
  }
}

function clearCachedProfile(): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
    logAuth('cache:cleared');
  } catch (error) {
    logAuth('cache:clear-error', { error });
  }
}

async function fetchOrCreateProfile(user: User): Promise<UserProfile | null> {
  const startedAt = performance.now();
  logAuth('fetchOrCreateProfile:start', { userId: user.id, email: user.email });
  
  // Сначала проверяем существующий профиль
  const { data: existing, error: existingError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existingError) {
    logAuth('fetchOrCreateProfile:error:select', { message: existingError.message, code: existingError.code });
    throw existingError;
  }
  
  if (existing) {
    logAuth('fetchOrCreateProfile:found', {
      userId: user.id,
      role: (existing as UserProfile).role,
      isActive: (existing as UserProfile).is_active,
      durationMs: Math.round(performance.now() - startedAt),
    });
    // Сохраняем в кэш
    setCachedProfile(existing as UserProfile);
    return existing as UserProfile;
  }

  // Профиль не найден - создаем новый с ролью 'newregistration'
  const role: UserRole = 'newregistration';
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || null;
  logAuth('fetchOrCreateProfile:create', { userId: user.id, role, fullName });

  // Пытаемся создать профиль
  // Используем ON CONFLICT для обработки race condition (если триггер уже создал профиль)
  const { data: created, error: createError } = await supabase
    .from('user_profiles')
    .insert({
      id: user.id,
      full_name: fullName,
      role,
      is_active: false, // Новые пользователи неактивны по умолчанию
    })
    .select('*')
    .single();

  if (createError) {
    // Если ошибка из-за конфликта (профиль уже существует), пытаемся получить его
    if (createError.code === '23505' || createError.message.includes('duplicate') || createError.message.includes('unique')) {
      logAuth('fetchOrCreateProfile:conflict-retry', { userId: user.id });
      // Сразу повторная попытка получить профиль (без задержки)
      const { data: retryProfile, error: retryError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (retryError) {
        logAuth('fetchOrCreateProfile:error:retry', { message: retryError.message });
        throw retryError;
      }
      
      if (retryProfile) {
        logAuth('fetchOrCreateProfile:retry-success', {
          userId: user.id,
          role: (retryProfile as UserProfile).role,
          durationMs: Math.round(performance.now() - startedAt),
        });
        // Сохраняем в кэш
        setCachedProfile(retryProfile as UserProfile);
        return retryProfile as UserProfile;
      }
    }
    
    logAuth('fetchOrCreateProfile:error:create', { message: createError.message, code: createError.code });
    throw createError;
  }
  
  logAuth('fetchOrCreateProfile:created', {
    userId: user.id,
    role: (created as UserProfile).role,
    isActive: (created as UserProfile).is_active,
    durationMs: Math.round(performance.now() - startedAt),
  });
  // Сохраняем в кэш
  setCachedProfile(created as UserProfile);
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

    // Проверяем кэш перед запросом к БД
    const cached = getCachedProfile(currentUser.id);
    if (cached) {
      logAuth('loadProfile:from-cache', { userId: currentUser.id });
      return cached;
    }

    // Оптимизированные таймауты: 5 секунд, 2 попытки, задержка 500ms
    const request = withRetry(
      () => withTimeout(fetchOrCreateProfile(currentUser), 5000, 'Profile load timeout'),
      2,
      500
    );

    profilePromiseRef.current = request;
    try {
      const profile = await request;
      // Профиль уже сохранен в кэш внутри fetchOrCreateProfile
      return profile;
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

      // Проверяем кэш перед загрузкой из БД
      const cached = getCachedProfile(userId);
      if (cached) {
        logAuth('authStateChange:profile-from-cache', { userId, event });
        setProfile(cached);
        lastProfileUserIdRef.current = userId;
        setIsLoading(false);
        return;
      }

      // Для новых регистраций (SIGNED_IN после OAuth) логируем, но не ждем
      const isNewRegistration = event === 'SIGNED_IN' && !lastProfileUserIdRef.current;
      if (isNewRegistration) {
        logAuth('authStateChange:new-registration', { userId });
      }

      // Загружаем профиль только если userId изменился и кэша нет
      try {
        const profileData = await loadProfile(newSession.user);
        setProfile(profileData);
        lastProfileUserIdRef.current = userId;
        logAuth('authStateChange:profile-ready', {
          userId,
          role: profileData?.role,
          isActive: profileData?.is_active,
          event,
        });
      } catch (profileError: any) {
        console.error('Profile load error', profileError);
        logAuth('authStateChange:profile-error', { message: profileError?.message, event });
        
        // Retry механизм с проверкой актуальности пользователя
        // Для новых регистраций делаем больше попыток
        if (!profileRetryTimerRef.current) {
          const currentUserId = newSession.user.id;
          const maxRetries = isNewRegistration ? 3 : 1;
          let retryCount = 0;
          
          const retryLoad = async () => {
            profileRetryTimerRef.current = null;
            
            // Проверяем, что профиль все еще не загружен для этого пользователя
            if (lastProfileUserIdRef.current !== currentUserId && retryCount < maxRetries) {
              retryCount++;
              try {
                // Увеличиваем задержку с каждой попыткой
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                const retryProfile = await loadProfile(newSession.user);
                setProfile(retryProfile);
                lastProfileUserIdRef.current = currentUserId;
                logAuth('authStateChange:profile-retry-success', { userId: currentUserId, retryCount });
              } catch (retryError: any) {
                logAuth('authStateChange:profile-retry-error', { message: retryError?.message, retryCount });
                // Планируем следующую попытку
                if (retryCount < maxRetries) {
                  profileRetryTimerRef.current = setTimeout(retryLoad, 2000 * retryCount);
                } else {
                  toast({ 
                    title: 'Помилка профілю', 
                    description: 'Не вдалося завантажити профіль. Спробуйте оновити сторінку.', 
                    variant: 'destructive' 
                  });
                }
              }
            } else {
              logAuth('authStateChange:profile-retry-skip', { 
                reason: lastProfileUserIdRef.current === currentUserId ? 'already-loaded' : 'max-retries',
                userId: currentUserId,
                retryCount
              });
            }
          };
          
          profileRetryTimerRef.current = setTimeout(retryLoad, isNewRegistration ? 1000 : 2000);
        }
      }
    } else {
      // Пользователь вышел
      setProfile(null);
      lastProfileUserIdRef.current = null;
      clearCachedProfile();
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

    // Обработка OAuth callback URL (очистка параметров после обработки)
    const urlParams = new URLSearchParams(window.location.search);
    const hasOAuthCode = urlParams.has('code') || urlParams.has('access_token');
    const hasOAuthError = urlParams.has('error') || urlParams.has('error_description');
    
    console.log('[Auth] Initializing auth', { 
      hasOAuthCode, 
      hasOAuthError,
      url: window.location.href,
      search: window.location.search 
    });
    
    // Явная загрузка начальной сессии
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[Auth] Error getting initial session:', error);
        setIsLoading(false);
        return;
      }
      
      // Если есть ошибка OAuth, но сессия существует - пытаемся восстановить
      if (hasOAuthError && session?.user) {
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');
        console.log('[Auth] OAuth error but session exists, attempting recovery', { 
          error, 
          errorDescription,
          userId: session.user.id 
        });
        
        // Если ошибка связана с созданием профиля, пытаемся создать его вручную
        if (error === 'server_error' && errorDescription?.includes('Database error saving new user')) {
          console.log('[Auth] Attempting to create profile manually after database error');
          loadProfile(session.user)
            .then((profile) => {
              console.log('[Auth] Profile created successfully after error', { profile });
              setProfile(profile);
              lastProfileUserIdRef.current = session.user.id;
              handleAuthChange('INITIAL_SESSION', session);
            })
            .catch((profileError) => {
              console.error('[Auth] Failed to create profile manually', profileError);
              toast({
                title: 'Помилка створення профілю',
                description: 'Користувач створений, але профіль не вдалося створити. Спробуйте увійти ще раз.',
                variant: 'destructive',
              });
            });
          // Очищаем параметры ошибки из URL
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
      }
      
      if (hasOAuthError) {
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');
        console.error('[Auth] OAuth error in URL', { error, errorDescription });
        toast({
          title: 'Помилка авторизації',
          description: errorDescription || error || 'Помилка при авторизації через OAuth',
          variant: 'destructive',
        });
        // Очищаем параметры ошибки из URL
        window.history.replaceState({}, '', window.location.pathname);
      }
      
      if (session?.user) {
        logAuth('initialSession:found', { userId: session.user.id, hasOAuthCode });
        
        // Проверяем кэш перед вызовом handleAuthChange
        const cached = getCachedProfile(session.user.id);
        if (cached) {
          logAuth('initialSession:from-cache', { userId: session.user.id });
          setProfile(cached);
          setSession(session);
          setUser(session.user);
          lastProfileUserIdRef.current = session.user.id;
          setIsLoading(false);
        } else {
          handleAuthChange('INITIAL_SESSION', session);
        }
        
        // Очищаем OAuth параметры из URL после успешной загрузки сессии
        if (hasOAuthCode) {
          window.history.replaceState({}, '', window.location.pathname);
          logAuth('initialSession:oauth-callback-cleaned');
        }
      } else {
        logAuth('initialSession:none');
        // Очищаем OAuth параметры даже если сессии нет (на случай ошибки)
        if (hasOAuthCode) {
          window.history.replaceState({}, '', window.location.pathname);
        }
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

    // Синхронизация кэша профиля между вкладками
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `${PROFILE_CACHE_KEY}_updated` && e.newValue) {
        logAuth('cache:sync-from-storage', { timestamp: e.newValue });
        // Обновляем профиль из кэша, если текущий пользователь совпадает
        if (user?.id) {
          const cached = getCachedProfile(user.id);
          if (cached) {
            setProfile(cached);
            lastProfileUserIdRef.current = user.id;
            logAuth('cache:synced', { userId: user.id });
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Очистка при размонтировании
    return () => {
      subscription.subscription.unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
      // Очищаем retry таймер при размонтировании
      if (profileRetryTimerRef.current) {
        clearTimeout(profileRetryTimerRef.current);
        profileRetryTimerRef.current = null;
      }
    };
  }, [handleAuthChange, user]);

  const signInWithProvider = useCallback(async (provider: 'google' | 'apple') => {
    console.log('[Auth] signInWithProvider called', { provider, url: window.location.origin });
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('[Auth] Missing Supabase configuration', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
      toast({
        title: 'Помилка конфігурації',
        description: 'Не задано VITE_SUPABASE_URL або VITE_SUPABASE_PUBLISHABLE_KEY.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      console.log('[Auth] Starting OAuth sign in', { provider, redirectTo: window.location.origin });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      
      if (error) {
        console.error('[Auth] OAuth sign in error', error);
        toast({ 
          title: 'Помилка входу', 
          description: error.message || 'Не вдалося ініціювати вхід через OAuth', 
          variant: 'destructive' 
        });
      } else {
        console.log('[Auth] OAuth sign in initiated', { provider, data });
        // OAuth должен редиректить, но если этого не происходит, показываем сообщение
        // Обычно редирект происходит автоматически
      }
    } catch (err: any) {
      console.error('[Auth] Unexpected error during OAuth sign in', err);
      toast({ 
        title: 'Помилка входу', 
        description: err?.message || 'Несподівана помилка при спробі входу', 
        variant: 'destructive' 
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    } else {
      // Очищаем кэш при выходе
      clearCachedProfile();
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
