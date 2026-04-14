import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { FinanceTransaction } from '@/hooks/useFinanceTransactions';

const supabaseAny = supabase as any;

export type CashWithdrawal = {
  id: string;
  expense_transaction_id: string;
  income_transaction_id: string | null;
  cash_account_id: string;
  commission_percent: number;
  commission_amount: number;
  credited_amount: number;
  recipient_note: string | null;
  created_at?: string;
  updated_at?: string;
};

export function useCreateCashWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      expenseTransactionId: string;
      cashAccountId: string;
      commissionPercent: number;
      creditedAmount: number;
      recipientNote?: string | null;
    }) => {
      const { data: expenseTx, error: fetchError } = await supabaseAny
        .from('finance_transactions')
        .select('id, type, amount, date, description, cash_withdrawal_id')
        .eq('id', payload.expenseTransactionId)
        .single();

      if (fetchError) throw fetchError;
      if (!expenseTx) throw new Error('Не знайдено транзакцію');
      if (expenseTx.type !== 'expense') throw new Error('Можна відмічати тільки витрату');
      if (expenseTx.cash_withdrawal_id) throw new Error('Транзакцію вже відмічено як виведення коштів');

      const originalAmount = Number(expenseTx.amount || 0);
      const creditedAmount = Math.round(payload.creditedAmount * 100) / 100;
      if (creditedAmount < 0 || creditedAmount > originalAmount) {
        throw new Error('Сума до зарахування має бути в межах від 0 до суми витрати');
      }
      const commissionAmount = Math.round((originalAmount - creditedAmount) * 100) / 100;
      const commissionPercent = Math.round(payload.commissionPercent * 100) / 100;

      const { data: cashWithdrawal, error: insertError } = await supabaseAny
        .from('cash_withdrawals')
        .insert({
          expense_transaction_id: payload.expenseTransactionId,
          cash_account_id: payload.cashAccountId,
          commission_percent: commissionPercent,
          commission_amount: commissionAmount,
          credited_amount: creditedAmount,
          recipient_note: payload.recipientNote || expenseTx.description || null,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      if (!cashWithdrawal?.id) throw new Error('Не вдалося створити запис виведення коштів');

      const { data: incomeTx, error: incomeError } = await supabaseAny
        .from('finance_transactions')
        .insert({
          type: 'payment',
          amount: creditedAmount,
          date: expenseTx.date,
          account_id: payload.cashAccountId,
          description: `Виведено як готівка: ${expenseTx.description || ''}`,
          cash_withdrawal_id: cashWithdrawal.id,
        })
        .select('id')
        .single();

      if (incomeError) {
        await supabaseAny.from('cash_withdrawals').delete().eq('id', cashWithdrawal.id);
        throw incomeError;
      }

      const { error: updateWithdrawalError } = await supabaseAny
        .from('cash_withdrawals')
        .update({ income_transaction_id: incomeTx.id })
        .eq('id', cashWithdrawal.id);
      if (updateWithdrawalError) throw updateWithdrawalError;

      const { error: updateExpenseError } = await supabaseAny
        .from('finance_transactions')
        .update({ cash_withdrawal_id: cashWithdrawal.id })
        .eq('id', payload.expenseTransactionId);
      if (updateExpenseError) throw updateExpenseError;

      return cashWithdrawal.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] });
      queryClient.invalidateQueries({ queryKey: ['student_total_balance'] });
      queryClient.invalidateQueries({ queryKey: ['payment_allocation'] });
      toast({ title: 'Виведення коштів створено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteCashWithdrawal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cashWithdrawalId: string) => {
      const { data: withdrawal, error: fetchError } = await supabaseAny
        .from('cash_withdrawals')
        .select('expense_transaction_id, income_transaction_id')
        .eq('id', cashWithdrawalId)
        .single();

      if (fetchError) throw fetchError;
      if (!withdrawal) throw new Error('Не знайдено виведення коштів');

      const { error: updateError } = await supabaseAny
        .from('finance_transactions')
        .update({ cash_withdrawal_id: null })
        .eq('id', withdrawal.expense_transaction_id);
      if (updateError) throw updateError;

      if (withdrawal.income_transaction_id) {
        const { error: deleteIncomeError } = await supabaseAny
          .from('finance_transactions')
          .delete()
          .eq('id', withdrawal.income_transaction_id);
        if (deleteIncomeError) throw deleteIncomeError;
      }

      const { error: deleteError } = await supabaseAny
        .from('cash_withdrawals')
        .delete()
        .eq('id', cashWithdrawalId);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] });
      queryClient.invalidateQueries({ queryKey: ['student_total_balance'] });
      queryClient.invalidateQueries({ queryKey: ['payment_allocation'] });
      toast({ title: 'Позначку виведення коштів знято' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
