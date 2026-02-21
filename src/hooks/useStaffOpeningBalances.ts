import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getMonthStartDate } from '@/lib/attendance';

export interface StaffOpeningBalance {
  id: string;
  staff_id: string;
  balance_date: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export type StaffOpeningBalanceInsert = {
  staff_id: string;
  balance_date: string;
  amount: number;
};

export type StaffOpeningBalanceUpdate = {
  amount?: number;
};

export function useStaffOpeningBalancesForMonth(staffId: string | null, month?: number, year?: number) {
  const balanceDate = month != null && year != null ? getMonthStartDate(year, month) : null;

  return useQuery({
    queryKey: ['staff_opening_balances', staffId, balanceDate],
    queryFn: async (): Promise<StaffOpeningBalance[]> => {
      if (!staffId || !balanceDate) return [];
      const { data, error } = await supabase
        .from('staff_opening_balances')
        .select('*')
        .eq('staff_id', staffId)
        .eq('balance_date', balanceDate);

      if (error) throw error;
      return (data || []) as StaffOpeningBalance[];
    },
    enabled: !!staffId && !!balanceDate,
  });
}

/** Усі початкові залишки педагога з balance_date <= початок місяця (для загального балансу) */
export function useStaffOpeningBalancesCumulativeUpToMonth(staffId: string | null, month?: number, year?: number) {
  const upToDate = month != null && year != null ? getMonthStartDate(year, month) : null;

  return useQuery({
    queryKey: ['staff_opening_balances_cumulative', staffId, upToDate],
    queryFn: async (): Promise<StaffOpeningBalance[]> => {
      if (!staffId || !upToDate) return [];
      const { data, error } = await supabase
        .from('staff_opening_balances')
        .select('*')
        .eq('staff_id', staffId)
        .lte('balance_date', upToDate);

      if (error) throw error;
      return (data || []) as StaffOpeningBalance[];
    },
    enabled: !!staffId && !!upToDate,
  });
}

export function useCreateStaffOpeningBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: StaffOpeningBalanceInsert) => {
      const { data, error } = await supabase
        .from('staff_opening_balances')
        .upsert(input, {
          onConflict: 'staff_id,balance_date',
          ignoreDuplicates: false,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as StaffOpeningBalance;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff_opening_balances'] });
      queryClient.invalidateQueries({ queryKey: ['staff_opening_balances_cumulative'] });
      toast({ title: 'Залишок додано' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: (error as Error).message, variant: 'destructive' });
    },
  });
}

export function useUpdateStaffOpeningBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...update }: { id: string } & StaffOpeningBalanceUpdate) => {
      const { data, error } = await supabase
        .from('staff_opening_balances')
        .update(update)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as StaffOpeningBalance;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff_opening_balances'] });
      queryClient.invalidateQueries({ queryKey: ['staff_opening_balances_cumulative'] });
      toast({ title: 'Залишок оновлено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: (error as Error).message, variant: 'destructive' });
    },
  });
}

export function useDeleteStaffOpeningBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('staff_opening_balances').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff_opening_balances'] });
      queryClient.invalidateQueries({ queryKey: ['staff_opening_balances_cumulative'] });
      toast({ title: 'Залишок видалено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: (error as Error).message, variant: 'destructive' });
    },
  });
}
