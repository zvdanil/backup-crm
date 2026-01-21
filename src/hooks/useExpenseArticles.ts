import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type ExpenseInputMode = 'rate' | 'manual';

export interface ExpenseArticle {
  id: string;
  activity_id: string;
  name: string;
  input_mode: ExpenseInputMode;
  rate: number;
  created_at: string;
  updated_at: string;
}

export type ExpenseArticleInsert = Omit<ExpenseArticle, 'id' | 'created_at' | 'updated_at'>;
export type ExpenseArticleUpdate = Partial<ExpenseArticleInsert> & { id: string };

export function useExpenseArticles(activityId: string | undefined) {
  return useQuery({
    queryKey: ['expense_articles', activityId],
    queryFn: async () => {
      if (!activityId) return [];
      const { data, error } = await supabase
        .from('expense_articles')
        .select('*')
        .eq('activity_id', activityId)
        .order('name');
      if (error) throw error;
      return (data || []) as ExpenseArticle[];
    },
    enabled: !!activityId,
  });
}

export function useCreateExpenseArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (article: ExpenseArticleInsert) => {
      const { data, error } = await supabase
        .from('expense_articles')
        .insert(article)
        .select()
        .single();
      if (error) throw error;
      return data as ExpenseArticle;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['expense_articles', data.activity_id] });
      toast({ title: 'Статтю створено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateExpenseArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...article }: ExpenseArticleUpdate) => {
      const { data, error } = await supabase
        .from('expense_articles')
        .update(article)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ExpenseArticle;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['expense_articles', data.activity_id] });
      toast({ title: 'Статтю оновлено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteExpenseArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activityId }: { id: string; activityId: string }) => {
      const { error } = await supabase
        .from('expense_articles')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return activityId;
    },
    onSuccess: (activityId) => {
      queryClient.invalidateQueries({ queryKey: ['expense_articles', activityId] });
      queryClient.invalidateQueries({ queryKey: ['expense_journal_entries', activityId] });
      toast({ title: 'Статтю видалено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
