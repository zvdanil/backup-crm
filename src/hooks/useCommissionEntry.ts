import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActivities, useCreateActivity } from '@/hooks/useActivities';
import { toast } from '@/hooks/use-toast';

const COMMISSION_ACTIVITY_PAYLOAD = {
  name: 'Комісії',
  category: 'expense' as const,
  color: '#EF4444',
  is_actual_expense: true,
  teacher_payment_percent: 50,
  default_price: 0,
  payment_type: 'subscription' as const,
  is_active: true,
  show_in_children: true,
  show_in_journals: true,
  auto_journal: false,
  activity_group: null,
  balance_display_mode: null,
  fixed_teacher_rate: null,
  payment_mode: null,
  billing_rules: null,
  config: null,
  account_id: null,
  description: null,
};

export interface SyncCommissionParams {
  salaryTransactionId: string;
  amount: number;
  date: string;
  accountId: string | null;
  staffName: string;
}

/**
 * Syncs commission entry for a salary transaction.
 * - amount > 0: create or update commission in "Комісії" journal
 * - amount = 0: delete commission if exists
 */
export async function syncCommissionEntry(
  params: SyncCommissionParams,
  options: {
    activities: { id: string; name: string; category: string }[];
    createActivity: (payload: typeof COMMISSION_ACTIVITY_PAYLOAD) => Promise<{ id: string }>;
  }
): Promise<void> {
  const { salaryTransactionId, amount, date, accountId, staffName } = params;
  const { activities, createActivity } = options;

  let commissionActivity = activities.find(
    (a) => a.name === 'Комісії' && a.category === 'expense'
  );
  if (!commissionActivity) {
    commissionActivity = await createActivity(COMMISSION_ACTIVITY_PAYLOAD as any);
  }

  const { data: existing } = await supabase
    .from('finance_transactions')
    .select('id')
    .eq('salary_transaction_id', salaryTransactionId)
    .maybeSingle();

  if (amount === 0) {
    if (existing) {
      await supabase.from('finance_transactions').delete().eq('id', existing.id);
    }
    return;
  }

  const payload = {
    type: 'expense' as const,
    activity_id: commissionActivity.id,
    staff_id: null,
    student_id: null,
    expense_category_id: null,
    amount,
    date,
    description: `Комісія за ${staffName}`,
    category: null,
    account_id: accountId,
    salary_transaction_id: salaryTransactionId,
  };

  if (existing) {
    await supabase
      .from('finance_transactions')
      .update({
        amount: payload.amount,
        date: payload.date,
        description: payload.description,
        account_id: payload.account_id,
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('finance_transactions').insert(payload);
  }
}

export function useCommissionEntry() {
  const queryClient = useQueryClient();
  const { data: activities = [] } = useActivities();
  const createActivity = useCreateActivity();

  return useMutation({
    mutationFn: async (params: SyncCommissionParams) => {
      await syncCommissionEntry(params, {
        activities,
        createActivity: createActivity.mutateAsync as any,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['staff-payouts'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false });
    },
    onError: (error: any) => {
      toast({
        title: 'Помилка збереження комісії',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/** Fetch commission amount for salary transaction ids */
export function useCommissionsForSalaryTransactions(salaryTransactionIds: string[]) {
  return useQuery({
    queryKey: ['commission-entries', [...salaryTransactionIds].sort().join(',')],
    queryFn: async () => {
      if (salaryTransactionIds.length === 0) return new Map<string, { amount: number; id: string }>();
      const { data, error } = await supabase
          .from('finance_transactions')
          .select('id, salary_transaction_id, amount')
          .in('salary_transaction_id', [...salaryTransactionIds].sort());
        if (error) return new Map<string, { amount: number; id: string }>();
        const map = new Map<string, { amount: number; id: string }>();
        (data || []).forEach((row: any) => {
          if (row.salary_transaction_id) {
            map.set(row.salary_transaction_id, { amount: Number(row.amount || 0), id: row.id });
          }
        });
        return map;
    },
    enabled: salaryTransactionIds.length > 0,
  });
}
