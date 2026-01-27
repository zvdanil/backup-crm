import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type TransactionType = 'income' | 'expense' | 'payment' | 'salary' | 'household' | 'advance_payment';

export interface FinanceTransaction {
  id: string;
  type: TransactionType;
  student_id: string | null;
  activity_id: string | null;
  staff_id: string | null;
  expense_category_id?: string | null;
  account_id: string | null; // Payment account for this transaction
  amount: number;
  date: string;
  description: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export type FinanceTransactionInsert = Omit<FinanceTransaction, 'id' | 'created_at' | 'updated_at'>;
export type FinanceTransactionUpdate = Partial<FinanceTransactionInsert>;

export function useFinanceTransactions(filters?: { 
  studentId?: string; 
  activityId?: string; 
  month?: number; 
  year?: number;
  type?: TransactionType;
}) {
  return useQuery({
    queryKey: ['finance_transactions', filters],
    queryFn: async () => {
      let query = supabase
        .from('finance_transactions')
        .select('*')
        .order('date', { ascending: false });

      if (filters?.studentId) {
        query = query.eq('student_id', filters.studentId);
      }
      if (filters?.activityId) {
        query = query.eq('activity_id', filters.activityId);
      }
      if (filters?.type) {
        query = query.eq('type', filters.type);
      }
      if (filters?.month !== undefined && filters?.year !== undefined) {
        const startDate = new Date(filters.year, filters.month, 1).toISOString().split('T')[0];
        const endDate = new Date(filters.year, filters.month + 1, 0).toISOString().split('T')[0];
        query = query.gte('date', startDate).lte('date', endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as FinanceTransaction[];
    },
  });
}

export function useCreateFinanceTransaction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (transaction: FinanceTransactionInsert) => {
      const { data, error } = await supabase
        .from('finance_transactions')
        .insert(transaction)
        .select()
        .single();
      
      if (error) throw error;

      if (transaction.type === 'salary' && transaction.staff_id) {
        const { error: payoutError } = await supabase
          .from('staff_payouts' as any)
          .insert({
            staff_id: transaction.staff_id,
            amount: transaction.amount,
            payout_date: transaction.date,
            notes: transaction.description || null,
          });

        if (payoutError) throw payoutError;
      }
      
      // Auto-charge from advance balance for new income/expense transactions
      if ((transaction.type === 'income' || transaction.type === 'expense') &&
          transaction.student_id && 
          transaction.account_id && 
          transaction.activity_id) {
        try {
          // Call PostgreSQL function to auto-charge from advance
          const { error: rpcError } = await supabase.rpc('auto_charge_from_advance', {
            p_student_id: transaction.student_id,
            p_account_id: transaction.account_id,
            p_activity_id: transaction.activity_id,
            p_charge_amount: transaction.amount,
          });
          
          if (rpcError) {
            console.error('[useCreateFinanceTransaction] Auto-charge error:', rpcError);
            // Don't throw - transaction is already created, just log the error
          }
        } catch (err) {
          console.error('[useCreateFinanceTransaction] Auto-charge exception:', err);
          // Don't throw - transaction is already created
        }
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      // Invalidate advance balances if transaction is for a student with account_id
      if (data.student_id && data.account_id) {
        queryClient.invalidateQueries({ queryKey: ['advance_balances'] });
      }
      // Invalidate all dashboard queries (with year/month variations)
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false });
      // Invalidate student balance queries if transaction is for a student
      if (data.student_id) {
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] });
        queryClient.invalidateQueries({ queryKey: ['student_total_balance'] });
      }
      if (data.staff_id && data.type === 'salary') {
        queryClient.invalidateQueries({ queryKey: ['staff-payouts', data.staff_id], exact: false });
        queryClient.invalidateQueries({ queryKey: ['staff-payouts-all'], exact: false });
      }
      toast({ title: 'Транзакцію створено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateFinanceTransaction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...transaction }: { id: string } & FinanceTransactionUpdate) => {
      const { data, error } = await supabase
        .from('finance_transactions')
        .update(transaction)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      toast({ title: 'Транзакцію оновлено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteFinanceTransaction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('finance_transactions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      // Invalidate all dashboard queries (with year/month variations)
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] });
      queryClient.invalidateQueries({ queryKey: ['student_total_balance'] });
      toast({ title: 'Транзакцію видалено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Upsert finance transaction (find by student_id, activity_id, date or create new)
export function useUpsertFinanceTransaction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (transaction: FinanceTransactionInsert & { id?: string }) => {
      // Try to find existing transaction
      let query = supabase
        .from('finance_transactions')
        .select('id')
        .eq('date', transaction.date)
        .eq('type', transaction.type);
      
      if (transaction.student_id) {
        query = query.eq('student_id', transaction.student_id);
      } else {
        query = query.is('student_id', null);
      }
      
      if (transaction.activity_id) {
        query = query.eq('activity_id', transaction.activity_id);
      } else {
        query = query.is('activity_id', null);
      }
      
      const { data: existing, error: findError } = await query.maybeSingle();
      
      if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw findError;
      }
      
      if (existing && existing.id) {
        // Update existing transaction
        const { data, error } = await supabase
          .from('finance_transactions')
          .update({
            amount: transaction.amount,
            description: transaction.description,
            category: transaction.category,
            account_id: transaction.account_id ?? null, // Update account_id if provided
          })
          .eq('id', existing.id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        // Create new transaction
        const { id, ...insertData } = transaction;
        const { data, error } = await supabase
          .from('finance_transactions')
          .insert({
            ...insertData,
            account_id: insertData.account_id ?? null, // Ensure account_id is set
          })
          .select()
          .single();
        
        if (error) throw error;
        
        // Auto-charge from advance balance for new income/expense transactions
        if (data && 
            (insertData.type === 'income' || insertData.type === 'expense') &&
            insertData.student_id && 
            insertData.account_id && 
            insertData.activity_id) {
          try {
            // Call PostgreSQL function to auto-charge from advance
            const { error: rpcError } = await supabase.rpc('auto_charge_from_advance', {
              p_student_id: insertData.student_id,
              p_account_id: insertData.account_id,
              p_activity_id: insertData.activity_id,
              p_charge_amount: insertData.amount,
            });
            
            if (rpcError) {
              console.error('[useUpsertFinanceTransaction] Auto-charge error:', rpcError);
              // Don't throw - transaction is already created, just log the error
            }
          } catch (err) {
            console.error('[useUpsertFinanceTransaction] Auto-charge exception:', err);
            // Don't throw - transaction is already created
          }
        }
        
        return data;
      }
    },
    onSuccess: async (data) => {
      // Invalidate advance balances if transaction is for a student with account_id
      if (data?.student_id && data?.account_id) {
        queryClient.invalidateQueries({ queryKey: ['advance_balances'] });
      }
      // Принудительно инвалидируем и перезапрашиваем все связанные запросы
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
      ]);
      // Принудительно перезапрашиваем ВСЕ запросы дашборда (не только активные)
      await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false });
    },
    onError: (error) => {
      console.error('Error upserting finance transaction:', error);
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Calculate balance for student by activity
export function useStudentActivityBalance(studentId: string, activityId: string, month?: number, year?: number) {
  return useQuery({
    queryKey: ['student_activity_balance', studentId, activityId, month, year],
    queryFn: async () => {
      const now = new Date();
      const targetMonth = month !== undefined ? month : now.getMonth();
      const targetYear = year !== undefined ? year : now.getFullYear();
      
      const startDate = new Date(targetYear, targetMonth, 1).toISOString().split('T')[0];
      const endDate = new Date(targetYear, targetMonth + 1, 0).toISOString().split('T')[0];

      // Get payments (payment and advance_payment)
      // Strictly filter by student_id and activity_id - exclude null values
      const { data: payments, error: paymentsError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null) // Explicitly exclude null
        .eq('activity_id', activityId)
        .not('activity_id', 'is', null) // Explicitly exclude null
        .in('type', ['payment', 'advance_payment'])
        .gte('date', startDate)
        .lte('date', endDate);

      if (paymentsError) throw paymentsError;

      // Get charges from finance_transactions (income type) - for Garden Attendance Journal base tariffs
      // Strictly filter by student_id and activity_id - exclude null values
      const { data: incomeTransactions, error: incomeError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null) // Explicitly exclude null
        .eq('activity_id', activityId)
        .not('activity_id', 'is', null) // Explicitly exclude null
        .eq('type', 'income')
        .gte('date', startDate)
        .lte('date', endDate);

      if (incomeError) throw incomeError;

      // Get refunds from finance_transactions (expense type) - for Garden Attendance Journal food tariffs
      // Strictly filter by student_id and activity_id - exclude null values
      const { data: expenseTransactions, error: expenseError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null) // Explicitly exclude null
        .eq('activity_id', activityId)
        .not('activity_id', 'is', null) // Explicitly exclude null
        .eq('type', 'expense')
        .gte('date', startDate)
        .lte('date', endDate);

      if (expenseError) throw expenseError;

      let charges = 0;
      let refunds = 0;
      
      // First, try to get charges from finance_transactions (for Garden Attendance Journal)
      if (incomeTransactions && incomeTransactions.length > 0) {
        charges = incomeTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
      }
      
      // Get refunds (expense transactions for food - this is a refund to client)
      if (expenseTransactions && expenseTransactions.length > 0) {
        refunds = expenseTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        // For food activities: refunds don't reduce charges, they are separate (positive for client)
        // For other activities: refunds reduce charges
        // We'll handle this in the balance calculation
      }
      
      // If no finance transactions, fallback to attendance
      if (incomeTransactions && incomeTransactions.length === 0 && (!expenseTransactions || expenseTransactions.length === 0)) {
        // Fallback to attendance (for regular journals)
        const { data: enrollments, error: enrollmentsError } = await supabase
          .from('enrollments')
          .select('id')
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .eq('is_active', true)
          .maybeSingle();

        if (enrollmentsError) throw enrollmentsError;

        if (enrollments) {
          const { data: attendance, error: attendanceError } = await supabase
            .from('attendance')
            .select('charged_amount')
            .eq('enrollment_id', enrollments.id)
            .gte('date', startDate)
            .lte('date', endDate);

          if (attendanceError) throw attendanceError;
          // Розраховуємо витрати тільки з charged_amount (value не впливає на баланс)
          charges = attendance?.reduce((sum, a) => sum + (a.charged_amount || 0), 0) || 0;
        }
      }

      const totalPayments = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      // For food activities: balance = payments - charges + refunds (refunds increase balance)
      // For other activities: balance = payments - charges (refunds already reduced charges)
      // We need to check if this is a food activity - but we don't have that info here
      // So we'll calculate: balance = payments - charges + refunds (refunds always increase balance for client)
      const balance = totalPayments - charges + refunds;

      return { balance, payments: totalPayments, charges, refunds };
    },
    enabled: !!studentId && !!activityId,
  });
}

// Calculate monthly balance for subscription/fixed activities (full month charge)
export function useStudentActivityMonthlyBalance(
  studentId: string,
  activityId: string,
  baseMonthlyCharge: number,
  month?: number,
  year?: number
) {
  return useQuery({
    queryKey: ['student_activity_monthly_balance', studentId, activityId, baseMonthlyCharge, month, year],
    queryFn: async () => {
      const now = new Date();
      const targetMonth = month !== undefined ? month : now.getMonth();
      const targetYear = year !== undefined ? year : now.getFullYear();

      const startDate = new Date(targetYear, targetMonth, 1).toISOString().split('T')[0];
      const endDate = new Date(targetYear, targetMonth + 1, 0).toISOString().split('T')[0];

      const { data: payments, error: paymentsError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null)
        .eq('activity_id', activityId)
        .not('activity_id', 'is', null)
        .in('type', ['payment', 'advance_payment'])
        .gte('date', startDate)
        .lte('date', endDate);

      if (paymentsError) throw paymentsError;

      const { data: incomeTransactions, error: incomeError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null)
        .eq('activity_id', activityId)
        .not('activity_id', 'is', null)
        .eq('type', 'income')
        .gte('date', startDate)
        .lte('date', endDate);

      if (incomeError) throw incomeError;

      const { data: expenseTransactions, error: expenseError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null)
        .eq('activity_id', activityId)
        .not('activity_id', 'is', null)
        .eq('type', 'expense')
        .gte('date', startDate)
        .lte('date', endDate);

      if (expenseError) throw expenseError;

      const totalPayments = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const refunds = expenseTransactions?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

      const charges = baseMonthlyCharge;
      const balance = totalPayments - charges + refunds;

      return { balance, payments: totalPayments, charges, refunds };
    },
    enabled: !!studentId && !!activityId,
  });
}

// Calculate total balance for student across all activities
export function useStudentTotalBalance(studentId: string, month?: number, year?: number) {
  return useQuery({
    queryKey: ['student_total_balance', studentId, month, year],
    queryFn: async () => {
      // Only calculate date range if month and year are provided
      let startDate: string | undefined;
      let endDate: string | undefined;
      
      if (month !== undefined && year !== undefined) {
        startDate = new Date(year, month, 1).toISOString().split('T')[0];
        endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
      }

      // Get all payments (for selected month or all time)
      // Strictly filter by student_id - exclude null values
      const paymentsQuery = supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null) // Explicitly exclude null
        .in('type', ['payment', 'advance_payment']);
      
      if (startDate && endDate) {
        paymentsQuery.gte('date', startDate).lte('date', endDate);
      }

      const { data: payments, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;

      // Get all charges from finance_transactions (income type)
      // Strictly filter by student_id - exclude null values
      const incomeQuery = supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null) // Explicitly exclude null
        .eq('type', 'income');
      
      if (startDate && endDate) {
        incomeQuery.gte('date', startDate).lte('date', endDate);
      }

      const { data: incomeTransactions, error: incomeError } = await incomeQuery;
      if (incomeError) throw incomeError;

      // Get all refunds from finance_transactions (expense type)
      // Strictly filter by student_id - exclude null values
      const expenseQuery = supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null) // Explicitly exclude null
        .eq('type', 'expense');
      
      if (startDate && endDate) {
        expenseQuery.gte('date', startDate).lte('date', endDate);
      }

      const { data: expenseTransactions, error: expenseError } = await expenseQuery;
      if (expenseError) throw expenseError;

      let charges = 0;
      let refunds = 0;
      
      if (incomeTransactions && incomeTransactions.length > 0) {
        charges = incomeTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
      }
      
      if (expenseTransactions && expenseTransactions.length > 0) {
        refunds = expenseTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        // Don't reduce charges here - refunds will be added to balance separately
        // For food activities: charges stay as is (0 if no income), refunds increase balance
        // For other activities: we'll handle refunds in balance calculation
      }
      
      // Fallback to attendance if no finance transactions
      // Only use attendance data that belongs to this specific student
      if (incomeTransactions && incomeTransactions.length === 0 && (!expenseTransactions || expenseTransactions.length === 0)) {
        // Get all enrollments for this student (to ensure we only get attendance for this student)
        const { data: studentEnrollments, error: enrollmentError } = await supabase
          .from('enrollments')
          .select('id')
          .eq('student_id', studentId);
        
        if (enrollmentError) throw enrollmentError;
        
        if (studentEnrollments && studentEnrollments.length > 0) {
          const enrollmentIds = studentEnrollments.map(e => e.id);
          
          // Get attendance only for enrollments that belong to this student
          const attendanceQuery = supabase
            .from('attendance')
            .select('charged_amount')
            .in('enrollment_id', enrollmentIds);
          
          if (startDate && endDate) {
            attendanceQuery.gte('date', startDate).lte('date', endDate);
          }

          const { data: attendance, error: attendanceError } = await attendanceQuery;
          if (attendanceError) throw attendanceError;
          charges = attendance?.reduce((sum, a) => sum + (a.charged_amount || 0), 0) || 0;
        }
      }

      const totalPayments = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      // Balance = payments - charges + refunds (refunds increase balance for client)
      const balance = totalPayments - charges + refunds;

      return { balance, payments: totalPayments, charges, refunds };
    },
    enabled: !!studentId,
  });
}

export interface StudentAccountBalance {
  account_id: string | null;
  balance: number;
  payments: number;
  charges: number;
  refunds: number;
  unassigned_payments?: number;
}

export function useStudentAccountBalances(
  studentId: string,
  month?: number,
  year?: number,
  excludeActivityIds: string[] = [],
  foodTariffIds: string[] = []
) {
  return useQuery({
    queryKey: ['student_account_balances', studentId, month, year, excludeActivityIds, foodTariffIds],
    queryFn: async () => {
      let startDate: string | undefined;
      let endDate: string | undefined;

      if (month !== undefined && year !== undefined) {
        startDate = new Date(year, month, 1).toISOString().split('T')[0];
        endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
      }

      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select('id, activity_id, custom_price, discount_percent, account_id')
        .eq('student_id', studentId);

      if (enrollmentsError) throw enrollmentsError;

      const excludedSet = new Set(excludeActivityIds);
      const filteredEnrollments = (enrollments || []).filter((enrollment: any) => (
        !excludedSet.has(enrollment.activity_id)
      ));
      const enrollmentIds = filteredEnrollments.map((e: any) => e.id);
      const enrollmentActivityMap = new Map<string, string>();
      const enrollmentAccountMap = new Map<string, string | null>(); // enrollment_id -> account_id
      const enrollmentDataMap = new Map<string, { activity_id: string; custom_price: number | null; discount_percent: number | null; account_id: string | null }>();
      const activityIds = new Set<string>();
      filteredEnrollments.forEach((enrollment: any) => {
        enrollmentActivityMap.set(enrollment.id, enrollment.activity_id);
        enrollmentAccountMap.set(enrollment.id, enrollment.account_id);
        enrollmentDataMap.set(enrollment.id, {
          activity_id: enrollment.activity_id,
          custom_price: enrollment.custom_price ?? null,
          discount_percent: enrollment.discount_percent ?? null,
          account_id: enrollment.account_id ?? null,
        });
        activityIds.add(enrollment.activity_id);
      });

      let attendanceData: { enrollment_id: string; charged_amount: number | null }[] = [];
      if (enrollmentIds.length > 0) {
        const attendanceQuery = supabase
          .from('attendance')
          .select('enrollment_id, charged_amount')
          .in('enrollment_id', enrollmentIds);

        if (startDate && endDate) {
          attendanceQuery.gte('date', startDate).lte('date', endDate);
        }

        const { data: attendance, error: attendanceError } = await attendanceQuery;
        if (attendanceError) throw attendanceError;
        attendanceData = attendance || [];
      }

      const transactionsQuery = supabase
        .from('finance_transactions')
        .select('activity_id, type, amount, account_id')
        .eq('student_id', studentId)
        .not('student_id', 'is', null)
        .in('type', ['payment', 'income', 'expense', 'advance_payment']);

      if (startDate && endDate) {
        transactionsQuery.gte('date', startDate).lte('date', endDate);
      }

      const { data: transactions, error: transactionsError } = await transactionsQuery;
      if (transactionsError) throw transactionsError;

      const paymentsByActivity: Record<string, number> = {};
      const incomeByActivity: Record<string, number> = {};
      const expenseByActivity: Record<string, number> = {};
      
      // Для платежей без activity_id - группируем по account_id напрямую
      const paymentsByAccount: Map<string | null, number> = new Map();

      (transactions || []).forEach((trans: any) => {
        if (!trans.activity_id) {
          if (trans.type === 'payment' || trans.type === 'advance_payment') {
            // Для платежей без activity_id используем account_id из транзакции
            const accountId = trans.account_id || null;
            const current = paymentsByAccount.get(accountId) || 0;
            paymentsByAccount.set(accountId, current + (trans.amount || 0));
          }
          return;
        }
        if (trans.type === 'payment' || trans.type === 'advance_payment') {
          paymentsByActivity[trans.activity_id] = (paymentsByActivity[trans.activity_id] || 0) + (trans.amount || 0);
        } else if (trans.type === 'income') {
          incomeByActivity[trans.activity_id] = (incomeByActivity[trans.activity_id] || 0) + (trans.amount || 0);
        } else if (trans.type === 'expense') {
          expenseByActivity[trans.activity_id] = (expenseByActivity[trans.activity_id] || 0) + (trans.amount || 0);
        }
      });

      const attendanceByActivity: Record<string, number> = {};
      attendanceData.forEach((att) => {
        const activityId = enrollmentActivityMap.get(att.enrollment_id);
        if (!activityId) return;
        attendanceByActivity[activityId] = (attendanceByActivity[activityId] || 0) + (att.charged_amount || 0);
        activityIds.add(activityId);
      });

      const activityIdList = Array.from(activityIds);
      const activityAccountMap: Record<string, string | null> = {};
      const activityDataMap: Record<string, { billing_rules: any; default_price: number; balance_display_mode: string | null }> = {};
      if (activityIdList.length > 0) {
        const { data: activities, error: activitiesError } = await supabase
          .from('activities')
          .select('id, account_id, billing_rules, default_price, balance_display_mode')
          .in('id', activityIdList);

        if (activitiesError) throw activitiesError;
        (activities || []).forEach((activity: any) => {
          activityAccountMap[activity.id] = activity.account_id || null;
          activityDataMap[activity.id] = {
            billing_rules: activity.billing_rules || null,
            default_price: activity.default_price || 0,
            balance_display_mode: activity.balance_display_mode || null,
          };
        });
      }

      const foodTariffIdSet = new Set(foodTariffIds);

      const monthlyChargesByActivity: Record<string, number> = {};
      const displayModeByActivity: Record<string, 'subscription' | 'recalculation' | 'subscription_and_recalculation'> = {};
      enrollmentDataMap.forEach((enrollment) => {
        const activity = activityDataMap[enrollment.activity_id];
        if (!activity) return;
        const presentRule = activity.billing_rules?.present;
        const isMonthlyBilling = presentRule?.type === 'fixed' || presentRule?.type === 'subscription';
        const fallbackMode = isMonthlyBilling ? 'subscription' : 'recalculation';
        displayModeByActivity[enrollment.activity_id] =
          (activity.balance_display_mode as any) || fallbackMode;
        if (foodTariffIdSet.has(enrollment.activity_id)) return;
        if (!isMonthlyBilling) return;

        let baseMonthlyCharge = 0;
        if (enrollment.custom_price !== null && enrollment.custom_price > 0) {
          const discountMultiplier = 1 - ((enrollment.discount_percent || 0) / 100);
          baseMonthlyCharge = Math.round(enrollment.custom_price * discountMultiplier * 100) / 100;
        } else if (presentRule?.rate && presentRule.rate > 0) {
          baseMonthlyCharge = presentRule.rate;
        } else {
          baseMonthlyCharge = activity.default_price || 0;
        }

        monthlyChargesByActivity[enrollment.activity_id] =
          (monthlyChargesByActivity[enrollment.activity_id] || 0) + baseMonthlyCharge;
      });

      // Группируем по enrollments, чтобы использовать приоритет enrollment.account_id ?? activity.account_id
      const balancesByAccount = new Map<string | null, StudentAccountBalance>();
      
      // Создаем мапу enrollment_id -> activity_id для быстрого доступа
      const enrollmentToActivityMap = new Map<string, string>();
      filteredEnrollments.forEach((enrollment: any) => {
        enrollmentToActivityMap.set(enrollment.id, enrollment.activity_id);
      });
      
      // Группируем attendance по enrollment_id, затем по activity_id для распределения
      const attendanceByEnrollment = new Map<string, number>();
      attendanceData.forEach((att) => {
        const current = attendanceByEnrollment.get(att.enrollment_id) || 0;
        attendanceByEnrollment.set(att.enrollment_id, current + (att.charged_amount || 0));
      });
      
      // Для каждой активности распределяем баланс по enrollments с учетом их account_id
      activityIdList.forEach((activityId) => {
        const payments = paymentsByActivity[activityId] || 0;
        const income = incomeByActivity[activityId] || 0;
        const expense = expenseByActivity[activityId] || 0;
        const hasFinanceTransactions = income !== 0 || expense !== 0;
        const monthlyCharges = monthlyChargesByActivity[activityId] || 0;
        const attendanceTotal = attendanceByActivity[activityId] || 0;
        const recalculationCharges = hasFinanceTransactions ? income : attendanceTotal;
        const displayMode = displayModeByActivity[activityId]
          || (monthlyCharges > 0 ? 'subscription' : 'recalculation');

        let charges = recalculationCharges;
        if (displayMode === 'subscription') {
          charges = monthlyCharges;
        } else if (displayMode === 'subscription_and_recalculation') {
          charges = monthlyCharges + recalculationCharges;
        }
        const refunds = expense;
        const balance = payments - charges + refunds;
        
        // Находим все enrollments для этой активности
        const enrollmentsForActivity = Array.from(enrollmentDataMap.entries())
          .filter(([_, data]) => data.activity_id === activityId);
        
        if (enrollmentsForActivity.length === 0) {
          // Если нет enrollments, используем account_id из активности
          const accountId = activityAccountMap[activityId] ?? null;
          const existing = balancesByAccount.get(accountId) || {
            account_id: accountId,
            balance: 0,
            payments: 0,
            charges: 0,
            refunds: 0,
          };
          balancesByAccount.set(accountId, {
            account_id: accountId,
            balance: existing.balance + balance,
            payments: existing.payments + payments,
            charges: existing.charges + charges,
            refunds: existing.refunds + refunds,
          });
        } else {
          // Распределяем баланс пропорционально между enrollments
          // Для простоты распределяем равномерно (можно улучшить логику)
          const perEnrollment = enrollmentsForActivity.length;
          const perEnrollmentBalance = balance / perEnrollment;
          const perEnrollmentPayments = payments / perEnrollment;
          const perEnrollmentCharges = charges / perEnrollment;
          const perEnrollmentRefunds = refunds / perEnrollment;
          
          enrollmentsForActivity.forEach(([enrollmentId, enrollmentData]) => {
            // Приоритет: enrollment.account_id ?? activity.account_id
            const accountId = enrollmentData.account_id ?? activityAccountMap[enrollmentData.activity_id] ?? null;
            
            const existing = balancesByAccount.get(accountId) || {
              account_id: accountId,
              balance: 0,
              payments: 0,
              charges: 0,
              refunds: 0,
            };
            
            balancesByAccount.set(accountId, {
              account_id: accountId,
              balance: existing.balance + perEnrollmentBalance,
              payments: existing.payments + perEnrollmentPayments,
              charges: existing.charges + perEnrollmentCharges,
              refunds: existing.refunds + perEnrollmentRefunds,
            });
          });
        }
      });

      // Обрабатываем платежи без activity_id - распределяем по account_id
      paymentsByAccount.forEach((amount, accountId) => {
        const existing = balancesByAccount.get(accountId) || {
          account_id: accountId,
          balance: 0,
          payments: 0,
          charges: 0,
          refunds: 0,
        };
        balancesByAccount.set(accountId, {
          account_id: accountId,
          balance: existing.balance + amount,
          payments: existing.payments + amount,
          charges: existing.charges,
          refunds: existing.refunds,
          unassigned_payments: (existing.unassigned_payments || 0) + (accountId === null ? amount : 0),
        });
      });

      return Array.from(balancesByAccount.values());
    },
    enabled: !!studentId,
  });
}

// Delete payment transaction and rollback distribution
export function useDeletePaymentTransaction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ transactionId, reason }: { transactionId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('delete_payment_transaction', {
        p_transaction_id: transactionId,
        p_reason: reason,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      // Invalidate all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['advance_balances'] }),
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
        queryClient.invalidateQueries({ queryKey: ['student_account_balances'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
      ]);
      await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false });
    },
    onError: (error) => {
      console.error('Error deleting payment transaction:', error);
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// Get income transaction for activity and month (for subscription charges)
export function useActivityIncomeTransaction(
  studentId: string,
  activityId: string,
  month?: number,
  year?: number
) {
  return useQuery({
    queryKey: ['activity_income_transaction', studentId, activityId, month, year],
    queryFn: async () => {
      const now = new Date();
      const targetMonth = month !== undefined ? month : now.getMonth();
      const targetYear = year !== undefined ? year : now.getFullYear();
      
      const startDate = new Date(targetYear, targetMonth, 1).toISOString().split('T')[0];
      const endDate = new Date(targetYear, targetMonth + 1, 0).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('finance_transactions')
        .select('*')
        .eq('student_id', studentId)
        .eq('activity_id', activityId)
        .eq('type', 'income')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as FinanceTransaction | null;
    },
    enabled: !!studentId && !!activityId,
  });
}

// Delete income transaction (for subscription charges)
export function useDeleteIncomeTransaction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ transactionId, reason }: { transactionId: string; reason: string }) => {
      // Get transaction details before deletion for logging
      const { data: transaction, error: fetchError } = await supabase
        .from('finance_transactions')
        .select('*')
        .eq('id', transactionId)
        .eq('type', 'income')
        .single();
      
      if (fetchError) throw fetchError;
      if (!transaction) throw new Error('Transaction not found');
      
      // Delete the transaction
      const { error: deleteError } = await supabase
        .from('finance_transactions')
        .delete()
        .eq('id', transactionId);
      
      if (deleteError) throw deleteError;
      
      return transaction;
    },
    onSuccess: async () => {
      // Invalidate all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['activity_income_transaction'] }),
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
        queryClient.invalidateQueries({ queryKey: ['student_account_balances'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
      ]);
      await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false });
    },
    onError: (error) => {
      console.error('Error deleting income transaction:', error);
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
