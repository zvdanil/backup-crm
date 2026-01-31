import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { AttendanceStatus } from '@/lib/attendance';
import { getMonthStartDate, getMonthEndDate } from '@/lib/attendance';

export interface Attendance {
  id: string;
  enrollment_id: string;
  group_lesson_id?: string | null;
  date: string;
  status: AttendanceStatus | null;
  charged_amount: number;
  value: number | null;
  notes: string | null;
  manual_value_edit: boolean;
  created_at: string;
  updated_at: string;
}

export type AttendanceInsert = Pick<Attendance, 'enrollment_id' | 'date' | 'status' | 'charged_amount' | 'value' | 'notes' | 'manual_value_edit' | 'group_lesson_id'>;
export type AttendanceUpdate = Partial<Omit<Attendance, 'id' | 'enrollment_id' | 'created_at' | 'updated_at'>>;

export function useAttendance(filters: { activityId?: string; month?: number; year?: number; groupLessonId?: string | null }) {
  return useQuery({
    queryKey: ['attendance', filters],
    queryFn: async () => {
      if (!filters.activityId || filters.month === undefined || filters.year === undefined) {
        return [];
      }

      const startDate = getMonthStartDate(filters.year, filters.month);
      const endDate = getMonthEndDate(filters.year, filters.month);

      let query = supabase
        .from('attendance')
        .select(`
          id,
          enrollment_id,
          group_lesson_id,
          date,
          status,
          charged_amount,
          value,
          notes,
          manual_value_edit,
          created_at,
          updated_at,
          enrollments!inner (
            *,
            students (*),
            activities (*)
          )
        `)
        .eq('enrollments.activity_id', filters.activityId)
        .gte('date', startDate)
        .lte('date', endDate);

      if (filters.groupLessonId === null) {
        query = query.is('group_lesson_id', null);
      } else if (filters.groupLessonId) {
        query = query.eq('group_lesson_id', filters.groupLessonId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    enabled: !!filters.activityId && filters.month !== undefined && filters.year !== undefined,
  });
}

export function useAttendanceByEnrollment(enrollmentId: string) {
  return useQuery({
    queryKey: ['attendance', 'enrollment', enrollmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('id, enrollment_id, group_lesson_id, date, status, charged_amount, value, notes, manual_value_edit, created_at, updated_at')
        .eq('enrollment_id', enrollmentId)
        .order('date', { ascending: false });

      if (error) throw error;
      return data as Attendance[];
    },
    enabled: !!enrollmentId,
  });
}

export function useSetAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (attendance: AttendanceInsert) => {
      console.log('[Dashboard Debug] useSetAttendance.mutationFn called', {
        enrollment_id: attendance.enrollment_id,
        date: attendance.date,
        status: attendance.status,
        charged_amount: attendance.charged_amount,
        value: attendance.value,
        timestamp: new Date().toISOString(),
      });
      
      // Upsert: insert or update if exists
      const { data, error } = await supabase
        .from('attendance')
        .upsert(
          {
            enrollment_id: attendance.enrollment_id,
            group_lesson_id: attendance.group_lesson_id ?? null,
            date: attendance.date,
            status: attendance.status,
            charged_amount: attendance.charged_amount,
            value: attendance.value || null,
            notes: attendance.notes,
            manual_value_edit: attendance.manual_value_edit ?? false,
          },
          {
            onConflict: 'enrollment_id,date',
          }
        )
        .select('id, enrollment_id, date, status, charged_amount, value, notes, manual_value_edit, created_at, updated_at')
        .single();

      if (error) {
        console.error('[Dashboard Debug] useSetAttendance.mutationFn error', {
          error: error.message,
          code: error.code,
          details: error.details,
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
      
      console.log('[Dashboard Debug] useSetAttendance.mutationFn success', {
        id: data?.id,
        enrollment_id: data?.enrollment_id,
        date: data?.date,
        timestamp: new Date().toISOString(),
      });
      
      return data;
    },
    onSuccess: async (data) => {
      console.log('[Dashboard Debug] useSetAttendance.onSuccess called', {
        attendanceId: data?.id,
        enrollmentId: data?.enrollment_id,
        date: data?.date,
        charged_amount: data?.charged_amount,
        timestamp: new Date().toISOString(),
      });
      
      // Создаем/обновляем/удаляем finance_transaction из attendance
      if (data && data.enrollment_id) {
        try {
          // Получаем enrollment с activity для определения account_id
          const { data: enrollment, error: enrollmentError } = await supabase
            .from('enrollments')
            .select(`
              id,
              student_id,
              activity_id,
              account_id,
              activities (
                id,
                account_id
              )
            `)
            .eq('id', data.enrollment_id)
            .single();
          
          if (enrollmentError) {
            console.error('[Dashboard Debug] Error fetching enrollment:', enrollmentError);
          } else if (enrollment) {
            // Определяем account_id: enrollment.account_id ?? activity.account_id
            const accountId = enrollment.account_id ?? (enrollment.activities as any)?.account_id ?? null;
            const studentId = enrollment.student_id;
            const activityId = enrollment.activity_id;
            
            // Ищем существующую finance_transaction
            const { data: existingTransaction, error: findError } = await supabase
              .from('finance_transactions')
              .select('id')
              .eq('student_id', studentId)
              .eq('activity_id', activityId)
              .eq('date', data.date)
              .eq('type', 'income')
              .maybeSingle();
            
            if (findError && findError.code !== 'PGRST116') {
              console.error('[Dashboard Debug] Error finding existing transaction:', findError);
            } else {
              if (data.charged_amount && data.charged_amount > 0) {
                // Если charged_amount > 0, создаем или обновляем транзакцию
                if (existingTransaction && existingTransaction.id) {
                  // Обновляем существующую транзакцию
                  const { error: updateError } = await supabase
                    .from('finance_transactions')
                    .update({
                      amount: data.charged_amount,
                      account_id: accountId,
                      description: 'Нарахування за відвідування',
                    })
                    .eq('id', existingTransaction.id);
                  
                  if (updateError) {
                    console.error('[Dashboard Debug] Error updating finance_transaction:', updateError);
                  } else {
                    console.log('[Dashboard Debug] Finance transaction updated:', existingTransaction.id);
                  }
                } else {
                  // Создаем новую транзакцию
                  const { error: insertError } = await supabase
                    .from('finance_transactions')
                    .insert({
                      type: 'income',
                      student_id: studentId,
                      activity_id: activityId,
                      account_id: accountId,
                      amount: data.charged_amount,
                      date: data.date,
                      description: 'Нарахування за відвідування',
                    });
                  
                  if (insertError) {
                    console.error('[Dashboard Debug] Error creating finance_transaction:', insertError);
                  } else {
                    console.log('[Dashboard Debug] Finance transaction created for attendance:', data.id);
                  }
                }
              } else {
                // Если charged_amount = 0 или null, удаляем транзакцию если она существует
                if (existingTransaction && existingTransaction.id) {
                  const { error: deleteError } = await supabase
                    .from('finance_transactions')
                    .delete()
                    .eq('id', existingTransaction.id);
                  
                  if (deleteError) {
                    console.error('[Dashboard Debug] Error deleting finance_transaction:', deleteError);
                  } else {
                    console.log('[Dashboard Debug] Finance transaction deleted (charged_amount = 0):', existingTransaction.id);
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('[Dashboard Debug] Error in finance_transaction creation:', error);
        }
      }
      
      // Invalidate all related queries
      console.log('[Dashboard Debug] Invalidating queries...');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance'] }),
        queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
        queryClient.invalidateQueries({ queryKey: ['student_account_balances'] }),
      ]);
      
      // Принудительно перезапрашиваем ВСЕ запросы дашборда (не только активные)
      console.log('[Dashboard Debug] Refetching dashboard queries...');
      
      // Получаем все запросы дашборда
      const allDashboardQueries = queryClient.getQueryCache().findAll({ queryKey: ['dashboard'], exact: false });
      console.log('[Dashboard Debug] Found dashboard queries', {
        count: allDashboardQueries.length,
        queryKeys: allDashboardQueries.map(q => q.queryKey),
        timestamp: new Date().toISOString(),
      });
      
      // Принудительно перезапрашиваем все найденные запросы
      const refetchResult = await queryClient.refetchQueries({ 
        queryKey: ['dashboard'], 
        exact: false,
        type: 'all', // Перезапрашиваем все, включая неактивные
      });
      
      // refetchQueries возвращает Promise, который резолвится в массив результатов
      const results = Array.isArray(refetchResult) ? refetchResult : [];
      
      console.log('[Dashboard Debug] Refetch result', {
        refetchedQueries: results.length,
        refetchResults: results.map((r: any) => ({
          status: r?.status,
          dataUpdatedAt: r?.dataUpdatedAt ? new Date(r.dataUpdatedAt).toISOString() : null,
        })),
        timestamp: new Date().toISOString(),
      });
      
      // Если запросов не найдено или не перезапрошено, принудительно инвалидируем еще раз
      if (results.length === 0) {
        console.warn('[Dashboard Debug] No queries refetched! Forcing invalidation again...');
        await queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false });
      }
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ enrollmentId, date }: { enrollmentId: string; date: string }) => {
      // Получаем enrollment для определения student_id и activity_id
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('id, student_id, activity_id')
        .eq('id', enrollmentId)
        .single();
      
      if (enrollmentError) {
        console.error('[Dashboard Debug] Error fetching enrollment for delete:', enrollmentError);
      }
      
      // Удаляем attendance
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('enrollment_id', enrollmentId)
        .eq('date', date);

      if (error) throw error;
      
      // Удаляем соответствующую finance_transaction, если она существует
      if (enrollment && enrollment.student_id && enrollment.activity_id) {
        const { error: deleteTransactionError } = await supabase
          .from('finance_transactions')
          .delete()
          .eq('student_id', enrollment.student_id)
          .eq('activity_id', enrollment.activity_id)
          .eq('date', date)
          .eq('type', 'income');
        
        if (deleteTransactionError) {
          console.error('[Dashboard Debug] Error deleting finance_transaction:', deleteTransactionError);
          // Не бросаем ошибку, так как attendance уже удален
        } else {
          console.log('[Dashboard Debug] Finance transaction deleted for attendance:', { enrollmentId, date });
        }
      }
    },
    onSuccess: async () => {
      // Invalidate all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance'] }),
        queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
        queryClient.invalidateQueries({ queryKey: ['student_total_balance'] }),
        queryClient.invalidateQueries({ queryKey: ['student_account_balances'] }),
      ]);
      // Принудительно перезапрашиваем ВСЕ запросы дашборда (не только активные)
      await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = getMonthStartDate(now.getFullYear(), now.getMonth());
      const endOfMonth = getMonthEndDate(now.getFullYear(), now.getMonth());

      const [studentsResult, activitiesResult, attendanceResult, enrollmentsResult] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact' }).eq('status', 'active'),
        supabase.from('activities').select('id', { count: 'exact' }).eq('is_active', true),
        supabase
          .from('attendance')
          .select('id, enrollment_id, date, status, charged_amount, value, notes, manual_value_edit, created_at, updated_at')
          .gte('date', startOfMonth)
          .lte('date', endOfMonth),
        supabase.from('enrollments').select('id', { count: 'exact' }).eq('is_active', true),
      ]);

      // Підсумовуємо value (якщо є) або charged_amount
      const totalRevenue = attendanceResult.data?.reduce((sum, a) => {
        const amount = a.value !== null && a.value !== undefined && a.value > 0 ? a.value : (a.charged_amount || 0);
        return sum + amount;
      }, 0) || 0;
      const attendanceCount = attendanceResult.data?.filter(a => a.status === 'present').length || 0;
      const totalAttendance = attendanceResult.data?.length || 0;

      return {
        studentsCount: studentsResult.count || 0,
        activitiesCount: activitiesResult.count || 0,
        enrollmentsCount: enrollmentsResult.count || 0,
        monthlyRevenue: totalRevenue,
        attendanceRate: totalAttendance > 0 ? Math.round((attendanceCount / totalAttendance) * 100) : 0,
      };
    },
  });
}
