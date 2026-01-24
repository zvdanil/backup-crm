import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface PaymentAccount {
  id: string;
  name: string;
  description: string | null;
  details: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PaymentAccountInsert = Omit<PaymentAccount, 'id' | 'created_at' | 'updated_at'>;
export type PaymentAccountUpdate = Partial<PaymentAccountInsert>;

export function usePaymentAccounts() {
  return useQuery({
    queryKey: ['payment_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as PaymentAccount[];
    },
  });
}

export function useCreatePaymentAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (account: PaymentAccountInsert) => {
      const { data, error } = await supabase
        .from('payment_accounts')
        .insert(account)
        .select('*')
        .single();

      if (error) throw error;
      return data as PaymentAccount;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_accounts'] });
      toast({ title: 'Рахунок створено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdatePaymentAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...account }: { id: string } & PaymentAccountUpdate) => {
      const { data, error } = await supabase
        .from('payment_accounts')
        .update(account)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as PaymentAccount;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_accounts'] });
      toast({ title: 'Рахунок оновлено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeletePaymentAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payment_accounts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment_accounts'] });
      toast({ title: 'Рахунок видалено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
