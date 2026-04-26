import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabasePagination';

export type RealExpenseType = 'expense' | 'salary' | 'household' | 'dividend' | 'transfer';
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
  /** Destination account — only for transfer rows */
  to_account_id: string | null;
  to_account_name: string | null;
  activity_id: string | null;
  activity_name: string | null;
  expense_category_id: string | null;
  category_name: string | null;
  staff_id: string | null;
  /** Name of the recipient: staff full_name for salary/advance, participant name for dividends */
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

const FINANCE_TYPES = ['expense', 'salary', 'household'] as const;
const ALL_DEFAULT_TYPES: RealExpenseType[] = ['expense', 'salary', 'household', 'dividend', 'transfer'];

export function useRealExpensesReport(params: RealExpensesReportParams) {
  const { startDate, endDate, accountIds, types, showCancelled, enabled } = params;

  return useQuery({
    queryKey: ['real-expenses-report', startDate, endDate, accountIds, types, showCancelled],
    queryFn: async () => {
      const activeTypes: RealExpenseType[] = types.length > 0 ? types : ALL_DEFAULT_TYPES;

      const financeTypes = activeTypes.filter((t): t is 'expense' | 'salary' | 'household' =>
        (FINANCE_TYPES as readonly string[]).includes(t)
      );
      const includeDividend = activeTypes.includes('dividend');
      const includeTransfer = activeTypes.includes('transfer');

      // Lookup tables
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

      // ── 1. Finance transactions (expense / salary / household) ──────────────
      if (financeTypes.length > 0) {
        const financeRows = await fetchAllRows((from, to) => {
          let q = (supabase as any)
            .from('finance_transactions')
            .select('*')
            .in('type', financeTypes)
            .gte('date', startDate)
            .lte('date', endDate)
            // transfers and dividend-linked entries have their own dedicated types
            .is('transfer_id', null)
            .is('dividend_payout_id', null)
            .order('date', { ascending: false })
            .range(from, to);

          if (accountIds.length > 0) {
            q = q.in('account_id', accountIds);
          }

          return q;
        });

        for (const row of financeRows) {
          const activity = row.activity_id ? activityMap.get(row.activity_id) : undefined;
          const advanceType: AdvanceType = row.expense_advance_type ?? null;

          if (row.type !== 'salary') {
            if (!activity?.is_actual_expense) continue;
          }

          if (!showCancelled && row.is_deleted === true) continue;

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
            to_account_id: null,
            to_account_name: null,
            activity_id: row.activity_id ?? null,
            activity_name: activity?.name ?? null,
            expense_category_id: row.expense_category_id,
            category_name: row.expense_category_id
              ? (categoryMap.get(row.expense_category_id) ?? null)
              : null,
            staff_id: row.staff_id ?? null,
            recipient_name: row.staff_id ? (staffMap.get(row.staff_id) ?? null) : null,
            transfer_id: null,
            dividend_payout_id: null,
            cash_withdrawal_id: row.cash_withdrawal_id ?? null,
            staff_payout_id: row.staff_payout_id ?? null,
            is_deleted: row.is_deleted === true,
            deleted_at: row.deleted_at ?? null,
          });
        }
      }

      // ── 2. Transfers (account_transfers) ───────────────────────────────────
      if (includeTransfer) {
        let q = (supabase as any)
          .from('account_transfers')
          .select('id, from_account_id, to_account_id, amount, transfer_date, description, is_cancelled')
          .gte('transfer_date', startDate)
          .lte('transfer_date', endDate)
          .order('transfer_date', { ascending: false });

        if (accountIds.length > 0) {
          q = q.in('from_account_id', accountIds);
        }

        const { data: transfers, error: transferError } = await q;
        if (transferError) throw transferError;

        for (const t of transfers || []) {
          if (!showCancelled && t.is_cancelled === true) continue;

          result.push({
            id: t.id,
            type: 'transfer',
            date: t.transfer_date,
            amount: Number(t.amount) || 0,
            real_amount: null,
            advance_consumed_amount: null,
            expense_advance_type: null,
            description: t.description ?? null,
            account_id: t.from_account_id ?? null,
            account_name: t.from_account_id ? (accountMap.get(t.from_account_id) ?? null) : null,
            to_account_id: t.to_account_id ?? null,
            to_account_name: t.to_account_id ? (accountMap.get(t.to_account_id) ?? null) : null,
            activity_id: null,
            activity_name: null,
            expense_category_id: null,
            category_name: null,
            staff_id: null,
            recipient_name: null,
            transfer_id: t.id,
            dividend_payout_id: null,
            cash_withdrawal_id: null,
            staff_payout_id: null,
            is_deleted: t.is_cancelled === true,
            deleted_at: null,
          });
        }
      }

      // ── 3. Dividends (dividend_payout_legs) ────────────────────────────────
      if (includeDividend) {
        const { data: payouts, error: payoutsError } = await (supabase as any)
          .from('dividend_payouts')
          .select('id, payout_date, notes, participant:dividend_participants(id, name)')
          .gte('payout_date', startDate)
          .lte('payout_date', endDate);

        if (payoutsError) throw payoutsError;

        const payoutIds = (payouts || []).map((p: any) => p.id);
        if (payoutIds.length > 0) {
          const payoutMeta: Record<string, { date: string; notes: string | null; participant: string | null }> = {};
          (payouts || []).forEach((p: any) => {
            payoutMeta[p.id] = {
              date: p.payout_date,
              notes: p.notes ?? null,
              participant: p.participant?.name ?? null,
            };
          });

          let legsQ = (supabase as any)
            .from('dividend_payout_legs')
            .select('id, payout_id, account_id, amount')
            .in('payout_id', payoutIds);

          if (accountIds.length > 0) {
            legsQ = legsQ.in('account_id', accountIds);
          }

          const { data: legs, error: legsError } = await legsQ;
          if (legsError) throw legsError;

          for (const leg of legs || []) {
            const meta = payoutMeta[leg.payout_id];
            if (!meta) continue;

            result.push({
              id: `dividend-leg-${leg.id}`,
              type: 'dividend',
              date: meta.date,
              amount: Number(leg.amount) || 0,
              real_amount: null,
              advance_consumed_amount: null,
              expense_advance_type: null,
              description: meta.notes,
              account_id: leg.account_id ?? null,
              account_name: leg.account_id ? (accountMap.get(leg.account_id) ?? null) : null,
              to_account_id: null,
              to_account_name: null,
              activity_id: null,
              activity_name: null,
              expense_category_id: null,
              category_name: null,
              staff_id: null,
              recipient_name: meta.participant,
              transfer_id: null,
              dividend_payout_id: leg.payout_id,
              cash_withdrawal_id: null,
              staff_payout_id: null,
              is_deleted: false,
              deleted_at: null,
            });
          }
        }
      }

      result.sort((a, b) => b.date.localeCompare(a.date));
      return result;
    },
    enabled,
  });
}

/** Human-readable label for an operation type + subtypes */
export function getOperationLabel(row: RealExpenseRow): string {
  if (row.type === 'salary') return 'Виплата зарплати';
  if (row.type === 'dividend') return 'Виплата дивідендів';
  if (row.type === 'transfer') return 'Переказ між рахунками';
  if (row.type === 'household') {
    if (row.expense_advance_type === 'issue') return 'Видача авансу';
    if (row.expense_advance_type === 'spend') return 'Покупка з авансу';
    return 'Госп. витрата';
  }
  if (row.type === 'expense') {
    if (row.expense_advance_type === 'issue') return 'Видача авансу';
    if (row.expense_advance_type === 'spend') return 'Покупка з авансу';
    if (row.cash_withdrawal_id) return 'Зняття готівки';
    return 'Пряма витрата';
  }
  return row.type;
}
