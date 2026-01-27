import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { UserRole } from '@/context/AuthContext';

export interface UserProfile {
  id: string;
  full_name: string | null;
  parent_name: string | null;
  child_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useUserProfiles() {
  return useQuery({
    queryKey: ['user_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as UserProfile[];
    },
  });
}

export function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<UserProfile> & { id: string }) => {
      const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as UserProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_profiles'] });
      toast({ title: 'Профіль оновлено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export interface CreateUserData {
  email: string;
  password: string;
  parentName: string;
  childName: string;
  role: UserRole;
  isActive: boolean;
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userData: CreateUserData) => {
      // Получаем текущую сессию для авторизации
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Необхідна авторизація для створення користувача');
      }

      // Используем Edge Function для создания пользователя через Admin API
      // Это обходит rate limits для обычной регистрации
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
        },
        body: JSON.stringify({
          email: userData.email,
          password: userData.password,
          parentName: userData.parentName,
          childName: userData.childName,
          role: userData.role,
          isActive: userData.isActive,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error?.message || 'Помилка створення користувача');
      }

      return result.data as UserProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_profiles'] });
      toast({ title: 'Користувача створено' });
    },
    onError: (error: any) => {
      let errorMessage = error.message;
      
      // Обработка специфичных ошибок Supabase
      if (error.status === 429 || error.message?.includes('rate limit')) {
        errorMessage = 'Перевищено ліміт запитів. Зачекайте кілька хвилин перед повторною спробою.';
      } else if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
        errorMessage = 'Користувач з таким email вже існує.';
      } else if (error.message?.includes('invalid email')) {
        errorMessage = 'Невірний формат email.';
      } else if (error.message?.includes('password')) {
        errorMessage = 'Пароль не відповідає вимогам (мінімум 6 символів).';
      }
      
      toast({ 
        title: 'Помилка створення користувача', 
        description: errorMessage, 
        variant: 'destructive' 
      });
    },
  });
}
