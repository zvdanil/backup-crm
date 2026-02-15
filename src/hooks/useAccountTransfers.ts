import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface AccountTransfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  transfer_date: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
  is_cancelled: boolean;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  from_account?: {
    id: string;
    name: string;
  };
  to_account?: {
    id: string;
    name: string;
  };
}

export interface AccountTransferInsert {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  transfer_date: string;
  description?: string | null;
}

export function useAccountTransfers(accountId?: string) {
  return useQuery({
    queryKey: ['account_transfers', accountId],
    queryFn: async () => {
      let query = supabase
        .from('account_transfers')
        .select(`
          *,
          from_account:payment_accounts!account_transfers_from_account_id_fkey(id, name),
          to_account:payment_accounts!account_transfers_to_account_id_fkey(id, name)
        `)
        .order('transfer_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (accountId) {
        query = query.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as AccountTransfer[];
    },
  });
}

export function useCreateAccountTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transfer: AccountTransferInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Проверяем, существует ли функция (миграция применена)
      const { data, error } = await supabase.rpc('create_account_transfer', {
        p_from_account_id: transfer.from_account_id,
        p_to_account_id: transfer.to_account_id,
        p_amount: transfer.amount,
        p_transfer_date: transfer.transfer_date,
        p_description: transfer.description || null,
        p_created_by: user?.id || null,
      });

      if (error) {
        // Если функция не найдена, значит миграция не применена
        if (error.code === '42883' || error.message.includes('does not exist')) {
          throw new Error('Функція переказів не знайдена. Будь ласка, застосуйте міграцію бази даних.');
        }
        console.error('Error creating transfer:', error);
        throw error;
      }
      
      // Проверяем, что обе транзакции созданы
      if (data) {
        // Проверяем expense транзакцию
        const { data: expenseTx, error: expenseError } = await supabase
          .from('finance_transactions')
          .select('id, type, account_id, amount')
          .eq('transfer_id', data)
          .eq('type', 'expense')
          .eq('account_id', transfer.from_account_id)
          .single();
        
        if (expenseError || !expenseTx) {
          console.error('Expense transaction not found after transfer creation:', expenseError);
        }
        
        // Проверяем payment транзакцию
        const { data: paymentTx, error: paymentError } = await supabase
          .from('finance_transactions')
          .select('id, type, account_id, amount')
          .eq('transfer_id', data)
          .eq('type', 'payment')
          .eq('account_id', transfer.to_account_id)
          .single();
        
        if (paymentError || !paymentTx) {
          console.error('Payment transaction not found after transfer creation:', paymentError);
        }
      }
      
      return data as string; // Returns transfer ID
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account_transfers'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['account_balance'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['account_transactions'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['financial-summary-report'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'], exact: false });
      toast({ title: 'Переказ виконано' });
    },
    onError: (error: any) => {
      toast({
        title: 'Помилка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useCancelAccountTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      transferId,
      cancellationReason,
    }: {
      transferId: string;
      cancellationReason?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.rpc('cancel_account_transfer', {
        p_transfer_id: transferId,
        p_cancelled_by: user?.id || null,
        p_cancellation_reason: cancellationReason || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account_transfers'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['account_balance'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['account_transactions'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['financial-summary-report'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'], exact: false });
      toast({ title: 'Переказ скасовано' });
    },
    onError: (error: any) => {
      toast({
        title: 'Помилка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
