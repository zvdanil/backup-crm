import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface ParentLink {
  id: string;
  parent_id: string;
  student_id: string;
  user_profiles: {
    id: string;
    full_name: string | null;
  };
}

export function useParentLinks(studentId: string | undefined) {
  return useQuery({
    queryKey: ['parent_links', studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const { data, error } = await supabase
        .from('parent_student_links')
        .select(`
          id,
          parent_id,
          student_id,
          user_profiles (id, full_name)
        `)
        .eq('student_id', studentId);

      if (error) throw error;
      return data as ParentLink[];
    },
    enabled: !!studentId,
  });
}

export function useAddParentLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ parent_id, student_id }: { parent_id: string; student_id: string }) => {
      const { data, error } = await supabase
        .from('parent_student_links')
        .insert({ parent_id, student_id })
        .select('*')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['parent_links', variables.student_id] });
      toast({ title: 'Батьківський доступ додано' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useRemoveParentLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ linkId, student_id }: { linkId: string; student_id: string }) => {
      const { error } = await supabase
        .from('parent_student_links')
        .delete()
        .eq('id', linkId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['parent_links', variables.student_id] });
      toast({ title: 'Доступ видалено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
