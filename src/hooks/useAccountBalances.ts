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
      // Сначала проверяем, есть ли поле transfer_id (миграция применена)
      const { data: expenseData, error: expenseError } = await supabase
        .from('finance_transactions')
        .select('amount, transfer_id')
        .eq('account_id', accountId)
        .eq('type', 'expense');

      if (expenseError) {
        // Если ошибка из-за отсутствия поля transfer_id, делаем запрос без него
        const { data: expenseDataSimple, error: expenseErrorSimple } = await supabase
          .from('finance_transactions')
          .select('amount')
          .eq('account_id', accountId)
          .eq('type', 'expense');
        
        if (expenseErrorSimple) throw expenseErrorSimple;
        
        const expected_income = incomeData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
        const actual_receipts = paymentData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
        const expenses = expenseDataSimple?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
        const transfers_out = 0; // Миграция не применена, переводов нет
        
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
      }

      // Переводы: сумма всех expense транзакций с transfer_id (переводы со счета)
      const { data: transferOutData, error: transferOutError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('account_id', accountId)
        .eq('type', 'expense')
        .not('transfer_id', 'is', null);

      // Если ошибка при запросе переводов (поле не существует), просто игнорируем
      const transfers_out = transferOutError ? 0 : (transferOutData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0);

      const expected_income = incomeData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
      const actual_receipts = paymentData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
      // Расходы без переводов
      const expenses = (expenseData || []).reduce((sum, t: any) => {
        // Исключаем переводы (у них есть transfer_id)
        if (!t.transfer_id) {
          return sum + (t.amount || 0);
        }
        return sum;
      }, 0);

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
