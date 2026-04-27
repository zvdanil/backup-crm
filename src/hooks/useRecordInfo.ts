import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RecordInfo {
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  user_id: string | null;
  created_at: string;
  user_profiles: { full_name: string | null } | null;
}

// mode='created'      → first INSERT (who created the record)
// mode='last_changed' → latest entry (who last changed — for attendance marks)
export function useRecordInfo(
  recordId: string | null | undefined,
  mode: 'created' | 'last_changed' = 'created'
) {
  return useQuery({
    queryKey: ['record-info', recordId, mode],
    enabled: !!recordId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('change_log')
        .select('action, user_id, created_at, user_profiles(full_name)')
        .eq('record_id', recordId!);

      if (mode === 'created') {
        query = query.eq('action', 'INSERT').order('created_at', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query.limit(1).single();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as RecordInfo) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
