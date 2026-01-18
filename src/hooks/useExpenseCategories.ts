import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface ExpenseCategory {
  id: string;
  activity_id: string;
  name: string;
  created_at: string | null;
}

export type ExpenseCategoryInsert = Omit<ExpenseCategory, 'id' | 'created_at'>;

export function useExpenseCategories(activityId: string | undefined) {
  return useQuery({
    queryKey: ['expense-categories', activityId],
    queryFn: async () => {
      if (!activityId) return [];
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('activity_id', activityId)
        .order('name');

      if (error) throw error;
      return (data || []) as ExpenseCategory[];
    },
    enabled: !!activityId,
  });
}

export function useCreateExpenseCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (category: ExpenseCategoryInsert) => {
      const { data, error } = await supabase
        .from('expense_categories')
        .insert(category)
        .select()
        .single();

      if (error) throw error;
      return data as ExpenseCategory;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories', data.activity_id] });
      toast({ title: 'Підкатегорію додано' });
    },
    onError: (error: Error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
