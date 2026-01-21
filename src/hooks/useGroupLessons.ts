import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface GroupLesson {
  id: string;
  name: string;
  activity_id: string;
  created_at: string;
  updated_at: string;
  activities?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  staff?: Array<{
    id: string;
    full_name: string;
  }>;
}

export interface GroupLessonInsert {
  name: string;
  activity_id: string;
  staff_ids?: string[];
}

export interface GroupLessonUpdate {
  id: string;
  name: string;
  activity_id: string;
  staff_ids?: string[];
}

function mapGroupLesson(row: any): GroupLesson {
  const staff = (row.group_lesson_staff || [])
    .map((link: any) => link.staff)
    .filter(Boolean)
    .map((member: any) => ({
      id: member.id,
      full_name: member.full_name,
    }));

  return {
    id: row.id,
    name: row.name,
    activity_id: row.activity_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    activities: row.activities || null,
    staff,
  };
}

export function useGroupLessons(activityId?: string) {
  return useQuery({
    queryKey: ['group_lessons', activityId],
    queryFn: async () => {
      let query = supabase
        .from('group_lessons')
        .select(`
          id,
          name,
          activity_id,
          created_at,
          updated_at,
          activities ( id, name, color ),
          group_lesson_staff (
            staff_id,
            staff ( id, full_name )
          )
        `)
        .order('name');

      if (activityId) {
        query = query.eq('activity_id', activityId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapGroupLesson);
    },
  });
}

export function useCreateGroupLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: GroupLessonInsert) => {
      const { staff_ids = [], ...lesson } = payload;
      const { data, error } = await supabase
        .from('group_lessons')
        .insert(lesson)
        .select('id, name, activity_id, created_at, updated_at')
        .single();

      if (error) throw error;

      if (staff_ids.length > 0) {
        const { error: staffError } = await supabase
          .from('group_lesson_staff')
          .insert(staff_ids.map((staffId) => ({
            group_lesson_id: data.id,
            staff_id: staffId,
          })));
        if (staffError) throw staffError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group_lessons'] });
      toast({ title: 'Групове заняття створено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateGroupLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: GroupLessonUpdate) => {
      const { id, staff_ids = [], ...lesson } = payload;
      const { data, error } = await supabase
        .from('group_lessons')
        .update(lesson)
        .eq('id', id)
        .select('id, name, activity_id, created_at, updated_at')
        .single();

      if (error) throw error;

      const { error: deleteError } = await supabase
        .from('group_lesson_staff')
        .delete()
        .eq('group_lesson_id', id);
      if (deleteError) throw deleteError;

      if (staff_ids.length > 0) {
        const { error: staffError } = await supabase
          .from('group_lesson_staff')
          .insert(staff_ids.map((staffId) => ({
            group_lesson_id: id,
            staff_id: staffId,
          })));
        if (staffError) throw staffError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group_lessons'] });
      toast({ title: 'Групове заняття оновлено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteGroupLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('group_lessons')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group_lessons'] });
      toast({ title: 'Групове заняття видалено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
