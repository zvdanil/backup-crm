import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getMonthStartDate, getMonthEndDate } from '@/lib/attendance';

export interface StudentAttendanceEntry {
  id: string;
  date: string;
  status: string | null;
  charged_amount: number;
  value: number | null;
  enrollments: {
    id: string;
    activity_id: string;
    activities: { id: string; name: string; color: string };
  };
}

export function useStudentAttendance(studentId: string | undefined, month?: number, year?: number) {
  return useQuery({
    queryKey: ['student_attendance', studentId, month, year],
    queryFn: async () => {
      if (!studentId || month === undefined || year === undefined) return [];
      const startDate = getMonthStartDate(year, month);
      const endDate = getMonthEndDate(year, month);

      const { data, error } = await supabase
        .from('attendance')
        .select(`
          id,
          date,
          status,
          charged_amount,
          value,
          enrollments!inner (
            id,
            activity_id,
            students (id),
            activities (id, name, color)
          )
        `)
        .eq('enrollments.student_id', studentId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) throw error;
      return data as StudentAttendanceEntry[];
    },
    enabled: !!studentId && month !== undefined && year !== undefined,
  });
}
