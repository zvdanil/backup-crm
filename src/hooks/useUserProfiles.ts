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
      // Создаем пользователя через signUp
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            parent_name: userData.parentName,
            child_name: userData.childName,
            full_name: userData.parentName,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Користувач не створений');

      // Ждем немного, чтобы триггер успел создать профиль
      await new Promise(resolve => setTimeout(resolve, 500));

      // Проверяем, существует ли профиль
      const { data: existingProfile, error: checkError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 = not found, это нормально
        throw checkError;
      }

      let profileData: UserProfile;

      if (existingProfile) {
        // Профиль существует, обновляем его
        const { data: updatedProfile, error: updateError } = await supabase
          .from('user_profiles')
          .update({
            role: userData.role,
            is_active: userData.isActive,
            parent_name: userData.parentName,
            child_name: userData.childName,
            full_name: userData.parentName,
          })
          .eq('id', authData.user.id)
          .select('*')
          .single();

        if (updateError) throw updateError;
        profileData = updatedProfile as UserProfile;
      } else {
        // Профиль не существует, создаем его явно
        const { data: createdProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            id: authData.user.id,
            full_name: userData.parentName,
            parent_name: userData.parentName,
            child_name: userData.childName,
            role: userData.role,
            is_active: userData.isActive,
          })
          .select('*')
          .single();

        if (createError) throw createError;
        profileData = createdProfile as UserProfile;
      }

      return profileData;
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
