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
        queryClient.invalidateQueries({ queryKey: ['student_activity_monthly_balance'] });
        queryClient.invalidateQueries({ queryKey: ['student_total_balance'] });
        queryClient.invalidateQueries({ queryKey: ['student_account_balances'] });
        if (data.activity_id) {
          const transactionDate = new Date(data.date);
          const month = transactionDate.getMonth();
          const year = transactionDate.getFullYear();
          queryClient.invalidateQueries({ queryKey: ['activity_income_transaction', data.student_id, data.activity_id, month, year] });
        }
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
        queryClient.invalidateQueries({ queryKey: ['student_account_balances'] }),
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

      // Get payments
      // Strictly filter by student_id and activity_id - exclude null values
      const { data: payments, error: paymentsError } = await supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null) // Explicitly exclude null
        .eq('activity_id', activityId)
        .not('activity_id', 'is', null) // Explicitly exclude null
        .eq('type', 'payment')
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
        .eq('type', 'payment')
        .gte('date', startDate)
        .lte('date', endDate);

      if (paymentsError) throw paymentsError;

      const { data: incomeTransactions, error: incomeError } = await supabase
        .from('finance_transactions')
        .select('id, amount, date')
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
      
      // For subscription type: 
      // - If there's an income transaction, use its amount (actual charge)
      // - If no income transaction exists but baseMonthlyCharge > 0, use baseMonthlyCharge (for future months or pending charges)
      // - If no income transaction and baseMonthlyCharge = 0, charges = 0 (subscription was deleted/cancelled)
      const hasIncomeTransaction = incomeTransactions && incomeTransactions.length > 0;
      const charges = hasIncomeTransaction ? baseMonthlyCharge : (baseMonthlyCharge > 0 ? baseMonthlyCharge : 0);
      const balance = totalPayments - charges + refunds;

      return { balance, payments: totalPayments, charges, refunds };
    },
    enabled: !!studentId && !!activityId,
  });
}

// Calculate total balance for student across all activities
export function useStudentTotalBalance(studentId: string, month?: number, year?: number, cumulative: boolean = false) {
  return useQuery({
    queryKey: ['student_total_balance', studentId, month, year, cumulative],
    queryFn: async () => {
      // Only calculate date range if month and year are provided
      let startDate: string | undefined;
      let endDate: string | undefined;
      
      if (month !== undefined && year !== undefined) {
        if (cumulative) {
          // Для кумулятивного баланса: от начала до конца выбранного месяца
          startDate = undefined; // Начало всех времен
          endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
        } else {
          // Для месячного баланса: только выбранный месяц
          startDate = new Date(year, month, 1).toISOString().split('T')[0];
          endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
        }
      }

      // Get all payments (for selected month or all time)
      // Strictly filter by student_id - exclude null values
      const paymentsQuery = supabase
        .from('finance_transactions')
        .select('amount')
        .eq('student_id', studentId)
        .not('student_id', 'is', null) // Explicitly exclude null
        .eq('type', 'payment');
      
      if (endDate) {
        paymentsQuery.lte('date', endDate);
        if (startDate) {
          paymentsQuery.gte('date', startDate);
        }
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
      
      if (endDate) {
        incomeQuery.lte('date', endDate);
        if (startDate) {
          incomeQuery.gte('date', startDate);
        }
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
      
      if (endDate) {
        expenseQuery.lte('date', endDate);
        if (startDate) {
          expenseQuery.gte('date', startDate);
        }
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
          
          if (endDate) {
            attendanceQuery.lte('date', endDate);
            if (startDate) {
              attendanceQuery.gte('date', startDate);
            }
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
  previous_balance?: number; // Баланс на начало выбранного месяца
}

// Вспомогательная функция для расчета месячного баланса из уже загруженных данных
function calculateMonthlyBalanceFromData(
  filteredEnrollments: any[],
  transactions: any[],
  attendanceData: any[],
  enrollmentActivityMap: Map<string, string>,
  enrollmentAccountMap: Map<string, string | null>,
  enrollmentDataMap: Map<string, { activity_id: string; custom_price: number | null; discount_percent: number | null; account_id: string | null; is_active: boolean; unenrolled_at: string | null; enrolled_at: string | null }>,
  activityAccountMap: Record<string, string | null>,
  activityDataMap: Record<string, { billing_rules: any; default_price: number; balance_display_mode: string | null }>,
  foodTariffIdSet: Set<string>,
  month: number,
  year: number
): StudentAccountBalance[] {
  const enrollmentIds = filteredEnrollments.map((e: any) => e.id);
  const activityIds = new Set(filteredEnrollments.map((e: any) => e.activity_id));

  const paymentsByActivity: Record<string, number> = {};
  const incomeByActivity: Record<string, number> = {};
  const expenseByActivity: Record<string, number> = {};
  const paymentsByAccount: Map<string | null, number> = new Map();
  
  transactions.forEach((trans: any) => {
    if (!trans.activity_id) {
      if (trans.type === 'payment') {
        const accountId = trans.account_id || null;
        const current = paymentsByAccount.get(accountId) || 0;
        paymentsByAccount.set(accountId, current + (trans.amount || 0));
      }
      return;
    }
    if (!activityIds.has(trans.activity_id)) return;
    if (trans.type === 'payment') {
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
  });

  const activityIdList = Array.from(activityIds);
  const monthlyChargesByActivity: Record<string, number> = {};
  const displayModeByActivity: Record<string, 'subscription' | 'recalculation' | 'subscription_and_recalculation'> = {};
  const enrollmentIsActiveMap = new Map<string, boolean>();
  filteredEnrollments.forEach((enrollment: any) => {
    enrollmentIsActiveMap.set(enrollment.id, enrollment.is_active);
  });
  
  enrollmentDataMap.forEach((enrollment, enrollmentId) => {
    if (!filteredEnrollments.find((e: any) => e.id === enrollmentId)) return;
    const activity = activityDataMap[enrollment.activity_id];
    if (!activity) return;
    const presentRule = activity.billing_rules?.present;
    const isMonthlyBilling = presentRule?.type === 'fixed' || presentRule?.type === 'subscription';
    const fallbackMode = isMonthlyBilling ? 'subscription' : 'recalculation';
    displayModeByActivity[enrollment.activity_id] = (activity.balance_display_mode as any) || fallbackMode;
    if (foodTariffIdSet.has(enrollment.activity_id)) return;
    if (!isMonthlyBilling) return;
    const isActive = enrollmentIsActiveMap.get(enrollmentId) ?? true;
    if (!isActive) return;

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

  const balancesByAccount = new Map<string | null, StudentAccountBalance>();
  const enrollmentToActivityMap = new Map<string, string>();
  filteredEnrollments.forEach((enrollment: any) => {
    enrollmentToActivityMap.set(enrollment.id, enrollment.activity_id);
  });
  const attendanceByEnrollment = new Map<string, number>();
  attendanceData.forEach((att) => {
    const current = attendanceByEnrollment.get(att.enrollment_id) || 0;
    attendanceByEnrollment.set(att.enrollment_id, current + (att.charged_amount || 0));
  });
  
  activityIdList.forEach((activityId) => {
    const payments = paymentsByActivity[activityId] || 0;
    const income = incomeByActivity[activityId] || 0;
    const expense = expenseByActivity[activityId] || 0;
    const hasFinanceTransactions = income !== 0 || expense !== 0;
    const monthlyCharges = monthlyChargesByActivity[activityId] || 0;
    const attendanceTotal = attendanceByActivity[activityId] || 0;
    const recalculationCharges = hasFinanceTransactions ? income : attendanceTotal;
    const displayMode = displayModeByActivity[activityId] || (monthlyCharges > 0 ? 'subscription' : 'recalculation');

    const enrollmentsForActivity = Array.from(enrollmentDataMap.entries())
      .filter(([eId, data]) => data.activity_id === activityId && filteredEnrollments.find((e: any) => e.id === eId));
    
    let charges = recalculationCharges;
    if (displayMode === 'subscription') {
      const hasActiveEnrollments = enrollmentsForActivity.some(([eId, _]) => 
        enrollmentIsActiveMap.get(eId) ?? true
      );
      if (hasFinanceTransactions || hasActiveEnrollments) {
        charges = monthlyCharges;
      } else {
        charges = 0;
      }
    } else if (displayMode === 'subscription_and_recalculation') {
      charges = monthlyCharges + recalculationCharges;
    }
    const refunds = expense;
    const balance = payments - charges + refunds;
    
    if (enrollmentsForActivity.length === 0) {
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
      const perEnrollment = enrollmentsForActivity.length;
      const perEnrollmentBalance = balance / perEnrollment;
      const perEnrollmentPayments = payments / perEnrollment;
      const perEnrollmentCharges = charges / perEnrollment;
      const perEnrollmentRefunds = refunds / perEnrollment;
      
      enrollmentsForActivity.forEach(([enrollmentId, enrollmentData]) => {
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
}

// Вспомогательная функция для расчета месячного баланса (без React Query)
async function calculateMonthlyAccountBalances(
  studentId: string,
  month: number,
  year: number,
  excludeActivityIds: string[] = [],
  foodTariffIds: string[] = []
): Promise<StudentAccountBalance[]> {
  const startDate = new Date(year, month, 1).toISOString().split('T')[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

  const { data: enrollments, error: enrollmentsError } = await supabase
    .from('enrollments')
    .select('id, activity_id, custom_price, discount_percent, account_id, is_active, unenrolled_at')
    .eq('student_id', studentId);

  if (enrollmentsError) throw enrollmentsError;

  // Фильтруем enrollments для месячного баланса
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const isFutureMonth = year > currentYear || (year === currentYear && month > currentMonth);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  
  let filteredEnrollmentsByDate = (enrollments || []);
  if (isFutureMonth) {
    filteredEnrollmentsByDate = filteredEnrollmentsByDate.filter((e: any) => e.is_active === true);
  } else {
    const monthStart = new Date(year, month, 1);
    filteredEnrollmentsByDate = filteredEnrollmentsByDate.filter((e: any) => {
      if (e.is_active === true) return true;
      if (e.is_active === false && e.unenrolled_at) {
        const unenrolledDate = new Date(e.unenrolled_at);
        return unenrolledDate >= monthStart && unenrolledDate <= monthEnd;
      }
      return false;
    });
  }

  const excludedSet = new Set(excludeActivityIds);
  const filteredEnrollments = filteredEnrollmentsByDate.filter((enrollment: any) => (
    !excludedSet.has(enrollment.activity_id)
  ));
  const enrollmentIds = filteredEnrollments.map((e: any) => e.id);
  const enrollmentActivityMap = new Map<string, string>();
  const enrollmentAccountMap = new Map<string, string | null>();
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
    const { data: attendance, error: attendanceError } = await supabase
      .from('attendance')
      .select('enrollment_id, charged_amount')
      .in('enrollment_id', enrollmentIds)
      .gte('date', startDate)
      .lte('date', endDate);
    if (attendanceError) throw attendanceError;
    attendanceData = attendance || [];
  }

  const { data: transactions, error: transactionsError } = await supabase
    .from('finance_transactions')
    .select('activity_id, type, amount, account_id')
    .eq('student_id', studentId)
    .not('student_id', 'is', null)
    .in('type', ['payment', 'income', 'expense'])
    .gte('date', startDate)
    .lte('date', endDate);

  if (transactionsError) throw transactionsError;

  const paymentsByActivity: Record<string, number> = {};
  const incomeByActivity: Record<string, number> = {};
  const expenseByActivity: Record<string, number> = {};
  const paymentsByAccount: Map<string | null, number> = new Map();
  
  (transactions || []).forEach((trans: any) => {
    if (!trans.activity_id) {
      if (trans.type === 'payment') {
        const accountId = trans.account_id || null;
        const current = paymentsByAccount.get(accountId) || 0;
        paymentsByAccount.set(accountId, current + (trans.amount || 0));
      }
      return;
    }
    if (!activityIds.has(trans.activity_id)) return;
    if (trans.type === 'payment') {
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
  const enrollmentIsActiveMap = new Map<string, boolean>();
  filteredEnrollments.forEach((enrollment: any) => {
    enrollmentIsActiveMap.set(enrollment.id, enrollment.is_active);
  });
  
  enrollmentDataMap.forEach((enrollment, enrollmentId) => {
    const activity = activityDataMap[enrollment.activity_id];
    if (!activity) return;
    const presentRule = activity.billing_rules?.present;
    const isMonthlyBilling = presentRule?.type === 'fixed' || presentRule?.type === 'subscription';
    const fallbackMode = isMonthlyBilling ? 'subscription' : 'recalculation';
    displayModeByActivity[enrollment.activity_id] = (activity.balance_display_mode as any) || fallbackMode;
    if (foodTariffIdSet.has(enrollment.activity_id)) return;
    if (!isMonthlyBilling) return;
    const isActive = enrollmentIsActiveMap.get(enrollmentId) ?? true;
    if (!isActive) return;

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

  const balancesByAccount = new Map<string | null, StudentAccountBalance>();
  const enrollmentToActivityMap = new Map<string, string>();
  filteredEnrollments.forEach((enrollment: any) => {
    enrollmentToActivityMap.set(enrollment.id, enrollment.activity_id);
  });
  const attendanceByEnrollment = new Map<string, number>();
  attendanceData.forEach((att) => {
    const current = attendanceByEnrollment.get(att.enrollment_id) || 0;
    attendanceByEnrollment.set(att.enrollment_id, current + (att.charged_amount || 0));
  });
  
  activityIdList.forEach((activityId) => {
    const payments = paymentsByActivity[activityId] || 0;
    const income = incomeByActivity[activityId] || 0;
    const expense = expenseByActivity[activityId] || 0;
    const hasFinanceTransactions = income !== 0 || expense !== 0;
    const monthlyCharges = monthlyChargesByActivity[activityId] || 0;
    const attendanceTotal = attendanceByActivity[activityId] || 0;
    const recalculationCharges = hasFinanceTransactions ? income : attendanceTotal;
    const displayMode = displayModeByActivity[activityId] || (monthlyCharges > 0 ? 'subscription' : 'recalculation');

    const enrollmentsForActivity = Array.from(enrollmentDataMap.entries())
      .filter(([_, data]) => data.activity_id === activityId);
    
    let charges = recalculationCharges;
    if (displayMode === 'subscription') {
      const hasActiveEnrollments = enrollmentsForActivity.some(([eId, _]) => 
        enrollmentIsActiveMap.get(eId) ?? true
      );
      if (hasFinanceTransactions || hasActiveEnrollments) {
        charges = monthlyCharges;
      } else {
        charges = 0;
      }
    } else if (displayMode === 'subscription_and_recalculation') {
      charges = monthlyCharges + recalculationCharges;
    }
    const refunds = expense;
    const balance = payments - charges + refunds;
    
    if (enrollmentsForActivity.length === 0) {
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
      const perEnrollment = enrollmentsForActivity.length;
      const perEnrollmentBalance = balance / perEnrollment;
      const perEnrollmentPayments = payments / perEnrollment;
      const perEnrollmentCharges = charges / perEnrollment;
      const perEnrollmentRefunds = refunds / perEnrollment;
      
      enrollmentsForActivity.forEach(([enrollmentId, enrollmentData]) => {
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
}

export function useStudentAccountBalances(
  studentId: string,
  month?: number,
  year?: number,
  excludeActivityIds: string[] = [],
  foodTariffIds: string[] = [],
  cumulative: boolean = false // Если true, считает от начала до выбранного месяца включительно
) {
  return useQuery({
    queryKey: ['student_account_balances', studentId, month, year, excludeActivityIds, foodTariffIds, cumulative],
    queryFn: async () => {
      // Определяем диапазон дат
      let startDate: string | undefined;
      let endDate: string | undefined;
      let monthsToCalculate: Array<{ month: number; year: number }> = [];

      if (month !== undefined && year !== undefined) {
        if (cumulative) {
          // Для кумулятивного баланса: находим самую раннюю дату enrollment
          const { data: allEnrollments, error: allEnrollmentsError } = await supabase
            .from('enrollments')
            .select('enrolled_at')
            .eq('student_id', studentId)
            .not('enrolled_at', 'is', null)
            .order('enrolled_at', { ascending: true })
            .limit(1);
          
          if (allEnrollmentsError) throw allEnrollmentsError;
          
          if (allEnrollments && allEnrollments.length > 0 && allEnrollments[0].enrolled_at) {
            const earliestEnrollment = new Date(allEnrollments[0].enrolled_at);
            const startYear = earliestEnrollment.getFullYear();
            const startMonth = earliestEnrollment.getMonth();
            const endYear = year;
            const endMonth = month;
            
            // Формируем список месяцев для расчета
            for (let y = startYear; y <= endYear; y++) {
              const monthStart = y === startYear ? startMonth : 0;
              const monthEnd = y === endYear ? endMonth : 11;
              for (let m = monthStart; m <= monthEnd; m++) {
                monthsToCalculate.push({ month: m, year: y });
              }
            }
            
            startDate = new Date(startYear, startMonth, 1).toISOString().split('T')[0];
            endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
          } else {
            // Если нет enrollments, возвращаем пустой массив
            return [];
          }
        } else {
          // Для месячного баланса: только выбранный месяц
          monthsToCalculate.push({ month, year });
          startDate = new Date(year, month, 1).toISOString().split('T')[0];
          endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
        }
      } else {
        // Если месяц не указан, возвращаем пустой массив
        return [];
      }

      // Загружаем все данные одним запросом
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select('id, activity_id, custom_price, discount_percent, account_id, is_active, unenrolled_at, enrolled_at')
        .eq('student_id', studentId);

      if (enrollmentsError) throw enrollmentsError;

      const excludedSet = new Set(excludeActivityIds);
      const allFilteredEnrollments = (enrollments || []).filter((enrollment: any) => (
        !excludedSet.has(enrollment.activity_id)
      ));

      const enrollmentIds = allFilteredEnrollments.map((e: any) => e.id);
      
      // Загружаем все транзакции за период
      const { data: transactions, error: transactionsError } = await supabase
        .from('finance_transactions')
        .select('activity_id, type, amount, account_id, date')
        .eq('student_id', studentId)
        .not('student_id', 'is', null)
        .in('type', ['payment', 'income', 'expense'])
        .gte('date', startDate!)
        .lte('date', endDate!);

      if (transactionsError) throw transactionsError;

      // Загружаем все attendance за период
      let attendanceData: { enrollment_id: string; charged_amount: number | null; date: string }[] = [];
      if (enrollmentIds.length > 0) {
        const { data: attendance, error: attendanceError } = await supabase
          .from('attendance')
          .select('enrollment_id, charged_amount, date')
          .in('enrollment_id', enrollmentIds)
          .gte('date', startDate!)
          .lte('date', endDate!);
        if (attendanceError) throw attendanceError;
        attendanceData = attendance || [];
      }

      // Загружаем все активности
      const activityIds = new Set(allFilteredEnrollments.map((e: any) => e.activity_id));
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

      // Группируем транзакции и attendance по месяцам
      const transactionsByMonth = new Map<string, typeof transactions>();
      const attendanceByMonth = new Map<string, typeof attendanceData>();
      
      (transactions || []).forEach((trans: any) => {
        const transDate = new Date(trans.date);
        const monthKey = `${transDate.getFullYear()}-${transDate.getMonth()}`;
        if (!transactionsByMonth.has(monthKey)) {
          transactionsByMonth.set(monthKey, []);
        }
        transactionsByMonth.get(monthKey)!.push(trans);
      });

      attendanceData.forEach((att) => {
        const attDate = new Date(att.date);
        const monthKey = `${attDate.getFullYear()}-${attDate.getMonth()}`;
        if (!attendanceByMonth.has(monthKey)) {
          attendanceByMonth.set(monthKey, []);
        }
        attendanceByMonth.get(monthKey)!.push(att);
      });

      // Создаем мапы для быстрого доступа
      const enrollmentActivityMap = new Map<string, string>();
      const enrollmentAccountMap = new Map<string, string | null>();
      const enrollmentDataMap = new Map<string, { activity_id: string; custom_price: number | null; discount_percent: number | null; account_id: string | null; is_active: boolean; unenrolled_at: string | null; enrolled_at: string | null }>();
      allFilteredEnrollments.forEach((enrollment: any) => {
        enrollmentActivityMap.set(enrollment.id, enrollment.activity_id);
        enrollmentAccountMap.set(enrollment.id, enrollment.account_id);
        enrollmentDataMap.set(enrollment.id, {
          activity_id: enrollment.activity_id,
          custom_price: enrollment.custom_price ?? null,
          discount_percent: enrollment.discount_percent ?? null,
          account_id: enrollment.account_id ?? null,
          is_active: enrollment.is_active ?? true,
          unenrolled_at: enrollment.unenrolled_at ?? null,
          enrolled_at: enrollment.enrolled_at ?? null,
        });
      });

      const foodTariffIdSet = new Set(foodTariffIds);
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Рассчитываем месячные балансы для каждого месяца
      const monthlyBalancesMap = new Map<string, StudentAccountBalance[]>();
      
      for (const { month: m, year: y } of monthsToCalculate) {
        const monthKey = `${y}-${m}`;
        const monthStart = new Date(y, m, 1);
        const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
        const isFutureMonth = y > currentYear || (y === currentYear && m > currentMonth);

        // Фильтруем enrollments для этого месяца
        let filteredEnrollments = allFilteredEnrollments.filter((e: any) => {
          if (isFutureMonth) {
            return e.is_active === true;
          } else {
            if (e.is_active === true) return true;
            if (e.is_active === false && e.unenrolled_at) {
              const unenrolledDate = new Date(e.unenrolled_at);
              return unenrolledDate >= monthStart && unenrolledDate <= monthEnd;
            }
            return false;
          }
        });

        // Получаем транзакции и attendance для этого месяца
        const monthTransactions = transactionsByMonth.get(monthKey) || [];
        const monthAttendance = attendanceByMonth.get(monthKey) || [];

        // Рассчитываем месячный баланс
        const monthlyBalances = calculateMonthlyBalanceFromData(
          filteredEnrollments,
          monthTransactions,
          monthAttendance,
          enrollmentActivityMap,
          enrollmentAccountMap,
          enrollmentDataMap,
          activityAccountMap,
          activityDataMap,
          foodTariffIdSet,
          m,
          y
        );

        monthlyBalancesMap.set(monthKey, monthlyBalances);
      }

      // Для месячного баланса: возвращаем баланс за выбранный месяц + добавляем прошлый баланс
      if (!cumulative && month !== undefined && year !== undefined) {
        const monthKey = `${year}-${month}`;
        const monthlyBalances = monthlyBalancesMap.get(monthKey) || [];
        
        // Рассчитываем баланс на начало месяца (до выбранного месяца)
        const previousBalancesMap = new Map<string | null, number>();
        
        // Находим самую раннюю дату enrollment
        const { data: allEnrollmentsForPrevious, error: allEnrollmentsForPreviousError } = await supabase
          .from('enrollments')
          .select('enrolled_at')
          .eq('student_id', studentId)
          .not('enrolled_at', 'is', null)
          .order('enrolled_at', { ascending: true })
          .limit(1);
        
        if (!allEnrollmentsForPreviousError && allEnrollmentsForPrevious && allEnrollmentsForPrevious.length > 0) {
          const earliestEnrollment = new Date(allEnrollmentsForPrevious[0].enrolled_at);
          const startYear = earliestEnrollment.getFullYear();
          const startMonth = earliestEnrollment.getMonth();
          
          // Рассчитываем баланс до начала выбранного месяца
          const previousMonthEnd = new Date(year, month, 0, 23, 59, 59, 999);
          const previousStartDate = new Date(startYear, startMonth, 1).toISOString().split('T')[0];
          const previousEndDate = previousMonthEnd.toISOString().split('T')[0];
          
          // Формируем список месяцев до выбранного месяца
          const previousMonthsToCalculate: Array<{ month: number; year: number }> = [];
          for (let y = startYear; y <= year; y++) {
            const monthStart = y === startYear ? startMonth : 0;
            const monthEnd = y === year ? month - 1 : 11;
            for (let m = monthStart; m <= monthEnd; m++) {
              previousMonthsToCalculate.push({ month: m, year: y });
            }
          }
          
          if (previousMonthsToCalculate.length > 0) {
            // Загружаем транзакции до начала месяца
            const { data: previousTransactions, error: previousTransactionsError } = await supabase
              .from('finance_transactions')
              .select('activity_id, type, amount, account_id, date')
              .eq('student_id', studentId)
              .not('student_id', 'is', null)
              .in('type', ['payment', 'income', 'expense'])
              .gte('date', previousStartDate)
              .lte('date', previousEndDate);
            
            if (!previousTransactionsError && previousTransactions) {
              // Загружаем attendance до начала месяца
              let previousAttendanceData: { enrollment_id: string; charged_amount: number | null; date: string }[] = [];
              if (enrollmentIds.length > 0) {
                const { data: previousAttendance, error: previousAttendanceError } = await supabase
                  .from('attendance')
                  .select('enrollment_id, charged_amount, date')
                  .in('enrollment_id', enrollmentIds)
                  .gte('date', previousStartDate)
                  .lte('date', previousEndDate);
                if (!previousAttendanceError && previousAttendance) {
                  previousAttendanceData = previousAttendance;
                }
              }
              
              // Группируем транзакции и attendance по месяцам
              const previousTransactionsByMonth = new Map<string, typeof previousTransactions>();
              const previousAttendanceByMonth = new Map<string, typeof previousAttendanceData>();
              
              previousTransactions.forEach((trans: any) => {
                const transDate = new Date(trans.date);
                const monthKey = `${transDate.getFullYear()}-${transDate.getMonth()}`;
                if (!previousTransactionsByMonth.has(monthKey)) {
                  previousTransactionsByMonth.set(monthKey, []);
                }
                previousTransactionsByMonth.get(monthKey)!.push(trans);
              });
              
              previousAttendanceData.forEach((att) => {
                const attDate = new Date(att.date);
                const monthKey = `${attDate.getFullYear()}-${attDate.getMonth()}`;
                if (!previousAttendanceByMonth.has(monthKey)) {
                  previousAttendanceByMonth.set(monthKey, []);
                }
                previousAttendanceByMonth.get(monthKey)!.push(att);
              });
              
              // Рассчитываем балансы для каждого месяца до выбранного
              const previousMonthlyBalancesMap = new Map<string, StudentAccountBalance[]>();
              
              for (const { month: m, year: y } of previousMonthsToCalculate) {
                const monthKey = `${y}-${m}`;
                const monthStart = new Date(y, m, 1);
                const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
                const isFutureMonth = y > currentYear || (y === currentYear && m > currentMonth);
                
                // Фильтруем enrollments для этого месяца
                let filteredEnrollmentsForPrevious = allFilteredEnrollments.filter((e: any) => {
                  if (isFutureMonth) {
                    return e.is_active === true;
                  } else {
                    if (e.is_active === true) return true;
                    if (e.is_active === false && e.unenrolled_at) {
                      const unenrolledDate = new Date(e.unenrolled_at);
                      return unenrolledDate >= monthStart && unenrolledDate <= monthEnd;
                    }
                    return false;
                  }
                });
                
                // Получаем транзакции и attendance для этого месяца
                const monthTransactions = previousTransactionsByMonth.get(monthKey) || [];
                const monthAttendance = previousAttendanceByMonth.get(monthKey) || [];
                
                // Рассчитываем месячный баланс
                const monthlyBalances = calculateMonthlyBalanceFromData(
                  filteredEnrollmentsForPrevious,
                  monthTransactions,
                  monthAttendance,
                  enrollmentActivityMap,
                  enrollmentAccountMap,
                  enrollmentDataMap,
                  activityAccountMap,
                  activityDataMap,
                  foodTariffIdSet,
                  m,
                  y
                );
                
                previousMonthlyBalancesMap.set(monthKey, monthlyBalances);
              }
              
              // Суммируем все месячные балансы до выбранного месяца
              for (const balances of previousMonthlyBalancesMap.values()) {
                balances.forEach((balance) => {
                  const current = previousBalancesMap.get(balance.account_id) || 0;
                  previousBalancesMap.set(balance.account_id, current + balance.balance);
                });
              }
            }
          }
        }
        
        // Добавляем previous_balance к каждому балансу
        return monthlyBalances.map((balance) => ({
          ...balance,
          previous_balance: previousBalancesMap.get(balance.account_id) || 0,
        }));
      }

      // Для кумулятивного баланса: суммируем все месячные балансы
      const cumulativeBalances = new Map<string | null, StudentAccountBalance>();
      for (const balances of monthlyBalancesMap.values()) {
        balances.forEach((balance) => {
          const existing = cumulativeBalances.get(balance.account_id);
          if (existing) {
            existing.balance += balance.balance;
            existing.payments += balance.payments;
            existing.charges += balance.charges;
            existing.refunds += balance.refunds;
            existing.unassigned_payments = (existing.unassigned_payments || 0) + (balance.unassigned_payments || 0);
          } else {
            cumulativeBalances.set(balance.account_id, { ...balance });
          }
        });
      }

      return Array.from(cumulativeBalances.values());
    },
    enabled: !!studentId,
  });
}

// Delete payment transaction and rollback distribution
export function useDeletePaymentTransaction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ transactionId, reason }: { transactionId: string; reason: string }) => {
      console.log('[useDeletePaymentTransaction] Calling delete_payment_transaction', {
        transactionId,
        transactionIdType: typeof transactionId,
        transactionIdLength: transactionId?.length,
        reason: reason.substring(0, 50) + '...',
      });
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(transactionId)) {
        const error = new Error(`Invalid transaction ID format: ${transactionId}`);
        console.error('[useDeletePaymentTransaction] Validation error:', error);
        throw error;
      }
      
      if (!reason || !reason.trim()) {
        const error = new Error('Reason is required');
        console.error('[useDeletePaymentTransaction] Validation error:', error);
        throw error;
      }
      
      try {
        const { data, error } = await supabase.rpc('delete_payment_transaction', {
          p_transaction_id: transactionId,
          p_reason: reason.trim(),
        });
        
        if (error) {
          console.error('[useDeletePaymentTransaction] RPC error:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
            error,
          });
          throw error;
        }
        
        console.log('[useDeletePaymentTransaction] Success:', data);
        return data;
      } catch (err: any) {
        console.error('[useDeletePaymentTransaction] Exception:', {
          message: err?.message,
          details: err?.details,
          hint: err?.hint,
          code: err?.code,
          stack: err?.stack,
          err,
        });
        throw err;
      }
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
      
      // First, try to find transaction for the specific month
      let { data, error } = await supabase
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
      
      if (error) {
        console.error('[useActivityIncomeTransaction] Error:', error);
        throw error;
      }
      
      // If not found for the specific month, try to find ANY income transaction for this activity
      // This handles cases where the transaction exists but might be in a different month
      // or the activity/enrollment is archived but transaction still exists and is shown in balance
      // We search without date restrictions to find archived transactions that are still in balance calculations
      if (!data) {
        // Debug: Check if this is for "Прескул" activity
        const { data: activityData } = await supabase
          .from('activities')
          .select('name')
          .eq('id', activityId)
          .maybeSingle();
        
        const isPreskul = activityData?.name === 'Прескул';
        
        if (isPreskul) {
          console.log('[useActivityIncomeTransaction] Прескул: Transaction not found for month, searching any transaction...', {
            studentId,
            activityId,
            startDate,
            endDate,
          });
        }
        
        const { data: anyTransaction, error: anyError } = await supabase
          .from('finance_transactions')
          .select('*')
          .eq('student_id', studentId)
          .eq('activity_id', activityId)
          .eq('type', 'income')
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (anyError) {
          console.error('[useActivityIncomeTransaction] Error searching any transaction:', anyError);
          if (isPreskul) {
            console.error('[useActivityIncomeTransaction] Прескул: Error details:', anyError);
          }
          // Don't throw, just return null
        } else if (anyTransaction) {
          if (isPreskul) {
            console.log('[useActivityIncomeTransaction] Прескул: Found transaction (any month):', {
              id: anyTransaction.id,
              date: anyTransaction.date,
              amount: anyTransaction.amount,
            });
          }
          // Use any found transaction - if it's shown in balance, we should be able to delete it
          // This is especially important for archived enrollments where transactions might be from different months
          data = anyTransaction;
        } else {
          if (isPreskul) {
            console.log('[useActivityIncomeTransaction] Прескул: No transaction found at all for this activity');
            
            // Debug: Check if there are ANY transactions for this student and activity
            const { data: allTransactions, error: allError } = await supabase
              .from('finance_transactions')
              .select('id, type, date, amount, student_id, activity_id')
              .eq('student_id', studentId)
              .eq('activity_id', activityId);
            
            if (allError) {
              console.error('[useActivityIncomeTransaction] Прескул: Error checking all transactions:', allError);
            } else {
              console.log('[useActivityIncomeTransaction] Прескул: All transactions for this activity:', allTransactions);
              
              // If we found income transactions but not in the first query, use the first one
              const incomeTransactions = allTransactions?.filter(t => t.type === 'income') || [];
              if (incomeTransactions.length > 0) {
                console.log('[useActivityIncomeTransaction] Прескул: Found income transactions in all transactions, using first:', incomeTransactions[0]);
                // Fetch full transaction data
                const { data: fullTransaction } = await supabase
                  .from('finance_transactions')
                  .select('*')
                  .eq('id', incomeTransactions[0].id)
                  .single();
                
                if (fullTransaction) {
                  data = fullTransaction;
                }
              }
            }
          }
        }
      }
      
      return data as FinanceTransaction | null;
    },
    enabled: !!studentId && !!activityId && month !== undefined && year !== undefined,
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
    onSuccess: async (transaction) => {
      // Invalidate all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['activity_income_transaction'] }),
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
        queryClient.invalidateQueries({ queryKey: ['student_activity_monthly_balance'] }),
        queryClient.invalidateQueries({ queryKey: ['student_account_balances'] }),
        queryClient.invalidateQueries({ queryKey: ['student_total_balance'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
      ]);
      
      // Refetch queries for the specific student and activity if we have transaction data
      if (transaction?.student_id && transaction?.activity_id) {
        // Get month and year from transaction date
        const transactionDate = new Date(transaction.date);
        const month = transactionDate.getMonth();
        const year = transactionDate.getFullYear();
        
        await Promise.all([
          queryClient.refetchQueries({ 
            queryKey: ['student_activity_balance', transaction.student_id, transaction.activity_id, month, year] 
          }),
          queryClient.refetchQueries({ 
            queryKey: ['student_activity_monthly_balance'], 
            predicate: (query) => {
              const key = query.queryKey;
              return key[1] === transaction.student_id && key[2] === transaction.activity_id;
            }
          }),
          queryClient.refetchQueries({ 
            queryKey: ['student_account_balances', transaction.student_id, month, year] 
          }),
        ]);
      }
      
      await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false });
    },
    onError: (error) => {
      console.error('Error deleting income transaction:', error);
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}
