import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabasePagination';

const supabaseAny = supabase as any;

export interface AccountBalance {
  account_id: string;
  expected_income: number; // Ожидаемый доход (income транзакции)
  actual_receipts: number; // Реальные поступления (payment транзакции)
  expenses: number; // Расходы (сумма всех источников, как в финансовом отчёте)
  transfers_out: number; // Переводы на другой счёт
  free_funds: number; // Залишок на рахунку = (actual_receipts + opening_balance) - actual_expenses
  expected_receipts: number; // Ожидаемые поступления = expected_income - actual_receipts
  opening_balance: number; // Внесений залишок (payment_accounts). account_opening_balances тільки для корекції балансу учня, не впливає на рахунок
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
        paymentData,
        incomeData,
        salaryTxData,
        { data: expenseEntriesData },
        directExpenseData,
        transferExpenseData,
        adjustmentData,
        { data: dividendPayoutsData },
      ] = await Promise.all([
        supabaseAny
          .from('payment_accounts')
          .select('opening_balance_amount')
          .eq('id', accountId)
          .single(),
        fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('amount')
            .eq('account_id', accountId)
            .eq('type', 'payment')
            .range(from, to)
        ),
        fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('amount')
            .eq('account_id', accountId)
            .eq('type', 'income')
            .range(from, to)
        ),
        fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('amount, dividend_payout_id')
            .eq('account_id', accountId)
            .eq('type', 'salary')
            .range(from, to)
        ),
        supabaseAny
          .from('expense_journal_entries')
          .select('amount, account_id, activity_id, dividend_payout_id, activities(is_actual_expense, account_id)'),
        fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('amount, account_id, activity_id, expense_entry_id, transfer_id, dividend_payout_id, activities(is_actual_expense, account_id)')
            .in('type', ['expense', 'household'])
            .is('expense_entry_id', null)
            .is('transfer_id', null)
            .range(from, to)
        ),
        fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('amount, account_id, transfer_id, dividend_payout_id')
            .eq('account_id', accountId)
            .eq('type', 'expense')
            .not('transfer_id', 'is', null)
            .range(from, to)
        ),
        fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('payment_account_adjustments')
            .select('amount')
            .eq('account_id', accountId)
            .range(from, to)
        ),
        supabaseAny
          .from('dividend_payout_legs')
          .select('payout_id, account_id, amount')
          .eq('account_id', accountId),
      ]);

      const openingFromAccount = Number(accountData?.opening_balance_amount ?? 0) || 0;
      const adjustmentsTotal = (adjustmentData || []).reduce((sum: number, adjustment: any) => sum + Number(adjustment.amount || 0), 0);
      const opening_balance = (adjustmentData || []).length > 0 ? adjustmentsTotal : openingFromAccount;
      const actual_receipts = (paymentData || []).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      const expected_income = (incomeData || []).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

      // Виплати зарплати (з finance_transactions, як у useAccountTransactions)
      const salaryTotal = (salaryTxData || []).reduce((sum: number, tx: any) => {
        if (tx.dividend_payout_id) return sum;
        return sum + Number(tx.amount || 0);
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
      // Нотатка: actual_receipts + transfers_out беруть ВСІ операції за весь час, тому
      // opening_balance повинна включати реальні операції до opening_balance_date
      // Поточна логика: opening_balance = тільки manual entry, а операції перед ним вже в receipts/expenses
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

/** Transaction-like record for unified account history (finance_transactions + dividend legs) */
export interface AccountTransactionItem {
  id: string;
  date: string;
  type: string;
  amount: number;
  description: string | null;
  transfer_id?: string | null;
  cash_withdrawal_id?: string | null;
  _source: 'finance_transaction' | 'dividend_leg';
}

export function useAccountTransactions(accountId: string) {
  return useQuery({
    queryKey: ['account_transactions', accountId],
    queryFn: async (): Promise<AccountTransactionItem[]> => {
      const [txData, { data: legsData, error: legsError }] = await Promise.all([
        fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('id, date, type, amount, description, account_id, transfer_id, dividend_payout_id, cash_withdrawal_id, activities(is_actual_expense)')
            .eq('account_id', accountId)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(from, to)
        ),
        supabaseAny
          .from('dividend_payout_legs')
          .select(
            `
            id,
            payout_id,
            account_id,
            amount,
            dividend_payouts!inner(
              id,
              payout_date,
              notes,
              participant:dividend_participants(id, name)
            )
          `
          )
          .eq('account_id', accountId),
      ]);

      if (legsError) throw legsError;

      // Тільки реальні операції: виключаємо прогнозні та застарілі (advance_payment)
      const transactions = (txData || []).filter((t: any) => {
        if (t.dividend_payout_id) return false;
        if (t.type === 'income') return false; // нарахування — прогноз, не реальний дохід
        if (t.type === 'advance_payment') return false; // застаріла система авансів, не відображаємо
        if (t.type === 'payment' || t.type === 'salary') return true; // реальні дохід і витрата
        if (t.type === 'expense' || t.type === 'household') {
          if (t.transfer_id) return true; // переказ — завжди реальний
          const isActual = t.activities?.is_actual_expense === true;
          return isActual; // тільки факт реальних витрат
        }
        return true;
      }) as any[];

      const dividendItems: AccountTransactionItem[] = (legsData || []).map(
        (leg: any) => {
          const payout = leg.dividend_payouts;
          const participantName =
            payout?.participant?.name ?? 'Учасник';
          const desc = payout?.notes?.trim()
            ? `Дивіденд: ${participantName} — ${payout.notes}`
            : `Дивіденд: ${participantName}`;
          return {
            id: `dividend-leg-${leg.id}`,
            date: payout?.payout_date ?? leg.created_at?.slice(0, 10) ?? '',
            type: 'dividend',
            amount: -Math.abs(Number(leg.amount) || 0),
            description: desc,
            transfer_id: null,
            _source: 'dividend_leg',
          };
        }
      );

      const txItems: AccountTransactionItem[] = transactions.map((t: any) => {
        const isIncome = t.type === 'income' || t.type === 'payment';
        const isTransfer = t.transfer_id != null && String(t.transfer_id).length > 0;
        const displayType = isTransfer ? 'transfer' : t.type;
        return {
          id: t.id,
          date: t.date,
          type: displayType,
          amount:
            isIncome
              ? Math.abs(Number(t.amount) || 0)
              : -Math.abs(Number(t.amount) || 0),
          description: t.description ?? null,
          transfer_id: t.transfer_id ?? null,
          cash_withdrawal_id: t.cash_withdrawal_id ?? null,
          _source: 'finance_transaction',
        };
      });

      const merged = [...txItems, ...dividendItems].sort((a, b) => {
        const da = a.date;
        const db = b.date;
        if (da !== db) return db.localeCompare(da);
        return a._source === 'dividend_leg' ? 1 : -1;
      });

      return merged;
    },
    enabled: !!accountId,
  });
}
