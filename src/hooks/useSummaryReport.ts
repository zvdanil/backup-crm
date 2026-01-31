import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getMonthStartDate, getMonthEndDate } from '@/lib/attendance';

export interface SummaryReportData {
  incomeTotal: number;
  incomeDetails: Array<{
    activity_id: string;
    account_id: string | null;
    amount: number;
    count: number;
  }>;
  salaryTotal: number;
  salaryDetails: Array<{
    staff_id: string;
    staff_name: string;
    activity_id: string | null;
    amount: number;
    count: number;
  }>;
  expensesTotal: number;
  expensesDetails: Array<{
    category_id: string | null;
    category_name: string | null;
    activity_id: string | null;
    account_id: string | null;
    amount: number;
    count: number;
  }>;
}

interface UseSummaryReportDataParams {
  year: number;
  month: number;
  cumulative: boolean;
  accountId?: string;
  activityId?: string;
  categoryId?: string;
}

export function useSummaryReportData({
  year,
  month,
  cumulative,
  accountId,
  activityId,
  categoryId,
}: UseSummaryReportDataParams) {
  return useQuery({
    queryKey: ['summary-report', year, month, cumulative, accountId, activityId, categoryId],
    queryFn: async (): Promise<SummaryReportData> => {
      // Calculate date range
      let startDate: string | undefined;
      const endDate = getMonthEndDate(year, month);

      if (cumulative) {
        // For cumulative: from beginning of time to end of selected month
        startDate = undefined;
      } else {
        // For monthly: only selected month
        startDate = getMonthStartDate(year, month);
      }

      // Build queries with filters
      const incomeQuery = supabase
        .from('finance_transactions' as any)
        .select(`
          amount,
          activity_id,
          account_id,
          activities!inner (
            id,
            name,
            category
          )
        `)
        .eq('type', 'income')
        .not('activity_id', 'is', null);

      const salaryQuery = supabase
        .from('staff_journal_entries' as any)
        .select(`
          amount,
          staff_id,
          activity_id,
          staff (
            id,
            full_name
          )
        `);

      const expensesQuery = supabase
        .from('finance_transactions' as any)
        .select(`
          amount,
          activity_id,
          account_id,
          expense_category_id,
          expense_categories (
            id,
            name
          ),
          activities!inner (
            id,
            name,
            category
          )
        `)
        .in('type', ['expense', 'household']);

      // Apply date filters
      if (startDate) {
        incomeQuery.gte('date', startDate);
        expensesQuery.gte('date', startDate);
      }
      incomeQuery.lte('date', endDate);
      expensesQuery.lte('date', endDate);

      if (startDate) {
        salaryQuery.gte('date', startDate);
      }
      salaryQuery.lte('date', endDate);

      // Apply account filter
      if (accountId) {
        incomeQuery.eq('account_id', accountId);
        expensesQuery.eq('account_id', accountId);
      }

      // Apply activity filter
      if (activityId) {
        incomeQuery.eq('activity_id', activityId);
        expensesQuery.eq('activity_id', activityId);
      }

      // Apply category filter (for expenses)
      if (categoryId) {
        expensesQuery.eq('expense_category_id', categoryId);
      }

      // Execute queries
      const [incomeResult, salaryResult, expensesResult] = await Promise.all([
        incomeQuery.range(0, 99999),
        salaryQuery.range(0, 99999),
        expensesQuery.range(0, 99999),
      ]);

      if (incomeResult.error) throw incomeResult.error;
      if (salaryResult.error) throw salaryResult.error;
      if (expensesResult.error) throw expensesResult.error;

      // Process income data
      const incomeMap = new Map<string, { amount: number; count: number }>();
      let incomeTotal = 0;

      (incomeResult.data || []).forEach((item: any) => {
        const key = `${item.activity_id || 'null'}-${item.account_id || 'null'}`;
        const existing = incomeMap.get(key) || { amount: 0, count: 0 };
        incomeMap.set(key, {
          amount: existing.amount + (item.amount || 0),
          count: existing.count + 1,
        });
        incomeTotal += item.amount || 0;
      });

      const incomeDetails = Array.from(incomeMap.entries()).map(([key, value]) => {
        const [activity_id, account_id] = key.split('-');
        return {
          activity_id,
          account_id: account_id === 'null' ? null : account_id,
          amount: value.amount,
          count: value.count,
        };
      });

      // Process salary data
      const salaryMap = new Map<string, { amount: number; count: number; staff_name: string }>();
      let salaryTotal = 0;

      (salaryResult.data || []).forEach((item: any) => {
        const key = `${item.staff_id}-${item.activity_id || 'none'}`;
        const existing = salaryMap.get(key) || { amount: 0, count: 0, staff_name: item.staff?.full_name || 'Невідомий' };
        salaryMap.set(key, {
          amount: existing.amount + (item.amount || 0),
          count: existing.count + 1,
          staff_name: item.staff?.full_name || 'Невідомий',
        });
        salaryTotal += item.amount || 0;
      });

      const salaryDetails = Array.from(salaryMap.entries()).map(([key, value]) => {
        const [staff_id, activity_id] = key.split('-');
        return {
          staff_id,
          staff_name: value.staff_name,
          activity_id: activity_id === 'none' ? null : activity_id,
          amount: value.amount,
          count: value.count,
        };
      });

      // Process expenses data
      const expensesMap = new Map<string, { amount: number; count: number; category_name: string | null }>();
      let expensesTotal = 0;

      (expensesResult.data || []).forEach((item: any) => {
        const categoryKey = item.expense_category_id || 'none';
        const key = `${categoryKey}-${item.activity_id || 'none'}-${item.account_id || 'null'}`;
        const existing = expensesMap.get(key) || { 
          amount: 0, 
          count: 0, 
          category_name: item.expense_categories?.name || null 
        };
        expensesMap.set(key, {
          amount: existing.amount + (item.amount || 0),
          count: existing.count + 1,
          category_name: item.expense_categories?.name || null,
        });
        expensesTotal += item.amount || 0;
      });

      const expensesDetails = Array.from(expensesMap.entries()).map(([key, value]) => {
        const [category_id, activity_id, account_id] = key.split('-');
        return {
          category_id: category_id === 'none' ? null : category_id,
          category_name: value.category_name,
          activity_id: activity_id === 'none' ? null : activity_id,
          account_id: account_id === 'null' ? null : account_id,
          amount: value.amount,
          count: value.count,
        };
      });

      return {
        incomeTotal,
        incomeDetails: incomeDetails.sort((a, b) => b.amount - a.amount),
        salaryTotal,
        salaryDetails: salaryDetails.sort((a, b) => b.amount - a.amount),
        expensesTotal,
        expensesDetails: expensesDetails.sort((a, b) => b.amount - a.amount),
      };
    },
  });
}
