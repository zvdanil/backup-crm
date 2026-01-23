import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { AttendanceStatus } from '@/lib/attendance';

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

      const startDate = new Date(filters.year, filters.month, 1).toISOString().split('T')[0];
      const endDate = new Date(filters.year, filters.month + 1, 0).toISOString().split('T')[0];

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
      return data;
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

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      // Invalidate all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
      ]);
      // Принудительно перезапрашиваем активные запросы дашборда
      await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false, type: 'active' });
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
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('enrollment_id', enrollmentId)
        .eq('date', date);

      if (error) throw error;
    },
    onSuccess: async () => {
      // Invalidate all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance'] }),
        queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
        queryClient.invalidateQueries({ queryKey: ['student_total_balance'] }),
      ]);
      // Принудительно перезапрашиваем активные запросы дашборда
      await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false, type: 'active' });
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
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

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
