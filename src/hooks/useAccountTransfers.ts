import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface AccountTransfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  commission_amount: number;
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
  commission_amount?: number;
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
      
      // If no transfers, return empty array
      if (!data || data.length === 0) {
        return [] as AccountTransfer[];
      }
      
      // Get commission amounts from finance_transactions
      // Commission is an expense transaction with transfer_id and activity_id linked to "Комісії"
      const transferIds = data.map(t => t.id);
      
      // First, get the "Комісії" activity id
      const { data: commissionActivity } = await supabase
        .from('activities')
        .select('id')
        .eq('name', 'Комісії')
        .eq('category', 'expense')
        .maybeSingle();
      
      // Build a map of transfer_id -> commission_amount
      const commissionMap: Record<string, number> = {};
      
      if (commissionActivity) {
        const { data: commissionTxs } = await supabase
          .from('finance_transactions')
          .select('transfer_id, amount')
          .in('transfer_id', transferIds)
          .eq('activity_id', commissionActivity.id)
          .eq('type', 'expense');
        
        if (commissionTxs) {
          commissionTxs.forEach(tx => {
            if (tx.transfer_id) {
              commissionMap[tx.transfer_id] = Number(tx.amount) || 0;
            }
          });
        }
      }
      
      // Enrich transfers with commission_amount
      const enrichedData = data.map(transfer => ({
        ...transfer,
        commission_amount: commissionMap[transfer.id] || 0,
      }));
      
      return enrichedData as AccountTransfer[];
    },
  });
}

export function useCreateAccountTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transfer: AccountTransferInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get account names for commission description
      const { data: fromAccount } = await supabase
        .from('payment_accounts')
        .select('name')
        .eq('id', transfer.from_account_id)
        .single();
      
      const { data: toAccount } = await supabase
        .from('payment_accounts')
        .select('name')
        .eq('id', transfer.to_account_id)
        .single();
      
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
      
      const transferId = data;
      
      // Проверяем, что обе транзакции созданы
      if (transferId) {
        // Проверяем expense транзакцию
        const { data: expenseTx, error: expenseError } = await supabase
          .from('finance_transactions')
          .select('id, type, account_id, amount')
          .eq('transfer_id', transferId)
          .eq('type', 'expense')
          .eq('account_id', transfer.from_account_id)
          .single();
        
        if (expenseError || !expenseTx) {
          console.error('Expense transaction not found after transfer creation:', expenseError);
        }
        
        // Проверяем payment транзакцию (amount - commission)
        const receivedAmount = transfer.commission_amount 
          ? transfer.amount - transfer.commission_amount 
          : transfer.amount;
          
        const { data: paymentTx, error: paymentError } = await supabase
          .from('finance_transactions')
          .select('id, type, account_id, amount')
          .eq('transfer_id', transferId)
          .eq('type', 'payment')
          .eq('account_id', transfer.to_account_id)
          .single();
        
        if (paymentError || !paymentTx) {
          console.error('Payment transaction not found after transfer creation:', paymentError);
        }
        
        // Update payment amount to received amount (after commission)
        if (transfer.commission_amount && transfer.commission_amount > 0 && paymentTx) {
          await (supabase as any)
            .from('finance_transactions')
            .update({ amount: receivedAmount })
            .eq('id', paymentTx.id);
        }
        
        // Создаём транзакцию комиссии в журнале "Комісії"
        if (transfer.commission_amount && transfer.commission_amount > 0) {
          // Ищем activity "Комісії"
          const { data: commissionActivity } = await supabase
            .from('activities')
            .select('id')
            .eq('name', 'Комісії')
            .eq('category', 'expense')
            .maybeSingle();
          
          if (commissionActivity) {
            const commissionDescription = `комісія за переказ ${fromAccount?.name || 'рахунок'} → ${toAccount?.name || 'рахунок'}${transfer.description ? ': ' + transfer.description : ''}`;
            
            await (supabase as any).from('finance_transactions').insert({
              type: 'expense',
              activity_id: commissionActivity.id,
              staff_id: null,
              student_id: null,
              expense_category_id: null,
              amount: transfer.commission_amount,
              date: transfer.transfer_date,
              description: commissionDescription,
              account_id: transfer.from_account_id,
              transfer_id: transferId,
            });
          }
        }
      }
      
      return transferId as string; // Returns transfer ID
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
