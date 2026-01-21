import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface ExpenseJournalEntry {
  id: string;
  activity_id: string;
  expense_article_id: string;
  entry_date: string;
  quantity: number | null;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseJournalEntryInsert {
  activity_id: string;
  expense_article_id: string;
  entry_date: string;
  quantity: number | null;
  amount: number;
}

export function useExpenseJournalEntries(activityId: string | undefined, month: number, year: number) {
  return useQuery({
    queryKey: ['expense_journal_entries', activityId, month, year],
    queryFn: async () => {
      if (!activityId) return [];
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('expense_journal_entries')
        .select('*')
        .eq('activity_id', activityId)
        .gte('entry_date', startDate)
        .lte('entry_date', endDate);
      if (error) throw error;
      return (data || []) as ExpenseJournalEntry[];
    },
    enabled: !!activityId,
  });
}

export function useUpsertExpenseJournalEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: ExpenseJournalEntryInsert & { description: string | null; quantityLabel?: string | null }) => {
      const { description, quantityLabel, ...payload } = entry;
      const { data, error } = await supabase
        .from('expense_journal_entries')
        .upsert(payload, {
          onConflict: 'expense_article_id,entry_date',
        })
        .select()
        .single();
      if (error) throw error;

      const { error: txError } = await supabase
        .from('finance_transactions')
        .upsert(
          {
            expense_entry_id: data.id,
            expense_article_id: data.expense_article_id,
            activity_id: data.activity_id,
            type: 'household',
            amount: data.amount,
            date: data.entry_date,
            description: description,
            category: quantityLabel || null,
            quantity: data.quantity,
            student_id: null,
            staff_id: null,
            expense_category_id: null,
          },
          {
            onConflict: 'expense_entry_id',
          }
        );
      if (txError) throw txError;

      return data as ExpenseJournalEntry;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['expense_journal_entries', data.activity_id] });
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteExpenseJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ activityId, articleId, date }: { activityId: string; articleId: string; date: string }) => {
      const { data: entry, error: findError } = await supabase
        .from('expense_journal_entries')
        .select('id')
        .eq('expense_article_id', articleId)
        .eq('entry_date', date)
        .maybeSingle();
      if (findError) throw findError;

      if (entry?.id) {
        const { error: txError } = await supabase
          .from('finance_transactions')
          .delete()
          .eq('expense_entry_id', entry.id);
        if (txError) throw txError;
      }

      const { error } = await supabase
        .from('expense_journal_entries')
        .delete()
        .eq('expense_article_id', articleId)
        .eq('entry_date', date);
      if (error) throw error;

      return { activityId };
    },
    onSuccess: ({ activityId }) => {
      queryClient.invalidateQueries({ queryKey: ['expense_journal_entries', activityId] });
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
