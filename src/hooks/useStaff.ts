import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface Staff {
  id: string;
  full_name: string;
  position: string;
  is_active: boolean;
  deductions: Deduction[] | null; // JSONB field for dynamic deductions
  accrual_mode: 'auto' | 'manual'; // Режим нарахування: 'auto' - автоматичне з журналу, 'manual' - ручне
  manual_rate_type: 'hourly' | 'per_session' | null; // Тип ставки для ручного режиму: 'hourly' - почасово, 'per_session' - за заняття
  manual_rate_value: number | null; // Значення ставки за замовчуванням для ручного режиму
  created_at: string;
  updated_at: string;
}

export interface Deduction {
  name: string;
  type: 'percent' | 'fixed';
  value: number;
}

export type StaffInsert = Omit<Staff, 'id' | 'created_at' | 'updated_at'>;
export type StaffUpdate = Partial<StaffInsert>;

export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, full_name, position, is_active, deductions, accrual_mode, manual_rate_type, manual_rate_value, created_at, updated_at')
        .order('full_name');
      
      if (error) throw error;
      return data as Staff[];
    },
  });
}

export function useStaffMember(id: string) {
  return useQuery({
    queryKey: ['staff', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, full_name, position, is_active, deductions, accrual_mode, manual_rate_type, manual_rate_value, created_at, updated_at')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data as Staff | null;
    },
    enabled: !!id,
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (staff: StaffInsert) => {
      const { data, error } = await supabase
        .from('staff')
        .insert(staff)
        .select('id, full_name, position, is_active, deductions, accrual_mode, manual_rate_type, manual_rate_value, created_at, updated_at')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast({ title: 'Співробітника додано' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...staff }: { id: string } & StaffUpdate) => {
      const { data, error } = await supabase
        .from('staff')
        .update(staff)
        .eq('id', id)
        .select('id, full_name, position, is_active, deductions, accrual_mode, manual_rate_type, manual_rate_value, created_at, updated_at')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast({ title: 'Співробітника оновлено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast({ title: 'Співробітника видалено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
