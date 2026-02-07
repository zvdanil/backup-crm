import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { UserRole } from "@/context/AuthContext";

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
    queryKey: ["user_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as UserProfile[];
    },
  });
}

export function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<UserProfile> & { id: string }) => {
      const { data, error } = await supabase
        .from("user_profiles")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return data as UserProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_profiles"] });
      toast({ title: "Профіль оновлено" });
    },
    onError: (error) => {
      toast({
        title: "Помилка",
        description: error.message,
        variant: "destructive",
      });
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Необхідна авторизація для створення користувача");
      }

      // Используем Supabase Edge Function для создания пользователя
      // Работает универсально на любой платформе (Railway, Vercel, etc)
      console.log("[useCreateUser] Calling Supabase Edge Function with data:", {
        email: userData.email,
        parentName: userData.parentName,
        childName: userData.childName,
        role: userData.role,
        isActive: userData.isActive,
      });

      // Вызываем Supabase Edge Function напрямую через fetch
      // чтобы гарантировать отправку Authorization header
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const functionUrl = `${SUPABASE_URL}/functions/v1/create-user`;
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
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

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      console.log("[useCreateUser] User created successfully:", data);
      return data as UserProfile;
    },
    onSuccess: (data) => {
      console.log("[useCreateUser] onSuccess, invalidating queries");
      // Инвалидируем и сразу обновляем список
      queryClient.invalidateQueries({ queryKey: ["user_profiles"] });
      queryClient.refetchQueries({ queryKey: ["user_profiles"] });
      toast({
        title: "Користувача створено",
        description: `Створено: ${data.full_name || data.parent_name || "Користувач"}`,
      });
    },
    onError: (error: any) => {
      let errorMessage = error.message;

      // Обработка специфичных ошибок Supabase
      if (error.status === 429 || error.message?.includes("rate limit")) {
        errorMessage =
          "Перевищено ліміт запитів. Зачекайте кілька хвилин перед повторною спробою.";
      } else if (
        error.message?.includes("already registered") ||
        error.message?.includes("already exists")
      ) {
        errorMessage = "Користувач з таким email вже існує.";
      } else if (error.message?.includes("invalid email")) {
        errorMessage = "Невірний формат email.";
      } else if (error.message?.includes("password")) {
        errorMessage = "Пароль не відповідає вимогам (мінімум 6 символів).";
      }

      toast({
        title: "Помилка створення користувача",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
}
