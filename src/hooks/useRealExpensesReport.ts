import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabasePagination';

export type RealExpenseType = 'expense' | 'salary' | 'household';
export type AdvanceType = 'issue' | 'spend' | null;

export interface RealExpenseRow {
  id: string;
  type: RealExpenseType;
  date: string;
  /** Amount actually charged to account (may be 0 for advance-covered spend) */
  amount: number;
  /** Total real purchase cost — only set for expense_advance_type='spend' */
  real_amount: number | null;
  /** How much of the advance was consumed — only set for expense_advance_type='spend' */
  advance_consumed_amount: number | null;
  expense_advance_type: AdvanceType;
  description: string | null;
  account_id: string | null;
  account_name: string | null;
  activity_id: string | null;
  activity_name: string | null;
  expense_category_id: string | null;
  category_name: string | null;
  staff_id: string | null;
  /** Name of the recipient: staff full_name for salary/advance, null otherwise */
  recipient_name: string | null;
  transfer_id: string | null;
  dividend_payout_id: string | null;
  cash_withdrawal_id: string | null;
  staff_payout_id: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
}

export interface RealExpensesReportParams {
  startDate: string;
  endDate: string;
  accountIds: string[];
  types: RealExpenseType[];
  showCancelled: boolean;
  enabled: boolean;
}

export function useRealExpensesReport(params: RealExpensesReportParams) {
  const { startDate, endDate, accountIds, types, showCancelled, enabled } = params;

  return useQuery({
    queryKey: ['real-expenses-report', startDate, endDate, accountIds, types, showCancelled],
    queryFn: async () => {
      const activeTypes: RealExpenseType[] = types.length > 0
        ? types
        : ['expense', 'salary', 'household'];

      const rows = await fetchAllRows((from, to) => {
        let q = (supabase as any)
          .from('finance_transactions')
          .select('*')
          .in('type', activeTypes)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false })
          .range(from, to);

        if (accountIds.length > 0) {
          q = q.in('account_id', accountIds);
        }

        return q;
      });

      const [
        { data: allAccounts },
        { data: allCategories },
        { data: allActivities },
        { data: allStaff },
      ] = await Promise.all([
        (supabase as any).from('payment_accounts').select('id, name'),
        (supabase as any).from('expense_categories').select('id, name'),
        (supabase as any).from('activities').select('id, name, is_actual_expense'),
        (supabase as any).from('staff').select('id, full_name'),
      ]);

      const accountMap = new Map<string, string>(
        (allAccounts || []).map((a: any) => [a.id, a.name])
      );
      const categoryMap = new Map<string, string>(
        (allCategories || []).map((c: any) => [c.id, c.name])
      );
      const activityMap = new Map<string, { name: string; is_actual_expense: boolean }>(
        (allActivities || []).map((a: any) => [a.id, { name: a.name, is_actual_expense: !!a.is_actual_expense }])
      );
      const staffMap = new Map<string, string>(
        (allStaff || []).map((s: any) => [s.id, s.full_name])
      );

      const result: RealExpenseRow[] = [];

      for (const row of rows) {
        const activity = row.activity_id ? activityMap.get(row.activity_id) : undefined;
        const isTransfer = !!row.transfer_id;
        const advanceType: AdvanceType = row.expense_advance_type ?? null;

        // Mirror useAccountBalances logic:
        // - salary: always changes balance
        // - expense with transfer_id: always changes balance
        // - expense/household without transfer_id: only if is_actual_expense=true
        if (row.type !== 'salary' && !isTransfer) {
          if (!activity?.is_actual_expense) continue;
        }

        if (!showCancelled && row.is_deleted === true) continue;

        // Recipient: staff name for salary and advance operations
        const recipientName = row.staff_id ? (staffMap.get(row.staff_id) ?? null) : null;

        result.push({
          id: row.id,
          type: row.type as RealExpenseType,
          date: row.date,
          amount: row.amount ?? 0,
          real_amount: row.real_amount ?? null,
          advance_consumed_amount: row.advance_consumed_amount ?? null,
          expense_advance_type: advanceType,
          description: row.description,
          account_id: row.account_id,
          account_name: row.account_id ? (accountMap.get(row.account_id) ?? null) : null,
          activity_id: row.activity_id ?? null,
          activity_name: activity?.name ?? null,
          expense_category_id: row.expense_category_id,
          category_name: row.expense_category_id
            ? (categoryMap.get(row.expense_category_id) ?? null)
            : null,
          staff_id: row.staff_id ?? null,
          recipient_name: recipientName,
          transfer_id: row.transfer_id ?? null,
          dividend_payout_id: row.dividend_payout_id ?? null,
          cash_withdrawal_id: row.cash_withdrawal_id ?? null,
          staff_payout_id: row.staff_payout_id ?? null,
          is_deleted: row.is_deleted === true,
          deleted_at: row.deleted_at ?? null,
        });
      }

      return result;
    },
    enabled,
  });
}

/** Human-readable label for an operation type + subtypes */
export function getOperationLabel(row: RealExpenseRow): string {
  if (row.type === 'salary') return 'Виплата зарплати';
  if (row.type === 'household') {
    if (row.expense_advance_type === 'issue') return 'Видача авансу';
    if (row.expense_advance_type === 'spend') return 'Покупка з авансу';
    return 'Госп. витрата';
  }
  if (row.type === 'expense') {
    if (row.expense_advance_type === 'issue') return 'Видача авансу';
    if (row.expense_advance_type === 'spend') return 'Покупка з авансу';
    if (row.transfer_id) return 'Переказ між рахунками';
    if (row.cash_withdrawal_id) return 'Зняття готівки';
    if (row.dividend_payout_id) return 'Виплата дивідендів';
    return 'Пряма витрата';
  }
  return row.type;
}
