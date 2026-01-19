import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ParentStudent {
  id: string;
  full_name: string;
  group_id: string | null;
  groups?: { id: string; name: string; color: string } | null;
}

export function useParentStudents(parentId: string | undefined) {
  return useQuery({
    queryKey: ['parent_students', parentId],
    queryFn: async () => {
      if (!parentId) return [];
      const { data, error } = await supabase
        .from('parent_student_links')
        .select(`
          id,
          students (
            *,
            groups (id, name, color)
          )
        `)
        .eq('parent_id', parentId);

      if (error) throw error;
      return (data || []).map((row: any) => row.students) as ParentStudent[];
    },
    enabled: !!parentId,
  });
}
