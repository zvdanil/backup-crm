import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdvanceBalance {
  student_id: string;
  account_id: string;
  balance: number;
  updated_at: string;
}

export function useAdvanceBalances(studentId?: string) {
  return useQuery({
    queryKey: ['advance_balances', studentId],
    queryFn: async () => {
      let query = supabase
        .from('advance_balances')
        .select('*, payment_accounts:account_id(name)')
        .order('updated_at', { ascending: false });
      
      if (studentId) {
        query = query.eq('student_id', studentId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as (AdvanceBalance & { payment_accounts: { name: string } | null })[];
    },
    enabled: true,
  });
}
