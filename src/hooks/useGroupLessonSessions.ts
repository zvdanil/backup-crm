import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface GroupLessonSession {
  id: string;
  group_lesson_id: string;
  session_date: string;
  sessions_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupLessonSessionInsert {
  group_lesson_id: string;
  session_date: string;
  sessions_count: number;
  notes?: string | null;
}

export function useGroupLessonSessions(filters: { activityId?: string; month?: number; year?: number }) {
  return useQuery({
    queryKey: ['group_lesson_sessions', filters],
    queryFn: async () => {
      if (!filters.activityId || filters.month === undefined || filters.year === undefined) {
        return [];
      }

      const startDate = new Date(filters.year, filters.month, 1).toISOString().split('T')[0];
      const endDate = new Date(filters.year, filters.month + 1, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('group_lesson_sessions')
        .select(`
          id,
          group_lesson_id,
          session_date,
          sessions_count,
          notes,
          created_at,
          updated_at,
          group_lessons!inner (
            id,
            activity_id
          )
        `)
        .eq('group_lessons.activity_id', filters.activityId)
        .gte('session_date', startDate)
        .lte('session_date', endDate);

      if (error) throw error;
      return (data || []) as GroupLessonSession[];
    },
    enabled: !!filters.activityId && filters.month !== undefined && filters.year !== undefined,
  });
}

export function useUpsertGroupLessonSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: GroupLessonSessionInsert) => {
      const { data, error } = await supabase
        .from('group_lesson_sessions')
        .upsert(
          {
            group_lesson_id: session.group_lesson_id,
            session_date: session.session_date,
            sessions_count: session.sessions_count,
            notes: session.notes ?? null,
          },
          {
            onConflict: 'group_lesson_id,session_date',
          }
        )
        .select()
        .single();

      if (error) throw error;
      return data as GroupLessonSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group_lesson_sessions'] });
      queryClient.invalidateQueries({ queryKey: ['staff-journal-entries-all'], exact: false });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteGroupLessonSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ groupLessonId, date }: { groupLessonId: string; date: string }) => {
      const { error } = await supabase
        .from('group_lesson_sessions')
        .delete()
        .eq('group_lesson_id', groupLessonId)
        .eq('session_date', date);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group_lesson_sessions'] });
      queryClient.invalidateQueries({ queryKey: ['staff-journal-entries-all'], exact: false });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
