import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type TransactionType = 'income' | 'expense' | 'payment' | 'salary' | 'household';

export interface FinanceTransaction {
  id: string;
  type: TransactionType;
  student_id: string | null;
  activity_id: string | null;
  staff_id: string | null;
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
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] });
      // Invalidate all dashboard queries (with year/month variations)
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false });
      // Invalidate student balance queries if transaction is for a student
      if (data.student_id) {
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] });
        queryClient.invalidateQueries({ queryKey: ['student_total_balance'] });
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
          .insert(insertData)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    },
    onSuccess: async () => {
      // Принудительно инвалидируем и перезапрашиваем все связанные запросы
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
      ]);
      // Принудительно перезапрашиваем активные запросы дашборда
      await queryClient.refetchQueries({ queryKey: ['dashboard'], exact: false, type: 'active' });
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

      // Get payments (income)
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
        .eq('type', 'payment');
      
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
