import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type ActivityCategory = 'income' | 'expense' | 'additional_income' | 'household_expense' | 'salary';

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  income: 'Дохід',
  expense: 'Витрата',
  additional_income: 'Дод. дохід',
  household_expense: 'Госп. витрати',
  salary: 'Зарплата',
};

export const ACTIVITY_CATEGORY_COLORS: Record<ActivityCategory, string> = {
  income: 'text-success',
  expense: 'text-destructive',
  additional_income: 'text-success',
  household_expense: 'text-destructive',
  salary: 'text-destructive',
};

export type BillingRuleType = 'fixed' | 'subscription' | 'hourly';

export interface BillingRule {
  rate: number;
  type: BillingRuleType;
}

export interface BillingRules {
  present?: BillingRule;
  sick?: BillingRule;
  absent?: BillingRule;
  vacation?: BillingRule;
  value?: BillingRule; // For hourly/numeric input
}

export interface Activity {
  id: string;
  name: string;
  default_price: number;
  payment_type: 'subscription' | 'per_session';
  teacher_payment_percent: number;
  description: string | null;
  color: string;
  is_active: boolean;
  category: ActivityCategory;
  fixed_teacher_rate: number | null;
  payment_mode: string | null;
  auto_journal: boolean;
  billing_rules: BillingRules | null;
  config: Record<string, any> | null; // JSONB config for activity metadata (e.g., Garden Attendance Journal)
  created_at: string;
  updated_at: string;
}

export interface ActivityPriceHistory {
  id: string;
  activity_id: string;
  billing_rules: BillingRules;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

// ActivityInsert: default_price та payment_type опціональні, оскільки тепер використовується billing_rules
export type ActivityInsert = Omit<Activity, 'id' | 'created_at' | 'updated_at'> & {
  default_price?: number;
  payment_type?: 'subscription' | 'per_session';
};
export type ActivityUpdate = Partial<ActivityInsert>;

export function useActivities() {
  return useQuery({
    queryKey: ['activities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .order('name');
      
      if (error) throw error;
      // Ensure config field exists (default to null if column doesn't exist yet)
      return (data || []).map(activity => ({
        ...activity,
        config: activity.config || null,
      })) as Activity[];
    },
  });
}

export function useActivity(id: string) {
  return useQuery({
    queryKey: ['activities', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      // Ensure config field exists (default to null if column doesn't exist yet)
      return {
        ...data,
        config: data.config || null,
      } as Activity;
    },
    enabled: !!id,
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (activity: ActivityInsert) => {
      // Видаляємо effective_from та effective_to, якщо вони присутні (не повинні бути в таблиці activities)
      const { effective_from, effective_to, ...activityData } = activity as any;
      
      const { data, error } = await supabase
        .from('activities')
        .insert(activityData)
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast({ title: 'Активність створена' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateActivity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...activity }: { id: string } & ActivityUpdate) => {
      // Видаляємо effective_from та effective_to, якщо вони присутні (не повинні бути в таблиці activities)
      const { effective_from, effective_to, ...activityData } = activity as any;
      
      const { data, error } = await supabase
        .from('activities')
        .update(activityData)
        .eq('id', id)
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast({ title: 'Активність оновлена' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteActivity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast({ title: 'Активність видалена' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Activity Price History hooks
export function useActivityPriceHistory(activityId: string) {
  return useQuery({
    queryKey: ['activity_price_history', activityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_price_history')
        .select('*')
        .eq('activity_id', activityId)
        .order('effective_from', { ascending: false });
      
      if (error) throw error;
      return data as ActivityPriceHistory[];
    },
    enabled: !!activityId,
  });
}

export function useCreateActivityPriceHistory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (history: { activity_id: string; billing_rules: BillingRules; effective_from: string }) => {
      // Закриваємо попередній запис історії (якщо він є), встановлюючи effective_to
      const { data: previousHistory, error: findError } = await supabase
        .from('activity_price_history')
        .select('id')
        .eq('activity_id', history.activity_id)
        .is('effective_to', null)
        .maybeSingle();

      if (findError) throw findError;

      // Якщо знайдено попередній запис без effective_to - оновлюємо його, встановлюючи effective_to
      // Встановлюємо effective_to на день раніше, ніж effective_from нового запису,
      // щоб періоди не перетиналися (попередній період закривається до початку нового)
      if (previousHistory) {
        // Віднімаємо 1 день від effective_from нового запису для effective_to попереднього
        const effectiveToDate = new Date(history.effective_from);
        effectiveToDate.setDate(effectiveToDate.getDate() - 1);
        const effectiveToStr = effectiveToDate.toISOString().split('T')[0];
        
        const { error: updateError } = await supabase
          .from('activity_price_history')
          .update({ effective_to: effectiveToStr })
          .eq('id', previousHistory.id);
        
        if (updateError) {
          throw new Error(`Помилка оновлення попереднього запису історії: ${updateError.message}`);
        }
      }

      // Створюємо новий запис історії
      const { data, error } = await supabase
        .from('activity_price_history')
        .insert({
          activity_id: history.activity_id,
          billing_rules: history.billing_rules,
          effective_from: history.effective_from,
          effective_to: null, // Новий запис має effective_to = null (поточний)
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['activity_price_history', variables.activity_id] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast({ title: 'Історія цін оновлена' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Get billing rules for a specific date
export function getBillingRulesForDate(
  activity: Activity | null,
  priceHistory: ActivityPriceHistory[] | undefined,
  date: string
): BillingRules | null {
  if (!activity) return null;

  const dateObj = new Date(date);
  
  // Find applicable history entry
  if (priceHistory && priceHistory.length > 0) {
    const applicableHistory = priceHistory.find(h => {
      const fromDate = new Date(h.effective_from);
      const toDate = h.effective_to ? new Date(h.effective_to) : null;
      return dateObj >= fromDate && (!toDate || dateObj < toDate);
    });
    
    if (applicableHistory) {
      return applicableHistory.billing_rules;
    }
  }

  // Fallback to current activity billing_rules
  return activity.billing_rules;
}
