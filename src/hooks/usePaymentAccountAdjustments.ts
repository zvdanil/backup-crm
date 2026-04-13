import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { fetchAllRows } from '@/lib/supabasePagination';

const supabaseAny = supabase as any;

export interface PaymentAccountAdjustment {
  id: string;
  account_id: string;
  adjustment_date: string;
  amount: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export function usePaymentAccountAdjustments(accountId: string) {
  return useQuery({
    queryKey: ['payment_account_adjustments', accountId],
    queryFn: async (): Promise<PaymentAccountAdjustment[]> => {
      if (!accountId) return [];
      const data = await fetchAllRows<any>((from, to) =>
        supabaseAny
          .from('payment_account_adjustments')
          .select('*')
          .eq('account_id', accountId)
          .order('adjustment_date', { ascending: true })
          .range(from, to)
      );
      return data as PaymentAccountAdjustment[];
    },
    enabled: !!accountId,
  });
}

export function useCreatePaymentAccountAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (adjustment: {
      account_id: string;
      adjustment_date: string;
      amount: number;
      notes?: string | null;
    }) => {
      const { data, error } = await supabaseAny
        .from('payment_account_adjustments')
        .insert(adjustment)
        .select('*')
        .single();

      if (error) throw error;
      return data as PaymentAccountAdjustment;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment_account_adjustments'] });
      toast({ title: 'Коригування рахунку збережено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: (error as Error).message, variant: 'destructive' });
    },
  });
}

export function useUpdatePaymentAccountAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...update }: { id: string; amount?: number; notes?: string | null }) => {
      const { data, error } = await supabaseAny
        .from('payment_account_adjustments')
        .update(update)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as PaymentAccountAdjustment;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment_account_adjustments'] });
      toast({ title: 'Коригування рахунку оновлено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: (error as Error).message, variant: 'destructive' });
    },
  });
}
