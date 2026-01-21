import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface StaffBillingRule {
  id: string;
  staff_id: string;
  activity_id: string | null;
  rate_type: 'fixed' | 'percent' | 'per_session' | 'subscription' | 'per_student';
  rate: number; // Changed from rate_value to rate
  lesson_limit?: number | null;
  penalty_percent?: number | null;
  penalty_trigger_percent?: number | null;
  extra_lesson_rate?: number | null;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  activity?: { name: string } | null; // For joined activity data
}

export interface StaffJournalEntry {
  id: string;
  staff_id: string;
  activity_id: string | null;
  date: string;
  amount: number;
  base_amount: number | null;
  deductions_applied: DeductionApplied[];
  is_manual_override: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffJournalEntryWithRelations extends StaffJournalEntry {
  staff?: { id: string; full_name: string } | null;
  activity?: { id: string; name: string } | null;
}

export interface Deduction {
  name: string;
  type: 'percent' | 'fixed';
  value: number;
}

export interface DeductionApplied {
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  amount: number; // Сума комісії
}

export interface StaffManualRateHistory {
  id: string;
  staff_id: string;
  activity_id: string | null;
  manual_rate_type: 'hourly' | 'per_session';
  manual_rate_value: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffPayout {
  id: string;
  staff_id: string;
  amount: number;
  payout_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_note?: string | null;
}

export type StaffPayoutInsert = Omit<StaffPayout, 'id' | 'created_at' | 'updated_at'>;
export type StaffPayoutUpdate = Partial<StaffPayoutInsert>;

export type StaffBillingRuleInsert = Omit<StaffBillingRule, 'id' | 'created_at' | 'updated_at' | 'activity'>;
export type StaffManualRateHistoryInsert = Omit<StaffManualRateHistory, 'id' | 'created_at' | 'updated_at'>;
export type StaffBillingRuleUpdate = Partial<Omit<StaffBillingRule, 'id' | 'staff_id' | 'created_at' | 'updated_at'>>;
export type StaffJournalEntryInsert = Omit<StaffJournalEntry, 'id' | 'created_at' | 'updated_at'>;
export type StaffJournalEntryUpdate = Partial<Omit<StaffJournalEntry, 'id' | 'staff_id' | 'created_at' | 'updated_at'>>;

// Get staff billing rules for a specific staff member
export function useStaffBillingRules(staffId: string | undefined) {
  return useQuery({
    queryKey: ['staff-billing-rules', staffId],
    queryFn: async () => {
      if (!staffId) return [];
      
      const { data, error } = await supabase
        .from('staff_billing_rules' as any)
        .select(`
          *,
          activity:activities(name)
        `)
        .eq('staff_id', staffId)
        .order('effective_from', { ascending: false });
      
      if (error) throw error;
      // Map rate_value from DB to rate for TypeScript interface
      return ((data as any[]) || []).map(rule => ({
        ...rule,
        rate: rule.rate_value ?? rule.rate ?? 0,
        activity: rule.activity || null,
      })) as StaffBillingRule[]; 
    },
    enabled: !!staffId,
  });
}

// Get staff billing rules for a specific activity
export function useStaffBillingRulesByActivity(staffId: string | undefined, activityId: string | undefined) {
  return useQuery({
    queryKey: ['staff-billing-rules', staffId, activityId],
    queryFn: async () => {
      if (!staffId || !activityId) return [];
      
      const { data, error } = await supabase
        .from('staff_billing_rules' as any)
        .select(`
          *,
          activity:activities(name)
        `)
        .eq('staff_id', staffId)
        .eq('activity_id', activityId)
        .order('effective_from', { ascending: false });
      
      if (error) throw error;
      // Map rate_value from DB to rate for TypeScript interface
      return ((data as any[]) || []).map(rule => ({
        ...rule,
        rate: rule.rate_value ?? rule.rate ?? 0,
        activity: rule.activity || null,
      })) as StaffBillingRule[];
    },
    enabled: !!staffId && !!activityId,
  });
}

// Get all staff billing rules for an activity (for all staff members)
export function useAllStaffBillingRulesForActivity(activityId: string | undefined) {
  return useQuery({
    queryKey: ['staff-billing-rules-activity', activityId],
    queryFn: async () => {
      if (!activityId) return [];
      
      const { data, error } = await supabase
        .from('staff_billing_rules' as any)
        .select(`
          *,
          activity:activities(name)
        `)
        .or(`activity_id.eq.${activityId},activity_id.is.null`) // Rules for this activity or global rules
        .order('effective_from', { ascending: false });
      
      if (error) throw error;
      // Map rate_value from DB to rate for TypeScript interface
      return ((data as any[]) || []).map(rule => ({
        ...rule,
        rate: rule.rate_value ?? rule.rate ?? 0,
        activity: rule.activity || null,
      })) as StaffBillingRule[];
    },
    enabled: !!activityId,
  });
}

// Create staff billing rule
export function useCreateStaffBillingRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rule: StaffBillingRuleInsert) => {
      // Close previous rule if exists
      const { data: previousRule, error: findError } = await supabase
        .from('staff_billing_rules' as any)
        .select('id')
        .eq('staff_id', rule.staff_id)
        .eq('activity_id', rule.activity_id)
        .is('effective_to', null)
        .maybeSingle();

      if (findError) throw findError;

      if (previousRule && (previousRule as any).id) {
        const effectiveToDate = new Date(rule.effective_from);
        effectiveToDate.setDate(effectiveToDate.getDate() - 1);
        const effectiveToStr = effectiveToDate.toISOString().split('T')[0];
        
        const { error: updateError } = await supabase
          .from('staff_billing_rules' as any)
          .update({ effective_to: effectiveToStr })
          .eq('id', (previousRule as any).id);
        
        if (updateError) throw updateError;
      }

      // Create new rule - map rate to rate_value for database
      const insertData: any = {
        ...rule,
        rate_value: rule.rate,
      };
      delete insertData.rate;

      const { data, error } = await supabase
        .from('staff_billing_rules' as any)
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      // Map rate_value back to rate for TypeScript interface
      const result = data as any;
      return { ...result, rate: result.rate_value ?? result.rate ?? 0 } as StaffBillingRule;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['staff-billing-rules', data.staff_id] });
      toast({ title: 'Правило розрахунку збережено' });
    },
    onError: (error: any) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Update staff billing rule
export function useUpdateStaffBillingRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...rule }: { id: string } & StaffBillingRuleUpdate) => {
      // Map rate to rate_value for database if present
      const updateData: any = { ...rule };
      if ('rate' in updateData) {
        updateData.rate_value = updateData.rate;
        delete updateData.rate;
      }
      
      const { data, error } = await supabase
        .from('staff_billing_rules' as any)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      const result = data as any;
      return { ...result, rate: result.rate_value ?? result.rate ?? 0 } as StaffBillingRule;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['staff-billing-rules', data.staff_id] });
      toast({ title: 'Правило розрахунку оновлено' });
    },
    onError: (error: any) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete staff billing rule
export function useDeleteStaffBillingRule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, staffId }: { id: string; staffId: string }) => {
      const { error } = await supabase
        .from('staff_billing_rules' as any)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['staff-billing-rules', variables.staffId] });
      toast({ title: 'Правило розрахунку видалено' });
    },
    onError: (error: any) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Get staff journal entries
export function useStaffJournalEntries(staffId: string | undefined, month?: number, year?: number) {
  return useQuery({
    queryKey: ['staff-journal-entries', staffId, month, year],
    queryFn: async () => {
      if (!staffId) return [];
      
      let query = supabase
        .from('staff_journal_entries' as any)
        .select('*')
        .eq('staff_id', staffId);
      
      if (month !== undefined && year !== undefined) {
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
        query = query.gte('date', startDate).lte('date', endDate);
      }
      
      query = query.order('date', { ascending: false });
      
      const { data, error } = await query;
      
      if (error) throw error;
      if (!data || !Array.isArray(data)) return [];
      return (data as any[]).map(entry => ({
        ...entry,
        deductions_applied: entry.deductions_applied || [],
      })) as StaffJournalEntry[];
    },
    enabled: !!staffId,
  });
}

// Get all staff journal entries for a month (for expense journal)
export function useAllStaffJournalEntries(month: number, year: number) {
  return useQuery({
    queryKey: ['staff-journal-entries-all', month, year],
    queryFn: async () => {
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('staff_journal_entries' as any)
        .select(`
          *,
          staff:staff(id, full_name),
          activity:activities(id, name)
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
      
      if (error) throw error;
      
      // Map database results to our interface
      if (!data || Array.isArray(data) && data.length === 0) return [];
      return ((data as any[]) || []).map(entry => {
        if (entry && typeof entry === 'object' && 'id' in entry) {
          return {
            ...entry,
            staff: entry.staff || null,
            activity: entry.activity || null,
          };
        }
        return null;
      }).filter(Boolean) as StaffJournalEntryWithRelations[];
    },
  });
}

// Create or update staff journal entry
export function useUpsertStaffJournalEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (entry: StaffJournalEntryInsert) => {
      // Спочатку перевіряємо, чи існує запис з такими staff_id, activity_id (включно з NULL) та date
      // Використовуємо .limit(1), щоб обмежити кількість результатів на випадок дублікатів
      let query = supabase
        .from('staff_journal_entries' as any)
        .select('id')
        .eq('staff_id', entry.staff_id)
        .eq('date', entry.date)
        .eq('is_manual_override', entry.is_manual_override)
        .limit(1);
      
      if (entry.activity_id === null) {
        query = query.is('activity_id', null);
      } else {
        query = query.eq('activity_id', entry.activity_id);
      }
      
      // Використовуємо масив замість maybeSingle, щоб уникнути помилки "multiple rows"
      const { data: existingArray, error: checkError } = await query;
      
      if (checkError) throw checkError;

      let result;
      // Беремо перший запис з масиву (якщо він існує)
      const existing = (existingArray && existingArray.length > 0 ? existingArray[0] : null) as { id: string } | null;
      
      if (existing && typeof existing === 'object' && 'id' in existing) {
        // Якщо запис існує - оновлюємо його
        const { data: updateData, error: updateError } = await supabase
          .from('staff_journal_entries' as any)
          .update({
            amount: entry.amount,
            base_amount: entry.base_amount,
            deductions_applied: entry.deductions_applied || [],
            is_manual_override: entry.is_manual_override,
            notes: entry.notes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .maybeSingle();
        
        if (updateError) throw updateError;
        if (!updateData) {
          // Якщо рядок не знайдено (можливо, був видалений між перевіркою та оновленням), створюємо новий
          const { data: insertData, error: insertError } = await supabase
            .from('staff_journal_entries' as any)
            .insert({
              staff_id: entry.staff_id,
              activity_id: entry.activity_id,
              date: entry.date,
              amount: entry.amount,
              base_amount: entry.base_amount,
              deductions_applied: entry.deductions_applied || [],
              is_manual_override: entry.is_manual_override,
              notes: entry.notes,
            })
            .select()
            .single();
          
          if (insertError) throw insertError;
          result = insertData;
        } else {
          result = updateData;
        }
      } else {
        // Якщо запис не існує - створюємо новий
        const { data, error } = await supabase
          .from('staff_journal_entries' as any)
          .insert({
            staff_id: entry.staff_id,
            activity_id: entry.activity_id,
            date: entry.date,
            amount: entry.amount,
            base_amount: entry.base_amount,
            deductions_applied: entry.deductions_applied || [],
            is_manual_override: entry.is_manual_override,
            notes: entry.notes,
          })
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      }

      if (!result || typeof result !== 'object' || !('id' in (result as any))) {
        throw new Error('Invalid response from database');
      }
      
      const mappedResult = result as any;
      return {
        ...mappedResult,
        deductions_applied: mappedResult.deductions_applied || [],
      } as StaffJournalEntry;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['staff-journal-entries', data.staff_id] });
      // Invalidate all month/year combinations for staff-journal-entries-all
      // This ensures the expense journal refreshes regardless of which month/year is displayed
      queryClient.invalidateQueries({ 
        queryKey: ['staff-journal-entries-all'],
        exact: false // This will match all queries starting with this key
      });
      toast({ title: 'Запис збережено' });
    },
    onError: (error: any) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete staff journal entry
export function useDeleteStaffJournalEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      staff_id, 
      activity_id, 
      date,
      is_manual_override
    }: { 
      id?: string; 
      staff_id?: string; 
      activity_id?: string; 
      date?: string;
      is_manual_override?: boolean;
      staffId?: string; // Legacy support
    }) => {
      let query = supabase
        .from('staff_journal_entries' as any)
        .delete();
      
      if (id) {
        query = query.eq('id', id);
      } else if (staff_id && activity_id && date) {
        query = query.eq('staff_id', staff_id)
                     .eq('activity_id', activity_id)
                     .eq('date', date);
        if (typeof is_manual_override === 'boolean') {
          query = query.eq('is_manual_override', is_manual_override);
        }
      } else {
        throw new Error('Either id or (staff_id, activity_id, date) must be provided');
      }
      
      const { error } = await query;
      
      if (error) throw error;
      
      return { staff_id: staff_id || id };
    },
    onSuccess: (_, variables) => {
      const staffId = variables.staff_id || variables.staffId;
      if (staffId) {
        queryClient.invalidateQueries({ queryKey: ['staff-journal-entries', staffId] });
      }
      // Invalidate all month/year combinations for staff-journal-entries-all
      queryClient.invalidateQueries({ 
        queryKey: ['staff-journal-entries-all'],
        exact: false // This will match all queries starting with this key
      });
      toast({ title: 'Запис видалено' });
    },
    onError: (error: any) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Get billing rule for a specific date
export function getStaffBillingRuleForDate(
  rules: StaffBillingRule[] | undefined,
  date: string,
  activityId: string | null = null
): StaffBillingRule | null {
  if (!rules || rules.length === 0) return null;

  const dateObj = new Date(date);
  
  // Find applicable rule
  const applicableRule = rules.find(rule => {
    // Match activity_id (null means global rule)
    if (activityId !== null && rule.activity_id !== activityId && rule.activity_id !== null) {
      return false;
    }
    
    const fromDate = new Date(rule.effective_from);
    const toDate = rule.effective_to ? new Date(rule.effective_to) : null;
    
    return dateObj >= fromDate && (!toDate || dateObj < toDate);
  });
  
  return applicableRule || null;
}

// Get staff manual rate history for a specific staff member
export function useStaffManualRateHistory(staffId: string | undefined) {
  return useQuery({
    queryKey: ['staff-manual-rate-history', staffId],
    queryFn: async () => {
      if (!staffId) return [];
      
      const { data, error } = await supabase
        .from('staff_manual_rate_history' as any)
        .select('*')
        .eq('staff_id', staffId)
        .order('effective_from', { ascending: false });
      
      if (error) throw error;
      return ((data as any) || []) as StaffManualRateHistory[];
    },
    enabled: !!staffId,
  });
}

// Get manual rate for a specific date
export function getStaffManualRateForDate(
  history: StaffManualRateHistory[] | undefined,
  date: string,
  activityId: string | null = null
): StaffManualRateHistory | null {
  if (!history || history.length === 0) return null;

  const dateObj = new Date(date);

  const applicableEntry = history.find(entry => {
    if (activityId !== null && entry.activity_id !== activityId && entry.activity_id !== null) {
      return false;
    }
    const fromDate = new Date(entry.effective_from);
    const toDate = entry.effective_to ? new Date(entry.effective_to) : null;
    
    return dateObj >= fromDate && (!toDate || dateObj < toDate);
  });
  
  if (!applicableEntry) return null;
  if (activityId === null) return applicableEntry;

  const specific = history.find(entry => {
    if (entry.activity_id !== activityId) return false;
    const fromDate = new Date(entry.effective_from);
    const toDate = entry.effective_to ? new Date(entry.effective_to) : null;
    return dateObj >= fromDate && (!toDate || dateObj < toDate);
  });

  return specific || applicableEntry;
}

// Create staff manual rate history entry
export function useCreateStaffManualRateHistory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (entry: StaffManualRateHistoryInsert) => {
      // Close previous entry if exists
      let previousQuery = supabase
        .from('staff_manual_rate_history' as any)
        .select('id')
        .eq('staff_id', entry.staff_id)
        .is('effective_to', null);

      previousQuery = entry.activity_id === null
        ? previousQuery.is('activity_id', null)
        : previousQuery.eq('activity_id', entry.activity_id);

      const { data: previousEntry, error: findError } = await previousQuery.maybeSingle();

      if (findError) throw findError;

      if (previousEntry && (previousEntry as any).id) {
        const effectiveToDate = new Date(entry.effective_from);
        effectiveToDate.setDate(effectiveToDate.getDate() - 1);
        const effectiveToStr = effectiveToDate.toISOString().split('T')[0];
        
        const { error: updateError } = await supabase
          .from('staff_manual_rate_history' as any)
          .update({ effective_to: effectiveToStr })
          .eq('id', (previousEntry as any).id);
        
        if (updateError) throw updateError;
      }

      // Create new entry
      const { data, error } = await supabase
        .from('staff_manual_rate_history' as any)
        .insert(entry)
        .select()
        .single();
      
      if (error) throw error;
      return (data as any) as StaffManualRateHistory;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['staff-manual-rate-history', data.staff_id] });
      toast({ title: 'Ставку збережено' });
    },
    onError: (error: any) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete staff manual rate history entry
export function useDeleteStaffManualRateHistory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, staffId }: { id: string; staffId: string }) => {
      const { error } = await supabase
        .from('staff_manual_rate_history' as any)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['staff-manual-rate-history', variables.staffId] });
      toast({ title: 'Ставку видалено' });
    },
    onError: (error: any) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// ============================================
// Staff Payouts (Виплати зарплати)
// ============================================

export interface StaffPayout {
  id: string;
  staff_id: string;
  amount: number;
  payout_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type StaffPayoutInsert = Omit<StaffPayout, 'id' | 'created_at' | 'updated_at'>;
export type StaffPayoutUpdate = Partial<Omit<StaffPayout, 'id' | 'staff_id' | 'created_at'>>;

// Get all payouts for a specific staff member
export function useStaffPayouts(staffId: string | undefined) {
  return useQuery({
    queryKey: ['staff-payouts', staffId],
    queryFn: async () => {
      if (!staffId) return [];
      
      const { data, error } = await supabase
        .from('staff_payouts' as any)
        .select('*')
        .eq('staff_id', staffId)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('payout_date', { ascending: false });
      
      if (error) throw error;
      return ((data as any) || []) as StaffPayout[];
    },
    enabled: !!staffId,
  });
}

// Get all payouts for all staff (for payroll registry)
export function useAllStaffPayouts() {
  return useQuery({
    queryKey: ['staff-payouts-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_payouts' as any)
        .select('*')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('payout_date', { ascending: false });
      
      if (error) throw error;
      return ((data as any) || []) as StaffPayout[];
    },
  });
}

// Create staff payout
export function useCreateStaffPayout() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (payout: StaffPayoutInsert) => {
      const { data, error } = await supabase
        .from('staff_payouts' as any)
        .insert(payout)
        .select()
        .single();
      
      if (error) throw error;
      return (data as any) as StaffPayout;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['staff-payouts', data.staff_id], exact: false });
      queryClient.invalidateQueries({ queryKey: ['staff-payouts-all'], exact: false });
      // Also invalidate journal entries to update calendar in StaffDetail
      queryClient.invalidateQueries({ queryKey: ['staff-journal-entries', data.staff_id], exact: false });
      toast({ title: 'Виплату збережено' });
    },
    onError: (error: any) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Update staff payout
export function useUpdateStaffPayout() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: StaffPayoutUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('staff_payouts' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return (data as any) as StaffPayout;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['staff-payouts', data.staff_id], exact: false });
      queryClient.invalidateQueries({ queryKey: ['staff-payouts-all'], exact: false });
      // Also invalidate journal entries to update calendar in StaffDetail
      queryClient.invalidateQueries({ queryKey: ['staff-journal-entries', data.staff_id], exact: false });
      toast({ title: 'Виплату оновлено' });
    },
    onError: (error: any) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete staff payout
export function useDeleteStaffPayout() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, staffId, deleteNote }: { id: string; staffId: string; deleteNote?: string | null }) => {
      const { error } = await supabase
        .from('staff_payouts' as any)
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_note: deleteNote || null,
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, { staffId }) => {
      queryClient.invalidateQueries({ queryKey: ['staff-payouts', staffId], exact: false });
      queryClient.invalidateQueries({ queryKey: ['staff-payouts-all'], exact: false });
      // Also invalidate journal entries to update calendar in StaffDetail
      queryClient.invalidateQueries({ queryKey: ['staff-journal-entries', staffId], exact: false });
      toast({ title: 'Виплату видалено' });
    },
    onError: (error: any) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
