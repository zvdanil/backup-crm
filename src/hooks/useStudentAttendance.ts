import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

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
