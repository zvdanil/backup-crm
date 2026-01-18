import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ActivityCategory } from './useActivities';

export interface DashboardEnrollment {
  id: string;
  student_id: string;
  activity_id: string;
  custom_price: number | null;
  discount_percent: number | null;
  effective_from: string | null;
  is_active: boolean;
  students: {
    id: string;
    full_name: string;
  };
  activities: {
    id: string;
    name: string;
    default_price: number;
    color: string;
    category: ActivityCategory;
  };
}

export interface DashboardAttendance {
  id: string;
  enrollment_id: string;
  date: string;
  status: string | null;
  charged_amount: number;
  value: number | null;
  manual_value_edit: boolean;
}

export interface DashboardStaffExpense {
  id: string;
  staff_id: string;
  activity_id: string | null;
  date: string;
  amount: number;
  base_amount: number | null;
  is_manual_override: boolean;
}

export interface DashboardFinanceTransaction {
  id: string;
  student_id: string;
  activity_id: string;
  date: string;
  amount: number;
  type: string;
  students?: {
    id: string;
    full_name: string;
  };
  activities?: {
    id: string;
    name: string;
    color: string;
    category: ActivityCategory;
  };
}

export function useDashboardData(year: number, month: number) {
  return useQuery({
    queryKey: ['dashboard', 'full', year, month],
    refetchOnWindowFocus: true, // Обновлять при фокусе окна
    refetchOnMount: true, // Всегда обновлять при монтировании
    staleTime: 0, // Данные считаются устаревшими сразу
    queryFn: async () => {
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const [enrollmentsResult, attendanceResult, staffExpensesResult, financeTransactionsResult] = await Promise.all([
        supabase
          .from('enrollments')
          .select(`
            id,
            student_id,
            activity_id,
            custom_price,
            discount_percent,
            effective_from,
            is_active,
            students (id, full_name),
            activities (id, name, default_price, color, category)
          `)
          .eq('is_active', true),
        supabase
          .from('attendance')
          .select('id, enrollment_id, date, status, charged_amount, value, manual_value_edit')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('staff_journal_entries' as any)
          .select('id, staff_id, activity_id, date, amount, base_amount, is_manual_override')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('finance_transactions')
          .select(`
            id,
            student_id,
            activity_id,
            date,
            amount,
            type,
            students (id, full_name),
            activities (id, name, color, category)
          `)
          .in('type', ['income', 'expense', 'salary', 'household'])
          .gte('date', startDate)
          .lte('date', endDate),
      ]);

      if (enrollmentsResult.error) throw enrollmentsResult.error;
      if (attendanceResult.error) throw attendanceResult.error;
      if (staffExpensesResult.error) throw staffExpensesResult.error;
      if (financeTransactionsResult.error) throw financeTransactionsResult.error;

      return {
        enrollments: enrollmentsResult.data as unknown as DashboardEnrollment[],
        attendance: attendanceResult.data as DashboardAttendance[],
        staffExpenses: (staffExpensesResult.data || []) as DashboardStaffExpense[],
        financeTransactions: (financeTransactionsResult.data || []) as DashboardFinanceTransaction[],
      };
    },
  });
}

export function useCategorySummary(year: number, month: number) {
  return useQuery({
    queryKey: ['dashboard', 'summary', year, month],
    refetchOnWindowFocus: true, // Обновлять при фокусе окна
    refetchOnMount: true, // Всегда обновлять при монтировании
    staleTime: 0, // Данные считаются устаревшими сразу
    queryFn: async () => {
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const [attendanceResult, financeTransactionsResult, staffExpensesResult] = await Promise.all([
        supabase
          .from('attendance')
          .select(`
            charged_amount,
            value,
            enrollments!inner (
              activities!inner (category)
            )
          `)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('finance_transactions')
          .select(`
            amount,
            date,
            type,
            activities!inner (category)
          `)
          .in('type', ['income', 'expense', 'salary', 'household'])
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('staff_journal_entries' as any)
          .select('amount, date')
          .gte('date', startDate)
          .lte('date', endDate),
      ]);

      if (attendanceResult.error) throw attendanceResult.error;
      if (financeTransactionsResult.error) throw financeTransactionsResult.error;
      if (staffExpensesResult.error) throw staffExpensesResult.error;

      const summary: Record<ActivityCategory, number> = {
        income: 0,
        expense: 0,
        additional_income: 0,
        household_expense: 0,
        salary: 0,
      };

      // Підсумовуємо доходи з attendance (для обычных журналов)
      attendanceResult.data?.forEach((item: any) => {
        const category = item.enrollments?.activities?.category as ActivityCategory;
        if (category) {
          // Підсумовуємо value (якщо є) або charged_amount
          const amount = item.value !== null && item.value !== undefined && item.value > 0 
            ? item.value 
            : (item.charged_amount || 0);
          summary[category] += amount;
        }
      });

      // Підсумовуємо доходи/витрати з finance_transactions (для Garden Attendance Journal и других транзакций)
      // income = positive (доход), expense = negative (витрата)
      financeTransactionsResult.data?.forEach((item: any) => {
        const category = item.activities?.category as ActivityCategory;
        if (category) {
          const amount = item.amount || 0;
          if (item.type === 'income') {
            summary[category] += amount;
          } else {
            // Expenses should be stored as positive in summary
            summary[category] += amount;
          }
        }
      });

      // Підсумовуємо витрати з staff_journal_entries (категорія 'salary')
      staffExpensesResult.data?.forEach((item: any) => {
        summary.salary += item.amount || 0;
      });

      return summary;
    },
  });
}
