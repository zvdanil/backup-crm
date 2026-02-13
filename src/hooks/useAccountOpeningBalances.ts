import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface AccountOpeningBalance {
  id: string;
  account_id: string;
  balance_date: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export type AccountOpeningBalanceInsert = {
  account_id: string;
  balance_date: string;
  amount: number;
};

export type AccountOpeningBalanceUpdate = {
  amount?: number;
};

function getMonthStartDate(year: number, month: number): string {
  return new Date(year, month, 1).toISOString().split('T')[0];
}

export function useAccountOpeningBalancesForMonth(month?: number, year?: number) {
  const balanceDate = month != null && year != null ? getMonthStartDate(year, month) : null;

  return useQuery({
    queryKey: ['account_opening_balances', balanceDate],
    queryFn: async (): Promise<AccountOpeningBalance[]> => {
      if (!balanceDate) return [];
      const { data, error } = await supabase
        .from('account_opening_balances')
        .select('*')
        .eq('balance_date', balanceDate)
        .order('account_id');

      if (error) throw error;
      return (data || []) as AccountOpeningBalance[];
    },
    enabled: !!balanceDate,
  });
}

/** Усі початкові залишки з balance_date <= початок місяця (для переносу на наступні місяці) */
export function useAccountOpeningBalancesCumulativeUpToMonth(month?: number, year?: number) {
  const upToDate = month != null && year != null ? getMonthStartDate(year, month) : null;

  return useQuery({
    queryKey: ['account_opening_balances_cumulative', upToDate],
    queryFn: async (): Promise<AccountOpeningBalance[]> => {
      if (!upToDate) return [];
      const { data, error } = await supabase
        .from('account_opening_balances')
        .select('*')
        .lte('balance_date', upToDate)
        .order('account_id');

      if (error) throw error;
      return (data || []) as AccountOpeningBalance[];
    },
    enabled: !!upToDate,
  });
}

export function useAccountOpeningBalance(accountId: string | null, month?: number, year?: number) {
  const balanceDate = accountId && month != null && year != null ? getMonthStartDate(year, month) : null;

  return useQuery({
    queryKey: ['account_opening_balance', accountId, balanceDate],
    queryFn: async (): Promise<AccountOpeningBalance | null> => {
      if (!accountId || !balanceDate) return null;
      const { data, error } = await supabase
        .from('account_opening_balances')
        .select('*')
        .eq('account_id', accountId)
        .eq('balance_date', balanceDate)
        .maybeSingle();

      if (error) throw error;
      return data as AccountOpeningBalance | null;
    },
    enabled: !!accountId && !!balanceDate,
  });
}

export function useCreateAccountOpeningBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AccountOpeningBalanceInsert) => {
      const { data, error } = await supabase
        .from('account_opening_balances')
        .upsert(input, {
          onConflict: 'account_id,balance_date',
          ignoreDuplicates: false,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as AccountOpeningBalance;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['account_opening_balances'] });
      queryClient.invalidateQueries({ queryKey: ['account_opening_balances_cumulative'] });
      queryClient.invalidateQueries({ queryKey: ['account_opening_balance'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary-report'] });
      queryClient.invalidateQueries({ queryKey: ['student_account_balances'] });
      await queryClient.refetchQueries({ queryKey: ['student_account_balances'] });
      toast({ title: 'Залишок додано' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: (error as Error).message, variant: 'destructive' });
    },
  });
}

export function useUpdateAccountOpeningBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...update }: { id: string } & AccountOpeningBalanceUpdate) => {
      const { data, error } = await supabase
        .from('account_opening_balances')
        .update(update)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as AccountOpeningBalance;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['account_opening_balances'] });
      queryClient.invalidateQueries({ queryKey: ['account_opening_balances_cumulative'] });
      queryClient.invalidateQueries({ queryKey: ['account_opening_balance'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary-report'] });
      queryClient.invalidateQueries({ queryKey: ['student_account_balances'] });
      await queryClient.refetchQueries({ queryKey: ['student_account_balances'] });
      toast({ title: 'Залишок оновлено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: (error as Error).message, variant: 'destructive' });
    },
  });
}

export function useDeleteAccountOpeningBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('account_opening_balances').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['account_opening_balances'] });
      queryClient.invalidateQueries({ queryKey: ['account_opening_balances_cumulative'] });
      queryClient.invalidateQueries({ queryKey: ['account_opening_balance'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary-report'] });
      queryClient.invalidateQueries({ queryKey: ['student_account_balances'] });
      await queryClient.refetchQueries({ queryKey: ['student_account_balances'] });
      toast({ title: 'Залишок видалено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: (error as Error).message, variant: 'destructive' });
    },
  });
}
