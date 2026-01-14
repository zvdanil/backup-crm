import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { Student } from './useStudents';
import type { Activity } from './useActivities';

export interface Enrollment {
  id: string;
  student_id: string;
  activity_id: string;
  teacher_id: string | null;
  custom_price: number | null;
  discount_percent: number | null;
  is_active: boolean;
  enrolled_at: string;
  unenrolled_at: string | null;
  effective_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnrollmentWithRelations extends Enrollment {
  students: Student;
  activities: Activity;
}

export type EnrollmentInsert = Pick<Enrollment, 'student_id' | 'activity_id' | 'custom_price' | 'discount_percent'>;
export type EnrollmentUpdate = Partial<Omit<Enrollment, 'id' | 'student_id' | 'activity_id' | 'created_at' | 'updated_at'>>;

export function useEnrollments(filters?: { studentId?: string; activityId?: string; activeOnly?: boolean }) {
  return useQuery({
    queryKey: ['enrollments', filters],
    queryFn: async () => {
      let query = supabase
        .from('enrollments')
        .select(`
          *,
          students (
            *,
            groups (
              id,
              name,
              color
            )
          ),
          activities (*)
        `)
        .order('enrolled_at', { ascending: false });
      
      if (filters?.studentId) {
        query = query.eq('student_id', filters.studentId);
      }
      if (filters?.activityId) {
        query = query.eq('activity_id', filters.activityId);
      }
      if (filters?.activeOnly) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as EnrollmentWithRelations[];
    },
  });
}

export function useEnrollment(id: string) {
  return useQuery({
    queryKey: ['enrollments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          *,
          students (
            *,
            groups (
              id,
              name,
              color
            )
          ),
          activities (*)
        `)
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data as EnrollmentWithRelations | null;
    },
    enabled: !!id,
  });
}

export function useCreateEnrollment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (enrollment: EnrollmentInsert) => {
      // Спочатку перевіряємо, чи існує запис з такими student_id та activity_id
      const { data: existing, error: checkError } = await supabase
        .from('enrollments')
        .select('id')
        .eq('student_id', enrollment.student_id)
        .eq('activity_id', enrollment.activity_id)
        .maybeSingle();
      
      if (checkError) throw checkError;

      let result;
      if (existing) {
        // Якщо запис існує - оновлюємо його (ON CONFLICT DO UPDATE)
        const { data, error } = await supabase
          .from('enrollments')
          .update({
            custom_price: enrollment.custom_price,
            discount_percent: enrollment.discount_percent,
            is_active: true,
            enrolled_at: new Date().toISOString(),
            unenrolled_at: null, // Скидаємо unenrolled_at, якщо повторно записуємо
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      } else {
        // Якщо запис не існує - створюємо новий
        const { data, error } = await supabase
          .from('enrollments')
          .insert({
            ...enrollment,
            is_active: true,
            enrolled_at: new Date().toISOString(),
          })
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast({ title: 'Дитину записано на активність' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateEnrollment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...enrollment }: { id: string } & EnrollmentUpdate) => {
      const { data, error } = await supabase
        .from('enrollments')
        .update(enrollment)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      toast({ title: 'Запись обновлена' });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUnenrollStudent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      // Перевіряємо, чи існує запис перед видаленням
      const { data: existing, error: checkError } = await supabase
        .from('enrollments')
        .select('id, student_id, activity_id')
        .eq('id', id)
        .maybeSingle();
      
      if (checkError) throw checkError;
      
      if (!existing) {
        throw new Error('Запис не знайдено');
      }

      // Виконуємо soft delete - встановлюємо is_active = false
      const { data, error } = await supabase
        .from('enrollments')
        .update({
          is_active: false,
          unenrolled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast({ title: 'Дитину відписано від активності' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
