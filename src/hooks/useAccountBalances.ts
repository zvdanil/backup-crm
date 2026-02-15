import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const supabaseAny = supabase as any;

export interface AccountBalance {
  account_id: string;
  expected_income: number; // Ожидаемый доход (income транзакции)
  actual_receipts: number; // Реальные поступления (payment транзакции)
  expenses: number; // Расходы (сумма всех источников, как в финансовом отчёте)
  transfers_out: number; // Переводы на другой счёт
  free_funds: number; // Залишок на рахунку = (actual_receipts + opening_balance) - actual_expenses
  expected_receipts: number; // Ожидаемые поступления = expected_income - actual_receipts
  opening_balance: number; // Внесений залишок (payment_accounts + account_opening_balances по студентах)
}

/**
 * Розрахунок залишку на рахунку за логікою фінансового звіту:
 * реальні доходи (payment + внесені залишки) − реальні витрати (staff_payouts, expense_journal_entries,
 * finance_transactions, перекази, dividend_legs; з урахуванням повернень за харчування).
 */
export function useAccountBalance(accountId: string) {
  return useQuery({
    queryKey: ['account_balance', accountId],
    queryFn: async (): Promise<AccountBalance> => {
      const matchesAccount = (id: string | null) => id === accountId;

      const [
        { data: accountData },
        { data: accountOpeningBalancesData },
        { data: paymentData, error: paymentError },
        { data: incomeData, error: incomeError },
        { data: staffPayoutsData },
        { data: expenseEntriesData },
        { data: directExpenseData },
        { data: transferExpenseData },
        { data: dividendPayoutsData },
      ] = await Promise.all([
        supabaseAny
          .from('payment_accounts')
          .select('opening_balance_amount')
          .eq('id', accountId)
          .single(),
        supabaseAny
          .from('account_opening_balances')
          .select('amount')
          .eq('account_id', accountId),
        supabaseAny
          .from('finance_transactions')
          .select('amount')
          .eq('account_id', accountId)
          .eq('type', 'payment'),
        supabaseAny
          .from('finance_transactions')
          .select('amount')
          .eq('account_id', accountId)
          .eq('type', 'income'),
        supabaseAny
          .from('staff_payouts')
          .select('amount, account_id, dividend_payout_id')
          .eq('account_id', accountId)
          .or('is_deleted.is.null,is_deleted.eq.false'),
        supabaseAny
          .from('expense_journal_entries')
          .select('amount, account_id, activity_id, dividend_payout_id, activities(is_actual_expense, account_id)'),
        supabaseAny
          .from('finance_transactions')
          .select('amount, account_id, activity_id, expense_entry_id, transfer_id, dividend_payout_id, activities(is_actual_expense, account_id)')
          .in('type', ['expense', 'household'])
          .is('expense_entry_id', null)
          .is('transfer_id', null),
        supabaseAny
          .from('finance_transactions')
          .select('amount, account_id, transfer_id, dividend_payout_id')
          .eq('account_id', accountId)
          .eq('type', 'expense')
          .not('transfer_id', 'is', null),
        supabaseAny
          .from('dividend_payout_legs')
          .select('payout_id, account_id, amount')
          .eq('account_id', accountId),
      ]);

      if (paymentError) throw paymentError;
      if (incomeError) throw incomeError;

      const openingFromAccount = Number(accountData?.opening_balance_amount ?? 0) || 0;
      const openingFromStudents = (accountOpeningBalancesData || []).reduce(
        (sum: number, row: any) => sum + Number(row.amount || 0),
        0
      );
      const opening_balance = openingFromAccount + openingFromStudents;
      const actual_receipts = (paymentData || []).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      const expected_income = (incomeData || []).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

      // Виплати зарплати
      const salaryTotal = (staffPayoutsData || []).reduce((sum: number, p: any) => {
        if (p.dividend_payout_id) return sum;
        if (matchesAccount(p.account_id)) return sum + (p.amount || 0);
        return sum;
      }, 0);

      // Витрати з expense_journal_entries (is_actual_expense)
      const expenseEntriesTotal = (expenseEntriesData || []).reduce((sum: number, e: any) => {
        if (e.dividend_payout_id) return sum;
        const isActual = e.activities?.is_actual_expense || false;
        if (isActual) {
          const accId = e.account_id || e.activities?.account_id || null;
          if (matchesAccount(accId)) return sum + (e.amount || 0);
        }
        return sum;
      }, 0);

      // Витрати з finance_transactions (прямі, без expense_entry_id)
      const directExpenseTotal = (directExpenseData || []).reduce((sum: number, tx: any) => {
        if (tx.dividend_payout_id) return sum;
        const isActual = tx.activities?.is_actual_expense || false;
        if (isActual) {
          const accId = tx.account_id || tx.activities?.account_id || null;
          if (matchesAccount(accId)) return sum + (tx.amount || 0);
        }
        return sum;
      }, 0);

      // Перекази з рахунку
      const transfers_out = (transferExpenseData || []).reduce((sum: number, tx: any) => {
        if (tx.dividend_payout_id) return sum;
        if (matchesAccount(tx.account_id)) return sum + (tx.amount || 0);
        return sum;
      }, 0);

      // Виплати дивідендів (dividend_payout_legs)
      const dividendTotal = (dividendPayoutsData || []).reduce((sum: number, leg: any) => {
        if (matchesAccount(leg.account_id)) return sum + Number(leg.amount || 0);
        return sum;
      }, 0);

      const expenses = salaryTotal + expenseEntriesTotal + directExpenseTotal + dividendTotal;

      // Залишок = реальні доходи (з внесеними залишками) − реальні витрати
      const free_funds = opening_balance + actual_receipts - expenses - transfers_out;
      const expected_receipts = expected_income - actual_receipts;

      return {
        account_id: accountId,
        expected_income,
        actual_receipts,
        expenses,
        transfers_out,
        free_funds,
        expected_receipts,
        opening_balance,
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
