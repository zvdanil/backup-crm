
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StaffBillingRule {
  id: string;
  staff_id: string;
  activity_id: string;
  rate_type: 'percent' | 'fixed' | 'hourly';
  rate: number;
}

export function useStaffBillingRules(staffId?: string) {
  return useQuery({
    queryKey: ['staff_billing_rules', staffId].filter(Boolean),
    queryFn: async () => {
      let query = supabase.from('staff_billing_rules').select('*');
      
      if (staffId) {
        query = query.eq('staff_id', staffId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data as StaffBillingRule[];
    },
  });
}
