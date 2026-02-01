import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AccountBalance {
  account_id: string;
  expected_income: number; // Ожидаемый доход (income транзакции)
  actual_receipts: number; // Реальные поступления (payment транзакции)
  expenses: number; // Расходы (expense транзакции)
  transfers_out: number; // Переводы на другой счёт (пока 0, будет реализовано позже)
  free_funds: number; // Свободные средства = actual_receipts - expenses - transfers_out
  expected_receipts: number; // Ожидаемые поступления = expected_income - actual_receipts
}

export function useAccountBalance(accountId: string) {
  return useQuery({
    queryKey: ['account_balance', accountId],
    queryFn: async (): Promise<AccountBalance> => {
      // Ожидаемый доход: сумма всех income транзакций
      const { data: incomeData, error: incomeError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('account_id', accountId)
        .eq('type', 'income');

      if (incomeError) throw incomeError;

      // Реальные поступления: сумма всех payment транзакций
      const { data: paymentData, error: paymentError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('account_id', accountId)
        .eq('type', 'payment');

      if (paymentError) throw paymentError;

      // Расходы: сумма всех expense транзакций
      const { data: expenseData, error: expenseError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('account_id', accountId)
        .eq('type', 'expense');

      if (expenseError) throw expenseError;

      const expected_income = incomeData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
      const actual_receipts = paymentData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
      const expenses = expenseData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
      const transfers_out = 0; // Пока не реализовано

      const free_funds = actual_receipts - expenses - transfers_out;
      const expected_receipts = expected_income - actual_receipts;

      return {
        account_id: accountId,
        expected_income,
        actual_receipts,
        expenses,
        transfers_out,
        free_funds,
        expected_receipts,
      };
    },
    enabled: !!accountId,
  });
}

export function useAccountTransactions(accountId: string) {
  return useQuery({
    queryKey: ['account_transactions', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_transactions')
        .select('*')
        .eq('account_id', accountId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!accountId,
  });
}
