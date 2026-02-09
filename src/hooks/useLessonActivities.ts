import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LessonActivity, NewLessonActivityPayload, UpdateLessonActivityPayload } from '@/day-calendar-view/types';

const LESSON_ACTIVITIES_QUERY_KEY = 'lesson_activities';

const selectQuery = 'id, created_at, title, teacher, color, startTime: start_time, endTime: end_time, activityId: activity_id, teacherId: teacher_id, startDate: start_date, comment, rrule, excludedDates: excluded_dates';

// 1. Fetch all lesson activities
export const useLessonActivities = () => {
  return useQuery<LessonActivity[], Error>({
    queryKey: [LESSON_ACTIVITIES_QUERY_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lesson_activities')
        .select(selectQuery);
        
      if (error) throw new Error(error.message);
      return data || [];
    },
  });
};

// 2. Add a new lesson activity
export const useAddLessonActivity = () => {
  const queryClient = useQueryClient();
  return useMutation<LessonActivity, Error, NewLessonActivityPayload>({
    mutationFn: async (newActivity) => {
      const { error, data } = await supabase
        .from('lesson_activities')
        .insert({
            title: newActivity.title,
            teacher: newActivity.teacher,
            color: newActivity.color,
            start_time: newActivity.startTime,
            end_time: newActivity.endTime,
            comment: newActivity.comment,
            activity_id: newActivity.activityId,
            teacher_id: newActivity.teacherId,
            start_date: newActivity.startDate,
            rrule: newActivity.rrule,
            excluded_dates: newActivity.excludedDates,
        })
        .select(selectQuery)
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LESSON_ACTIVITIES_QUERY_KEY] });
    },
  });
};

// 3. Update a lesson activity
export const useUpdateLessonActivity = () => {
  const queryClient = useQueryClient();
  return useMutation<LessonActivity, Error, UpdateLessonActivityPayload>({
    mutationFn: async (activity) => {
        const { id, ...updateData } = activity;
        const { error, data } = await supabase
            .from('lesson_activities')
            .update({
                title: updateData.title,
                teacher: updateData.teacher,
                color: updateData.color,
                start_time: updateData.startTime,
                end_time: updateData.endTime,
                comment: updateData.comment,
                activity_id: updateData.activityId,
                teacher_id: updateData.teacherId,
                start_date: updateData.startDate,
                rrule: updateData.rrule,
                excluded_dates: updateData.excludedDates,
            })
            .eq('id', id)
            .select(selectQuery)
            .single();
        
        if (error) throw new Error(error.message);
        return data;
    },
    onSuccess: (data, variables) => {
        queryClient.invalidateQueries({ queryKey: [LESSON_ACTIVITIES_QUERY_KEY] });
    },
  });
};


// 4. Delete a lesson activity
export const useDeleteLessonActivity = () => {
    const queryClient = useQueryClient();
    return useMutation<any, Error, number>({ // The id is a number
        mutationFn: async (id) => {
            const { error, data } = await supabase
                .from('lesson_activities')
                .delete()
                .eq('id', id);

            if (error) throw new Error(error.message);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [LESSON_ACTIVITIES_QUERY_KEY] });
        },
    });
};
