import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
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
  const query = useQuery({
    queryKey: ['dashboard', 'full', year, month],
    refetchOnWindowFocus: true, // Обновлять при фокусе окна
    refetchOnMount: true, // Всегда обновлять при монтировании
    staleTime: 0, // Данные считаются устаревшими сразу
    queryFn: async () => {
      // Используем локальное время для расчета дат, чтобы избежать проблем с часовыми поясами
      const startDateLocal = new Date(year, month, 1);
      const endDateLocal = new Date(year, month + 1, 0);
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endDate = `${endDateLocal.getFullYear()}-${String(endDateLocal.getMonth() + 1).padStart(2, '0')}-${String(endDateLocal.getDate()).padStart(2, '0')}`;
      
      console.log('[Dashboard Debug] useDashboardData.queryFn called', {
        year,
        month,
        startDate,
        endDate,
        startDateLocal: startDateLocal.toISOString(),
        endDateLocal: endDateLocal.toISOString(),
        timestamp: new Date().toISOString(),
      });

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
          `),
        supabase
          .from('attendance')
          .select('id, enrollment_id, date, status, charged_amount, value, manual_value_edit', { count: 'exact' })
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .range(0, 99999), // Получаем все записи за месяц
        supabase
          .from('staff_journal_entries' as any)
          .select('id, staff_id, activity_id, date, amount, base_amount, is_manual_override')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .range(0, 99999), // Получаем все записи за месяц
        supabase
          .from('finance_transactions' as any)
          .select(`
            id,
            student_id,
            activity_id,
            date,
            amount,
            type,
            students (id, full_name),
            activities (id, name, color, category)
          `, { count: 'exact' })
          .in('type', ['income', 'expense', 'salary', 'household'])
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .range(0, 99999), // Получаем все записи за месяц
      ]);

      // Логирование ошибок
      if (enrollmentsResult.error) {
        console.error('[Dashboard Debug] enrollmentsResult.error', enrollmentsResult.error);
        throw enrollmentsResult.error;
      }
      if (attendanceResult.error) {
        console.error('[Dashboard Debug] attendanceResult.error', attendanceResult.error);
        throw attendanceResult.error;
      }
      if (staffExpensesResult.error) {
        console.error('[Dashboard Debug] staffExpensesResult.error', staffExpensesResult.error);
        throw staffExpensesResult.error;
      }
      if (financeTransactionsResult.error) {
        console.error('[Dashboard Debug] financeTransactionsResult.error', financeTransactionsResult.error);
        throw financeTransactionsResult.error;
      }
      
      // Логируем результаты запросов
      console.log('[Dashboard Debug] Raw query results', {
        attendanceDataLength: attendanceResult.data?.length || 0,
        attendanceCount: (attendanceResult as any).count,
        financeTransactionsLength: financeTransactionsResult.data?.length || 0,
        financeTransactionsCount: (financeTransactionsResult as any).count,
        staffExpensesLength: staffExpensesResult.data?.length || 0,
        staffExpensesCount: (staffExpensesResult as any).count,
        timestamp: new Date().toISOString(),
      });
      
      // Проверяем конкретную запись от 29.01.2026
      const targetEnrollmentId = '18a9fb16-25cc-4b39-8ed8-ddf711af4e90';
      const targetDate = '2026-01-29';
      const targetAttendance = attendanceResult.data?.find(
        (att: any) => att.enrollment_id === targetEnrollmentId && att.date === targetDate
      );
      
      if (targetAttendance) {
        console.log('[Dashboard Debug] Target attendance entry found in query results', {
          enrollmentId: targetEnrollmentId,
          date: targetDate,
          entry: targetAttendance,
          value: targetAttendance.value,
          charged_amount: targetAttendance.charged_amount,
          calculatedAmount: targetAttendance.value !== null && targetAttendance.value !== undefined 
            ? targetAttendance.value 
            : (targetAttendance.charged_amount || 0),
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log('[Dashboard Debug] Target attendance entry NOT found in query results', {
          enrollmentId: targetEnrollmentId,
          date: targetDate,
          startDate,
          endDate,
          totalAttendanceRecords: attendanceResult.data?.length || 0,
          sampleDates: attendanceResult.data?.slice(0, 5).map((a: any) => ({ 
            enrollment_id: a.enrollment_id, 
            date: a.date 
          })),
          timestamp: new Date().toISOString(),
        });
      }
      
      // Проверяем, не обрезан ли результат
      if ((attendanceResult as any).count && (attendanceResult as any).count > (attendanceResult.data?.length || 0)) {
        console.warn('[Dashboard Debug] Attendance data truncated!', {
          returned: attendanceResult.data?.length || 0,
          total: (attendanceResult as any).count,
        });
      }
      if ((financeTransactionsResult as any).count && (financeTransactionsResult as any).count > (financeTransactionsResult.data?.length || 0)) {
        console.warn('[Dashboard Debug] Finance transactions data truncated!', {
          returned: financeTransactionsResult.data?.length || 0,
          total: (financeTransactionsResult as any).count,
        });
      }

      const result = {
        enrollments: (enrollmentsResult.data || []) as unknown as DashboardEnrollment[],
        attendance: (attendanceResult.data || []) as DashboardAttendance[],
        staffExpenses: (staffExpensesResult.data || []) as unknown as DashboardStaffExpense[],
        financeTransactions: (financeTransactionsResult.data || []) as unknown as DashboardFinanceTransaction[],
      };

      // Проверяем диапазон дат в attendance
      const attendanceDates = (result.attendance && Array.isArray(result.attendance)) 
        ? result.attendance.map(a => a.date).sort() 
        : [];
      const minDate = attendanceDates.length > 0 ? attendanceDates[0] : null;
      const maxDate = attendanceDates.length > 0 ? attendanceDates[attendanceDates.length - 1] : null;
      
      // Проверяем, есть ли записи с датой '2026-01-01' (дата новой записи из логов)
      const testDate = '2026-01-01';
      const recordsForTestDate = (result.attendance && Array.isArray(result.attendance))
        ? result.attendance.filter(a => a.date === testDate)
        : [];
      const testEnrollmentId = 'd1e2088e-6931-4622-8dcb-2236879c8a42'; // enrollment_id из логов
      const testRecord = (result.attendance && Array.isArray(result.attendance))
        ? result.attendance.find(a => a.date === testDate && a.enrollment_id === testEnrollmentId)
        : undefined;
      
      console.log('[Dashboard Debug] useDashboardData.queryFn completed', {
        enrollmentsCount: result.enrollments?.length || 0,
        attendanceCount: result.attendance?.length || 0,
        staffExpensesCount: result.staffExpenses?.length || 0,
        financeTransactionsCount: result.financeTransactions?.length || 0,
        dateRange: {
          startDate,
          endDate,
          minDateInData: minDate,
          maxDateInData: maxDate,
        },
        testRecordCheck: {
          testDate,
          testEnrollmentId,
          recordsForTestDateCount: Array.isArray(recordsForTestDate) ? recordsForTestDate.length : 0,
          testRecordFound: !!testRecord,
          testRecordId: testRecord?.id,
        },
        attendanceSample: result.attendance?.slice(0, 3).map(a => ({
          id: a.id,
          enrollment_id: a.enrollment_id,
          date: a.date,
          value: a.value,
          charged_amount: a.charged_amount,
        })),
        timestamp: new Date().toISOString(),
      });

      return result;
    },
  });

  // Логирование состояния запроса
  useEffect(() => {
    console.log('[Dashboard Debug] useDashboardData query state changed', {
      year,
      month,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      isStale: query.isStale,
      dataUpdatedAt: query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString() : null,
      timestamp: new Date().toISOString(),
    });
  }, [query.isLoading, query.isFetching, query.isStale, query.dataUpdatedAt, year, month]);

  return query;
}

export function useCategorySummary(year: number, month: number) {
  return useQuery({
    queryKey: ['dashboard', 'summary', year, month],
    refetchOnWindowFocus: true, // Обновлять при фокусе окна
    refetchOnMount: true, // Всегда обновлять при монтировании
    staleTime: 0, // Данные считаются устаревшими сразу
    queryFn: async () => {
      // Используем локальное время для расчета дат, чтобы избежать проблем с часовыми поясами
      const endDateLocal = new Date(year, month + 1, 0);
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endDate = `${endDateLocal.getFullYear()}-${String(endDateLocal.getMonth() + 1).padStart(2, '0')}-${String(endDateLocal.getDate()).padStart(2, '0')}`;

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
          .lte('date', endDate)
          .order('date', { ascending: true })
          .range(0, 99999), // Получаем все записи за месяц
        supabase
          .from('finance_transactions' as any)
          .select(`
            amount,
            date,
            type,
            activities!inner (category)
          `)
          .in('type', ['income', 'expense', 'salary', 'household'])
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .range(0, 99999), // Получаем все записи за месяц
        supabase
          .from('staff_journal_entries' as any)
          .select('amount, date')
          .gte('date', startDate)
          .lte('date', endDate)
          .range(0, 99999), // Получаем все записи (Supabase по умолчанию лимит 1000)
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
