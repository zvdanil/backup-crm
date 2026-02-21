import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getMonthStartDate, getMonthEndDate } from '@/lib/attendance';

export interface ExpenseJournalEntry {
  id: string;
  activity_id: string;
  expense_article_id: string;
  entry_date: string;
  quantity: number | null;
  amount: number;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseJournalEntryInsert {
  activity_id: string;
  expense_article_id: string;
  entry_date: string;
  quantity: number | null;
  amount: number;
  account_id?: string | null; // Счет списания (только для факта)
}

export function useExpenseJournalEntries(activityId: string | undefined, month: number, year: number) {
  return useQuery({
    queryKey: ['expense_journal_entries', activityId, month, year],
    queryFn: async () => {
      if (!activityId) return [];
      const startDate = getMonthStartDate(year, month);
      const endDate = getMonthEndDate(year, month);
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
      
      // Получаем информацию об активности для определения account_id
      const { data: activity, error: activityError } = await supabase
        .from('activities')
        .select('is_actual_expense, account_id')
        .eq('id', entry.activity_id)
        .single();
      
      if (activityError) throw activityError;
      
      // Определяем account_id для finance_transactions
      // Только для факта (is_actual_expense = true)
      let accountId: string | null = null;
      if (activity?.is_actual_expense) {
        // Приоритет: entry.account_id > activity.account_id
        accountId = payload.account_id || activity.account_id || null;
      }
      
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
            account_id: accountId, // Передаем account_id только для факта
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
