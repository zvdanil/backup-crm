import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  getMonthStartDate,
  getMonthEndDate,
  formatLocalDate,
} from "@/lib/attendance";
import {
  getGardenAttendanceConfig,
  isGardenAttendanceController,
} from "@/lib/gardenAttendance";
import {
  computePaymentAllocationFromEntries,
  type DebtEntry,
  type PaymentEntry,
  type PaymentAllocationResult,
} from "@/lib/paymentAllocation";
import {
  getEnrollmentPriceForDate,
  getEnrollmentAccountForDate,
  enrollmentHistoryCoversMonth,
  enrollmentInScopeForMonth,
  calculateAttendanceChargeForRecalc,
  type EnrollmentPriceHistory,
  type EnrollmentAccountHistory,
} from "./useEnrollments";
import { type ActivityPriceHistory } from "./useActivities";
import {
  createPayrollPayoutWithDerivedTransaction,
  deletePayrollPayoutWithDerivedTransaction,
  updatePayrollPayoutWithDerivedTransaction,
} from "@/lib/payrollPayoutWrite";

import { fetchAllRows } from '@/lib/supabasePagination';

const supabaseAny = supabase as any;

export type TransactionType =
  | "income"
  | "expense"
  | "payment"
  | "salary"
  | "household"
  | "cash_in";

export interface FinanceTransaction {
  id: string;
  type: TransactionType;
  student_id: string | null;
  activity_id: string | null;
  attendance_id?: string | null;
  /** For payment: optional activity IDs to allocate to, in priority order. Null = auto-distribute. */
  allocation_activity_ids?: string[] | null;
  staff_id: string | null;
  expense_category_id?: string | null;
  account_id: string | null; // Payment account for this transaction
  amount: number;
  expense_advance_type?: "issue" | "spend" | null;
  real_amount?: number | null;
  advance_consumed_amount?: number | null;
  date: string;
  description: string | null;
  category: string | null;
  dividend_payout_id?: string | null;
  cash_withdrawal_id?: string | null;
  salary_transaction_id?: string | null; // Commission links to parent salary tx
  staff_payout_id?: string | null; // Salary tx from staff payout form
  created_at: string;
  updated_at: string;
}

export type FinanceTransactionInsert = Omit<
  FinanceTransaction,
  "id" | "created_at" | "updated_at"
>;
export type FinanceTransactionUpdate = Partial<FinanceTransactionInsert>;

const ATTENDANCE_V1_INFO_INCOME_PREFIX = "Нарахування за відвідування";

function isAttendanceV1InfoIncome(
  transaction: { description?: string | null; activity_id?: string | null },
  baseTariffIdSet: Set<string>,
) {
  if (!transaction?.activity_id) return false;
  if (!baseTariffIdSet.has(transaction.activity_id)) return false;
  return (transaction.description ?? "").startsWith(
    ATTENDANCE_V1_INFO_INCOME_PREFIX,
  );
}

async function fetchAttendanceV1BaseTariffIds() {
  const { data, error } = await supabase
    .from("activities")
    .select("id, config");

  if (error) throw error;

  const baseTariffIdSet = new Set<string>();

  (data || []).forEach((activity: any) => {
    if (!isGardenAttendanceController(activity)) return;
    const config = getGardenAttendanceConfig(activity);
    (config.base_tariff_ids || []).forEach((id) => baseTariffIdSet.add(id));
  });

  return baseTariffIdSet;
}

/** Base + food tariff IDs from controller config (for allocation — charges for these even without direct enrollment) */
async function fetchGardenTariffActivityIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("activities")
    .select("id, config");

  if (error) throw error;

  const ids = new Set<string>();
  (data || []).forEach((activity: any) => {
    if (!isGardenAttendanceController(activity)) return;
    const config = getGardenAttendanceConfig(activity);
    (config.base_tariff_ids || []).forEach((id: string) => ids.add(id));
    (config.food_tariff_ids || []).forEach((id: string) => ids.add(id));
  });
  return ids;
}

export function useFinanceTransactions(filters?: {
  studentId?: string;
  activityId?: string;
  month?: number;
  year?: number;
  type?: TransactionType;
  enabled?: boolean;
}) {
  const { enabled = true, ...queryFilters } = filters || {};
  return useQuery({
    queryKey: ["finance_transactions", queryFilters],
    queryFn: async () => {
      let baseQuery = supabaseAny
        .from("finance_transactions")
        .select("*")
        .order("date", { ascending: false });

      if (queryFilters.studentId) {
        baseQuery = baseQuery.eq("student_id", queryFilters.studentId);
      }
      if (queryFilters.activityId) {
        baseQuery = baseQuery.eq("activity_id", queryFilters.activityId);
      }
      if (queryFilters.type) {
        baseQuery = baseQuery.eq("type", queryFilters.type);
      }
      if (
        queryFilters.month !== undefined &&
        queryFilters.year !== undefined
      ) {
        const startDate = getMonthStartDate(queryFilters.year, queryFilters.month);
        const endDate = getMonthEndDate(queryFilters.year, queryFilters.month);
        baseQuery = baseQuery.gte("date", startDate).lte("date", endDate);
      }

      const data = await fetchAllRows<FinanceTransaction>((from, to) =>
        baseQuery.range(from, to)
      );
      return data;
    },
    enabled,
  });
}

export function useCreateFinanceTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transaction: FinanceTransactionInsert) => {
      if (transaction.type === "salary" && transaction.staff_id) {
        const { transaction: createdSalaryTx } =
          await createPayrollPayoutWithDerivedTransaction({
            staffId: transaction.staff_id,
            amount: transaction.amount,
            payoutDate: transaction.date,
            notes: transaction.description || null,
            accountId: transaction.account_id || null,
            financeTransaction: {
              activityId: transaction.activity_id || null,
              expenseCategoryId: transaction.expense_category_id || null,
              description: transaction.description || null,
              category: transaction.category || null,
              dividendPayoutId: transaction.dividend_payout_id || null,
              allocationActivityIds: transaction.allocation_activity_ids || null,
            },
          });
        return createdSalaryTx as FinanceTransaction;
      }

      const { data, error } = await supabaseAny
        .from("finance_transactions")
        .insert(transaction)
        .select()
        .single();

      if (error) throw error;

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["finance_transactions"] });
      // Invalidate all dashboard queries (with year/month variations)
      queryClient.invalidateQueries({ queryKey: ["dashboard"], exact: false });
      // Invalidate student balance queries if transaction is for a student
      if (data.student_id) {
        queryClient.invalidateQueries({
          queryKey: ["student_activity_balance"],
        });
        queryClient.invalidateQueries({
          queryKey: ["student_activity_monthly_balance"],
        });
        queryClient.invalidateQueries({ queryKey: ["student_total_balance"] });
        queryClient.invalidateQueries({
          queryKey: ["student_account_balances"],
        });
        queryClient.invalidateQueries({ queryKey: ["payment_allocation"] });
        if (data.activity_id) {
          const transactionDate = new Date(data.date);
          const month = transactionDate.getMonth();
          const year = transactionDate.getFullYear();
          queryClient.invalidateQueries({
            queryKey: [
              "activity_income_transaction",
              data.student_id,
              data.activity_id,
              month,
              year,
            ],
          });
        }
      }
      if (data.staff_id && data.type === "salary") {
        queryClient.invalidateQueries({
          queryKey: ["staff-payouts", data.staff_id],
          exact: false,
        });
        queryClient.invalidateQueries({
          queryKey: ["staff-payouts-all"],
          exact: false,
        });
      }
      toast({ title: "Транзакцію створено" });
    },
    onError: (error) => {
      toast({
        title: "Помилка",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateFinanceTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...transaction
    }: { id: string } & FinanceTransactionUpdate) => {
      // Получаем текущую транзакцию для проверки типа
      const { data: currentTx, error: fetchError } = await supabaseAny
        .from("finance_transactions")
        .select(
          "type, staff_id, date, amount, staff_payout_id, activity_id, expense_category_id, account_id, description, category, dividend_payout_id, allocation_activity_ids",
        )
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      if (currentTx?.type === "salary" && currentTx?.staff_id) {
        // Preferred unified path: update canonical payout by direct link
        if (currentTx.staff_payout_id) {
          const { transaction: updatedSalaryTx } =
            await updatePayrollPayoutWithDerivedTransaction({
              payoutId: currentTx.staff_payout_id,
              payout: {
                staffId: transaction.staff_id ?? currentTx.staff_id,
                amount: transaction.amount ?? currentTx.amount,
                payoutDate: transaction.date ?? currentTx.date,
                notes:
                  transaction.description !== undefined
                    ? transaction.description
                    : currentTx.description,
                accountId:
                  transaction.account_id !== undefined
                    ? transaction.account_id
                    : currentTx.account_id,
                dividendPayoutId:
                  transaction.dividend_payout_id !== undefined
                    ? transaction.dividend_payout_id
                    : currentTx.dividend_payout_id,
              },
              financeTransaction: {
                activityId:
                  transaction.activity_id !== undefined
                    ? transaction.activity_id
                    : currentTx.activity_id,
                expenseCategoryId:
                  transaction.expense_category_id !== undefined
                    ? transaction.expense_category_id
                    : currentTx.expense_category_id,
                description:
                  transaction.description !== undefined
                    ? transaction.description
                    : currentTx.description,
                category:
                  transaction.category !== undefined
                    ? transaction.category
                    : currentTx.category,
                dividendPayoutId:
                  transaction.dividend_payout_id !== undefined
                    ? transaction.dividend_payout_id
                    : currentTx.dividend_payout_id,
                allocationActivityIds:
                  transaction.allocation_activity_ids !== undefined
                    ? transaction.allocation_activity_ids
                    : currentTx.allocation_activity_ids,
              },
            });
          return updatedSalaryTx as FinanceTransaction;
        }
      }

      const { data, error } = await supabaseAny
        .from("finance_transactions")
        .update(transaction)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Если это транзакция типа 'salary', синхронизируем с staff_payouts
      if (currentTx?.type === "salary" && currentTx?.staff_id) {
        // Находим соответствующую выплату по staff_id, date и amount
        const { data: payouts, error: payoutFetchError } = await supabaseAny
          .from("staff_payouts" as any)
          .select("id")
          .eq("staff_id", currentTx.staff_id)
          .eq("payout_date", currentTx.date)
          .eq("amount", currentTx.amount)
          .or("is_deleted.is.null,is_deleted.eq.false")
          .limit(1);

        if (!payoutFetchError && payouts && payouts.length > 0) {
          // Обновляем выплату
          const { error: payoutUpdateError } = await supabaseAny
            .from("staff_payouts" as any)
            .update({
              staff_id: transaction.staff_id || currentTx.staff_id,
              amount: transaction.amount || currentTx.amount,
              payout_date: transaction.date || currentTx.date,
              notes: transaction.description || null,
              account_id: transaction.account_id || null,
            })
            .eq("id", payouts[0].id);

          if (payoutUpdateError) throw payoutUpdateError;
        }
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["finance_transactions"] });
      if (data.student_id && data.type === "payment") {
        queryClient.invalidateQueries({ queryKey: ["payment_allocation"] });
      }
      if (data.staff_id && data.type === "salary") {
        queryClient.invalidateQueries({
          queryKey: ["staff-payouts", data.staff_id],
          exact: false,
        });
        queryClient.invalidateQueries({
          queryKey: ["staff-payouts-all"],
          exact: false,
        });
      }
      toast({ title: "Транзакцію оновлено" });
    },
    onError: (error) => {
      toast({
        title: "Помилка",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteFinanceTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Получаем транзакцию перед удалением для проверки типа
      const { data: tx, error: fetchError } = await supabaseAny
        .from("finance_transactions")
        .select("id, type, staff_id, date, amount, staff_payout_id, cash_withdrawal_id")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      if (tx?.type === "salary" && tx?.staff_payout_id) {
        await deletePayrollPayoutWithDerivedTransaction({
          payoutId: tx.staff_payout_id,
          deleteNote: "Видалено через журнал транзакцій",
        });
        return;
      }

      // Якщо транзакція пов'язана з виведенням коштів — видаляємо payment-транзакцію на касовому рахунку
      if (tx?.cash_withdrawal_id) {
        const { data: withdrawal } = await supabaseAny
          .from("cash_withdrawals")
          .select("income_transaction_id")
          .eq("id", tx.cash_withdrawal_id)
          .single();

        if (withdrawal?.income_transaction_id) {
          await supabaseAny
            .from("finance_transactions")
            .delete()
            .eq("id", withdrawal.income_transaction_id);
        }
      }

      const { error } = await supabaseAny
        .from("finance_transactions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Если это транзакция типа 'salary', удаляем соответствующую выплату
      if (tx?.type === "salary" && tx?.staff_id) {
        const { error: payoutDeleteError } = await supabaseAny
          .from("staff_payouts" as any)
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_note: "Видалено через журнал транзакцій",
          })
          .eq("staff_id", tx.staff_id)
          .eq("payout_date", tx.date)
          .eq("amount", tx.amount)
          .or("is_deleted.is.null,is_deleted.eq.false");

        if (payoutDeleteError) throw payoutDeleteError;
      }
    },
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["finance_transactions"] });
      // Invalidate all dashboard queries (with year/month variations)
      queryClient.invalidateQueries({ queryKey: ["dashboard"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["student_activity_balance"] });
      queryClient.invalidateQueries({ queryKey: ["student_total_balance"] });
      // Invalidate staff payouts if it was a salary transaction
      queryClient.invalidateQueries({
        queryKey: ["staff-payouts"],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ["staff-payouts-all"],
        exact: false,
      });
    },
    onError: (error) => {
      toast({
        title: "Помилка",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Upsert finance transaction (find by student_id, activity_id, date or create new)
export function useUpsertFinanceTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      transaction: FinanceTransactionInsert & { id?: string },
    ) => {
      // Try to find existing transaction
      let query = supabaseAny
        .from("finance_transactions")
        .select("id")
        .eq("type", transaction.type);

      if (transaction.attendance_id) {
        query = query.eq("attendance_id", transaction.attendance_id);
      } else {
        query = query.eq("date", transaction.date);

        if (transaction.student_id) {
          query = query.eq("student_id", transaction.student_id);
        } else {
          query = query.is("student_id", null);
        }

        if (transaction.activity_id) {
          query = query.eq("activity_id", transaction.activity_id);
        } else {
          query = query.is("activity_id", null);
        }
      }

      const { data: existing, error: findError } = await query.maybeSingle();

      if (findError && findError.code !== "PGRST116") {
        // PGRST116 = no rows returned
        throw findError;
      }

      if (existing && existing.id) {
        // Update existing transaction
        const { data, error } = await supabaseAny
          .from("finance_transactions")
          .update({
            amount: transaction.amount,
            description: transaction.description,
            category: transaction.category,
            account_id: transaction.account_id ?? null, // Update account_id if provided
            attendance_id: transaction.attendance_id ?? null,
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new transaction
        const { id, ...insertData } = transaction;
        const { data, error } = await supabaseAny
          .from("finance_transactions")
          .insert({
            ...insertData,
            account_id: insertData.account_id ?? null, // Ensure account_id is set
            attendance_id: insertData.attendance_id ?? null,
          })
          .select()
          .single();

        if (error) throw error;

        return data;
      }
    },
    onSuccess: async (data) => {
      // Принудительно инвалидируем и перезапрашиваем все связанные запросы
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance_transactions"] }),
        queryClient.invalidateQueries({
          queryKey: ["dashboard"],
          exact: false,
        }),
        queryClient.invalidateQueries({
          queryKey: ["student_activity_balance"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["student_account_balances"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["payment_allocation"],
        }),
      ]);
      // Принудительно перезапрашиваем ВСЕ запросы дашборда (не только активные)
      await queryClient.refetchQueries({
        queryKey: ["dashboard"],
        exact: false,
      });
    },
    onError: (error) => {
      console.error("Error upserting finance transaction:", error);
      toast({
        title: "Помилка",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Calculate balance for student by activity
export function useStudentActivityBalance(
  studentId: string,
  activityId: string,
  month?: number,
  year?: number,
) {
  return useQuery({
    queryKey: ["student_activity_balance", studentId, activityId, month, year],
    queryFn: async () => {
      const baseTariffIdSet = await fetchAttendanceV1BaseTariffIds();
      const now = new Date();
      const targetMonth = month !== undefined ? month : now.getMonth();
      const targetYear = year !== undefined ? year : now.getFullYear();

      const startDate = getMonthStartDate(targetYear, targetMonth);
      const endDate = getMonthEndDate(targetYear, targetMonth);

      // Get payments
      // Strictly filter by student_id and activity_id - exclude null values
      const { data: payments, error: paymentsError } = await supabaseAny
        .from("finance_transactions")
        .select("amount")
        .eq("student_id", studentId)
        .not("student_id", "is", null) // Explicitly exclude null
        .eq("activity_id", activityId)
        .not("activity_id", "is", null) // Explicitly exclude null
        .eq("type", "payment")
        .gte("date", startDate)
        .lte("date", endDate);

      if (paymentsError) throw paymentsError;

      // Get charges from finance_transactions (income type) - for Garden Attendance Journal base tariffs
      // Strictly filter by student_id and activity_id - exclude null values
      const { data: incomeTransactions, error: incomeError } = await supabaseAny
        .from("finance_transactions")
        .select("amount, description, activity_id")
        .eq("student_id", studentId)
        .not("student_id", "is", null) // Explicitly exclude null
        .eq("activity_id", activityId)
        .not("activity_id", "is", null) // Explicitly exclude null
        .eq("type", "income")
        .gte("date", startDate)
        .lte("date", endDate);

      if (incomeError) throw incomeError;

      // Get refunds from finance_transactions (expense type) - for Garden Attendance Journal food tariffs
      // Strictly filter by student_id and activity_id - exclude null values
      const { data: expenseTransactions, error: expenseError } =
        await supabaseAny
          .from("finance_transactions")
          .select("amount")
          .eq("student_id", studentId)
          .not("student_id", "is", null) // Explicitly exclude null
          .eq("activity_id", activityId)
          .not("activity_id", "is", null) // Explicitly exclude null
          .eq("type", "expense")
          .gte("date", startDate)
          .lte("date", endDate);

      if (expenseError) throw expenseError;

      let charges = 0;
      let refunds = 0;

      // First, try to get charges from finance_transactions (for Garden Attendance Journal)
      if (incomeTransactions && incomeTransactions.length > 0) {
        const filteredIncome = incomeTransactions.filter(
          (t) => !isAttendanceV1InfoIncome(t, baseTariffIdSet),
        );
        charges = filteredIncome.reduce((sum, t) => sum + (t.amount || 0), 0);
      }

      // Get refunds (expense transactions for food - this is a refund to client)
      if (expenseTransactions && expenseTransactions.length > 0) {
        refunds = expenseTransactions.reduce(
          (sum, t) => sum + (t.amount || 0),
          0,
        );
        // For food activities: refunds don't reduce charges, they are separate (positive for client)
        // For other activities: refunds reduce charges
        // We'll handle this in the balance calculation
      }

      // If no finance transactions, fallback to attendance
      if (
        incomeTransactions &&
        incomeTransactions.length === 0 &&
        (!expenseTransactions || expenseTransactions.length === 0)
      ) {
        // Fallback to attendance (for regular journals)
        const { data: enrollments, error: enrollmentsError } = await supabase
          .from("enrollments")
          .select("id")
          .eq("student_id", studentId)
          .eq("activity_id", activityId)
          .eq("is_active", true)
          .maybeSingle();

        if (enrollmentsError) throw enrollmentsError;

        if (enrollments) {
          const { data: attendance, error: attendanceError } = await supabase
            .from("attendance")
            .select("charged_amount")
            .eq("enrollment_id", enrollments.id)
            .gte("date", startDate)
            .lte("date", endDate);

          if (attendanceError) throw attendanceError;
          // Розраховуємо витрати тільки з charged_amount (value не впливає на баланс)
          charges =
            attendance?.reduce((sum, a) => sum + (a.charged_amount || 0), 0) ||
            0;
        }
      }

      const totalPayments =
        payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      // For food activities: balance = payments - charges + refunds (refunds increase balance)
      // For other activities: balance = payments - charges (refunds already reduced charges)
      // We need to check if this is a food activity - but we don't have that info here
      // So we'll calculate: balance = payments - charges + refunds (refunds always increase balance for client)
      const balance = totalPayments - charges + refunds;

      // Get attendance count
      let attendanceCount = 0;
      let absentCount = 0;
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", studentId)
        .eq("activity_id", activityId)
        .maybeSingle();

      if (enrollments) {
        // Get activity with billing_rules to access custom_statuses
        const { data: activity } = await supabase
          .from("activities")
          .select("billing_rules")
          .eq("id", activityId)
          .single();

        const customStatuses =
          (activity?.billing_rules as any)?.custom_statuses || [];
        const activeCustomStatusIds = customStatuses
          .filter((cs: any) => cs.is_active !== false)
          .map((cs: any) => cs.id);

        // Get all attendance records (status + value for numeric marks)
        const { data: attendanceRecords } = await supabase
          .from("attendance")
          .select("id, status, value")
          .eq("enrollment_id", enrollments.id)
          .gte("date", startDate)
          .lte("date", endDate);

        // Count: 'present', custom status, або "Число" (status=null, value>0) — кожна ячейка з цифрою = 1 заняття
        const statusCount =
          attendanceRecords?.filter(
            (record: any) =>
              record.status === "present" ||
              activeCustomStatusIds.includes(record.status),
          ).length || 0;
        const valueRecordCount =
          attendanceRecords?.filter(
            (record: any) => !record.status && (record.value ?? 0) > 0,
          ).length || 0;
        attendanceCount = statusCount + valueRecordCount;
      }

      // Count absent for food activities (from expense transactions)
      const { data: absenceExpenseTransactions } = await supabaseAny
        .from("finance_transactions")
        .select("id")
        .eq("student_id", studentId)
        .not("student_id", "is", null)
        .eq("activity_id", activityId)
        .not("activity_id", "is", null)
        .eq("type", "expense")
        .gte("date", startDate)
        .lte("date", endDate);

      absentCount = absenceExpenseTransactions?.length || 0;

      return {
        balance,
        payments: totalPayments,
        charges,
        refunds,
        attendanceCount,
        absentCount,
      };
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
  year?: number,
) {
  return useQuery({
    queryKey: [
      "student_activity_monthly_balance",
      studentId,
      activityId,
      baseMonthlyCharge,
      month,
      year,
    ],
    queryFn: async () => {
      const baseTariffIdSet = await fetchAttendanceV1BaseTariffIds();
      const now = new Date();
      const targetMonth = month !== undefined ? month : now.getMonth();
      const targetYear = year !== undefined ? year : now.getFullYear();

      const startDate = getMonthStartDate(targetYear, targetMonth);
      const endDate = getMonthEndDate(targetYear, targetMonth);

      const { data: payments, error: paymentsError } = await supabaseAny
        .from("finance_transactions")
        .select("amount")
        .eq("student_id", studentId)
        .not("student_id", "is", null)
        .eq("activity_id", activityId)
        .not("activity_id", "is", null)
        .eq("type", "payment")
        .gte("date", startDate)
        .lte("date", endDate);

      if (paymentsError) throw paymentsError;

      const { data: incomeTransactions, error: incomeError } = await supabaseAny
        .from("finance_transactions")
        .select("id, amount, date, description, activity_id")
        .eq("student_id", studentId)
        .not("student_id", "is", null)
        .eq("activity_id", activityId)
        .not("activity_id", "is", null)
        .eq("type", "income")
        .gte("date", startDate)
        .lte("date", endDate);

      if (incomeError) throw incomeError;

      const { data: expenseTransactions, error: expenseError } =
        await supabaseAny
          .from("finance_transactions")
          .select("amount")
          .eq("student_id", studentId)
          .not("student_id", "is", null)
          .eq("activity_id", activityId)
          .not("activity_id", "is", null)
          .eq("type", "expense")
          .gte("date", startDate)
          .lte("date", endDate);

      if (expenseError) throw expenseError;

      const totalPayments =
        payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const refunds =
        expenseTransactions?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
      const realIncomeTransactions = (incomeTransactions || []).filter(
        (t) => !isAttendanceV1InfoIncome(t, baseTariffIdSet),
      );

      // For subscription type:
      // - If there's an income transaction, use its amount (actual charge)
      // - If no income transaction exists but baseMonthlyCharge > 0, use baseMonthlyCharge (for future months or pending charges)
      // - If no income transaction and baseMonthlyCharge = 0, charges = 0 (subscription was deleted/cancelled)
      const incomeTotal =
        realIncomeTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) ||
        0;
      const hasIncomeTransaction = realIncomeTransactions.length > 0;
      // Если есть доходные транзакции, используем их сумму как реальные начисления
      // Иначе используем базовую абонплату (для будущих месяцев/ожидаемых начислений)
      const charges = hasIncomeTransaction
        ? incomeTotal
        : baseMonthlyCharge > 0
          ? baseMonthlyCharge
          : 0;
      const balance = totalPayments - charges + refunds;

      // Get attendance count
      let attendanceCount = 0;
      let absentCount = 0;
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", studentId)
        .eq("activity_id", activityId)
        .maybeSingle();

      if (enrollments) {
        // Get activity with billing_rules to access custom_statuses
        const { data: activity } = await supabase
          .from("activities")
          .select("billing_rules")
          .eq("id", activityId)
          .single();

        const customStatuses =
          (activity?.billing_rules as any)?.custom_statuses || [];
        const activeCustomStatusIds = customStatuses
          .filter((cs: any) => cs.is_active !== false)
          .map((cs: any) => cs.id);

        // Get all attendance records (status + value for numeric marks)
        const { data: attendanceRecords } = await supabase
          .from("attendance")
          .select("id, status, value")
          .eq("enrollment_id", enrollments.id)
          .gte("date", startDate)
          .lte("date", endDate);

        // Count: 'present', custom status, або "Число" (status=null, value>0) — кожна ячейка з цифрою = 1 заняття
        const statusCount =
          attendanceRecords?.filter(
            (record: any) =>
              record.status === "present" ||
              activeCustomStatusIds.includes(record.status),
          ).length || 0;
        const valueRecordCount =
          attendanceRecords?.filter(
            (record: any) => !record.status && (record.value ?? 0) > 0,
          ).length || 0;
        attendanceCount = statusCount + valueRecordCount;
      }

      // Count absent for food activities (from expense transactions)
      const { data: absenceExpenseTransactions } = await supabaseAny
        .from("finance_transactions")
        .select("id")
        .eq("student_id", studentId)
        .not("student_id", "is", null)
        .eq("activity_id", activityId)
        .not("activity_id", "is", null)
        .eq("type", "expense")
        .gte("date", startDate)
        .lte("date", endDate);

      absentCount = absenceExpenseTransactions?.length || 0;

      return {
        balance,
        payments: totalPayments,
        charges,
        refunds,
        attendanceCount,
        absentCount,
      };
    },
    enabled: !!studentId && !!activityId,
  });
}

// Get subscription charges grouped by account for a student in a specific month
export function useStudentSubscriptionChargesByAccount(
  studentId: string,
  month: number,
  year: number,
  enrollments: any[], // EnrollmentWithRelations[]
) {
  return useQuery({
    queryKey: [
      "student_subscription_charges_by_account",
      studentId,
      month,
      year,
      enrollments.map((e) => e.id).join(","),
    ],
    queryFn: async () => {
      const startDate = getMonthStartDate(year, month);
      const endDate = getMonthEndDate(year, month);

      // Filter subscription enrollments
      const subscriptionEnrollments = enrollments.filter((enrollment) => {
        const activity = enrollment.activities;
        const presentRule = activity?.billing_rules?.present;
        return presentRule?.type === "subscription";
      });

      if (subscriptionEnrollments.length === 0) {
        return new Map<string, number>();
      }

      // Get activity IDs
      const activityIds = subscriptionEnrollments.map((e) => e.activity_id);
      const enrollmentIds = subscriptionEnrollments.map((e) => e.id);
      const monthEndDateStr = getMonthEndDate(year, month);

      const priceHistoryMap = new Map<string, EnrollmentPriceHistory[]>();
      const accountHistoryMap = new Map<string, EnrollmentAccountHistory[]>();
      if (enrollmentIds.length > 0) {
        const { data: priceHistoryRows, error: priceHistoryError } = await supabaseAny
          .from("enrollment_price_history")
          .select("*")
          .in("enrollment_id", enrollmentIds)
          .order("effective_from", { ascending: false });
        if (priceHistoryError) throw priceHistoryError;
        (priceHistoryRows || []).forEach((row: EnrollmentPriceHistory) => {
          if (!priceHistoryMap.has(row.enrollment_id)) {
            priceHistoryMap.set(row.enrollment_id, []);
          }
          priceHistoryMap.get(row.enrollment_id)!.push(row);
        });

        const { data: accountHistoryRows, error: accountHistoryError } = await supabaseAny
          .from("enrollment_account_history")
          .select("*")
          .in("enrollment_id", enrollmentIds)
          .order("effective_from", { ascending: false });
        if (accountHistoryError) throw accountHistoryError;
        (accountHistoryRows || []).forEach((row: EnrollmentAccountHistory) => {
          if (!accountHistoryMap.has(row.enrollment_id)) {
            accountHistoryMap.set(row.enrollment_id, []);
          }
          accountHistoryMap.get(row.enrollment_id)!.push(row);
        });
      }

      // Get income transactions for these activities
      const { data: transactions, error } = await supabaseAny
        .from("finance_transactions")
        .select("activity_id, amount")
        .eq("student_id", studentId)
        .eq("type", "income")
        .in("activity_id", activityIds)
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;

      // Group by account_id
      const chargesByAccount = new Map<string, number>();

      subscriptionEnrollments.forEach((enrollment) => {
        const activity = enrollment.activities;
        const enrollmentAccountId = getEnrollmentAccountForDate(
          enrollment,
          accountHistoryMap.get(enrollment.id),
          monthEndDateStr,
        );
        const accountId =
          enrollmentAccountId || activity?.account_id || "none";

        // Sum charges for this activity from transactions
        const activityCharges =
          transactions
            ?.filter((t) => t.activity_id === enrollment.activity_id)
            .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        // If no transactions found, calculate from tariff (for future/current months)
        let chargeToAdd = activityCharges;
        if (activityCharges === 0) {
          const presentRule = activity?.billing_rules?.present;
          const priceForDate = getEnrollmentPriceForDate(
            enrollment,
            priceHistoryMap.get(enrollment.id),
            monthEndDateStr,
          );
          if (
            priceForDate.custom_price !== null &&
            priceForDate.custom_price !== undefined
          ) {
            const discountMultiplier =
              1 - (priceForDate.discount_percent || 0) / 100;
            chargeToAdd =
              Math.round(priceForDate.custom_price * discountMultiplier * 100) /
              100;
          } else if (presentRule?.rate && presentRule.rate > 0) {
            chargeToAdd = presentRule.rate;
          } else {
            chargeToAdd = activity?.default_price || 0;
          }
        }

        const currentTotal = chargesByAccount.get(accountId) || 0;
        chargesByAccount.set(accountId, currentTotal + chargeToAdd);
      });

      return chargesByAccount;
    },
    enabled: !!studentId && enrollments.length > 0,
  });
}

// Calculate total balance for student across all activities
export function useStudentTotalBalance(
  studentId: string,
  month?: number,
  year?: number,
  cumulative: boolean = false,
) {
  return useQuery({
    queryKey: ["student_total_balance", studentId, month, year, cumulative],
    queryFn: async () => {
      const baseTariffIdSet = await fetchAttendanceV1BaseTariffIds();
      // Only calculate date range if month and year are provided
      let startDate: string | undefined;
      let endDate: string | undefined;

      if (month !== undefined && year !== undefined) {
        if (cumulative) {
          // Для кумулятивного баланса: от начала до конца выбранного месяца
          startDate = undefined; // Начало всех времен
          endDate = getMonthEndDate(year, month);
        } else {
          // Для месячного баланса: только выбранный месяц
          startDate = getMonthStartDate(year, month);
          endDate = getMonthEndDate(year, month);
        }
      }

      // Get all payments (for selected month or all time)
      // Strictly filter by student_id - exclude null values
      const paymentsQuery = supabaseAny
        .from("finance_transactions")
        .select("amount")
        .eq("student_id", studentId)
        .not("student_id", "is", null) // Explicitly exclude null
        .eq("type", "payment");

      if (endDate) {
        paymentsQuery.lte("date", endDate);
        if (startDate) {
          paymentsQuery.gte("date", startDate);
        }
      }

      const { data: payments, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;

      // Get all charges from finance_transactions (income type)
      // Strictly filter by student_id - exclude null values
      const incomeQuery = supabaseAny
        .from("finance_transactions")
        .select("amount, description, activity_id")
        .eq("student_id", studentId)
        .not("student_id", "is", null) // Explicitly exclude null
        .eq("type", "income");

      if (endDate) {
        incomeQuery.lte("date", endDate);
        if (startDate) {
          incomeQuery.gte("date", startDate);
        }
      }

      const { data: incomeTransactions, error: incomeError } =
        await incomeQuery;
      if (incomeError) throw incomeError;

      // Get all refunds from finance_transactions (expense type)
      // Strictly filter by student_id - exclude null values
      const expenseQuery = supabaseAny
        .from("finance_transactions")
        .select("amount")
        .eq("student_id", studentId)
        .not("student_id", "is", null) // Explicitly exclude null
        .eq("type", "expense");

      if (endDate) {
        expenseQuery.lte("date", endDate);
        if (startDate) {
          expenseQuery.gte("date", startDate);
        }
      }

      const { data: expenseTransactions, error: expenseError } =
        await expenseQuery;
      if (expenseError) throw expenseError;

      let charges = 0;
      let refunds = 0;

      if (incomeTransactions && incomeTransactions.length > 0) {
        const filteredIncome = incomeTransactions.filter(
          (t) => !isAttendanceV1InfoIncome(t, baseTariffIdSet),
        );
        charges = filteredIncome.reduce((sum, t) => sum + (t.amount || 0), 0);
      }

      if (expenseTransactions && expenseTransactions.length > 0) {
        refunds = expenseTransactions.reduce(
          (sum, t) => sum + (t.amount || 0),
          0,
        );
        // Don't reduce charges here - refunds will be added to balance separately
        // For food activities: charges stay as is (0 if no income), refunds increase balance
        // For other activities: we'll handle refunds in balance calculation
      }

      // Fallback to attendance if no finance transactions
      // Only use attendance data that belongs to this specific student
      if (
        incomeTransactions &&
        incomeTransactions.length === 0 &&
        (!expenseTransactions || expenseTransactions.length === 0)
      ) {
        // Get all enrollments for this student (to ensure we only get attendance for this student)
        const { data: studentEnrollments, error: enrollmentError } =
          await supabase
            .from("enrollments")
            .select("id")
            .eq("student_id", studentId);

        if (enrollmentError) throw enrollmentError;

        if (studentEnrollments && studentEnrollments.length > 0) {
          const enrollmentIds = studentEnrollments.map((e) => e.id);

          // Get attendance only for enrollments that belong to this student
          const attendanceQuery = supabase
            .from("attendance")
            .select("charged_amount")
            .in("enrollment_id", enrollmentIds);

          if (endDate) {
            attendanceQuery.lte("date", endDate);
            if (startDate) {
              attendanceQuery.gte("date", startDate);
            }
          }

          const { data: attendance, error: attendanceError } =
            await attendanceQuery;
          if (attendanceError) throw attendanceError;
          charges =
            attendance?.reduce((sum, a) => sum + (a.charged_amount || 0), 0) ||
            0;
        }
      }

      const totalPayments =
        payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
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
  /** Только абонплата (subscription) — для «До сплати на початок» */
  subscription_charges?: number;
  unassigned_payments?: number;
  previous_balance?: number; // Баланс на начало выбранного месяца
  /** Баланс на кінець періоду (сума по всіх місяцях) — для реєстру боржників */
  balance_at_period_end?: number;
}

/** Данные для расчёта баланса одного студента (уже отфильтрованы по студенту и периоду) */
export type StudentAccountBalancesInput = {
  enrollments: any[];
  transactions: any[];
  attendanceData: { enrollment_id: string; charged_amount: number | null; date: string }[];
  activityAccountMap: Record<string, string | null>;
  activityDataMap: Record<
    string,
    { billing_rules: any; default_price: number; balance_display_mode: string | null }
  >;
  attendanceV1BaseTariffIdSet: Set<string>;
  month: number;
  year: number;
  cumulative: boolean;
  excludeActivityIds: string[];
  foodTariffIds: string[];
  enrollmentAccountHistoryMap?: Map<string, EnrollmentAccountHistory[]>;
  activityPriceHistoryMap?: Map<string, ActivityPriceHistory[]>;
  /** Внесені залишки (тільки для місяця внесення). Додається лише в previous_balance («баланс на початок»); при підсумовуванні попередніх місяців — для коректного переносу закриття. */
  openingBalances?: { balance_date: string; account_id: string; amount: number }[];
  /** Виключені абонплатні нарахування (корзина): не включати в subscription_charges. Ключі: "enrollmentId-year-month". */
  subscriptionChargeExclusions?: Set<string>;
};

/**
 * Расчёт балансов по уже загруженным данным. Один код пути — без дублирования логики.
 * transactions и attendanceData должны покрывать весь период от earliest enrollment до конца выбранного месяца.
 */
export function computeStudentAccountBalancesFromData(
  params: StudentAccountBalancesInput,
): StudentAccountBalance[] {
  const {
    enrollments,
    transactions,
    attendanceData,
    activityAccountMap,
    activityDataMap,
    attendanceV1BaseTariffIdSet,
    month,
    year,
    cumulative,
    excludeActivityIds,
    foodTariffIds,
    enrollmentAccountHistoryMap = new Map(),
    activityPriceHistoryMap = new Map<string, ActivityPriceHistory[]>(),
    enrollmentPriceHistoryMap = new Map(),
    openingBalances = [],
    subscriptionChargeExclusions = new Set<string>(),
  } = params;

  const excludedSet = new Set(excludeActivityIds);
  const allFilteredEnrollments = enrollments.filter(
    (e: any) => !excludedSet.has(e.activity_id),
  );
  if (allFilteredEnrollments.length === 0) return [];

  const earliestEnrolled = allFilteredEnrollments.reduce((min: string | null, e: any) => {
    const at = e.effective_from ?? e.enrolled_at ?? null;
    if (!at) return min;
    return !min || at < min ? at : min;
  }, null as string | null);
  if (!earliestEnrolled) return [];

  const earliest = new Date(earliestEnrolled);
  const startYear = earliest.getFullYear();
  const startMonth = earliest.getMonth();
  const startDate = getMonthStartDate(startYear, startMonth);
  const endDate = getMonthEndDate(year, month);

  let monthsToCalculate: Array<{ month: number; year: number }> = [];
  const previousMonthsToCalculate: Array<{ month: number; year: number }> = [];
  if (cumulative) {
    for (let y = startYear; y <= year; y++) {
      const mStart = y === startYear ? startMonth : 0;
      const mEnd = y === year ? month : 11;
      for (let m = mStart; m <= mEnd; m++) monthsToCalculate.push({ month: m, year: y });
    }
  } else {
    for (let y = startYear; y <= year; y++) {
      const mStart = y === startYear ? startMonth : 0;
      const mEnd = y === year ? month - 1 : 11;
      for (let m = mStart; m <= mEnd; m++)
        previousMonthsToCalculate.push({ month: m, year: y });
    }
    monthsToCalculate = [...previousMonthsToCalculate, { month, year }];
  }

  const enrollmentIds = allFilteredEnrollments.map((e: any) => e.id);
  const foodTariffIdSet = new Set(foodTariffIds);
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const transactionsByMonth = new Map<string, any[]>();
  const attendanceByMonth = new Map<string, typeof attendanceData>();

  (transactions || []).forEach((trans: any) => {
    const transDate = new Date(trans.date);
    const monthKey = `${transDate.getFullYear()}-${transDate.getMonth()}`;
    if (!transactionsByMonth.has(monthKey)) transactionsByMonth.set(monthKey, []);
    transactionsByMonth.get(monthKey)!.push(trans);
  });
  attendanceData.forEach((att: any) => {
    const attDate = new Date(att.date);
    const monthKey = `${attDate.getFullYear()}-${attDate.getMonth()}`;
    if (!attendanceByMonth.has(monthKey)) attendanceByMonth.set(monthKey, []);
    attendanceByMonth.get(monthKey)!.push(att);
  });

  const enrollmentActivityMap = new Map<string, string>();
  const enrollmentAccountMap = new Map<string, string | null>();
  const enrollmentDataMap = new Map<
    string,
    {
      activity_id: string;
      custom_price: number | null;
      discount_percent: number | null;
      account_id: string | null;
      is_active: boolean;
      unenrolled_at: string | null;
      enrolled_at: string | null;
    }
  >();
  allFilteredEnrollments.forEach((enrollment: any) => {
    enrollmentActivityMap.set(enrollment.id, enrollment.activity_id);
    enrollmentAccountMap.set(enrollment.id, enrollment.account_id ?? null);
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

  const monthlyBalancesMap = new Map<string, StudentAccountBalance[]>();

  for (const { month: m, year: y } of monthsToCalculate) {
    const monthStart = new Date(y, m, 1);
    const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const isFutureMonth =
      y > currentYear || (y === currentYear && m > currentMonth);

    const filteredEnrollments = allFilteredEnrollments.filter((e: any) => {
      const unenrolledDate = e.unenrolled_at ? new Date(e.unenrolled_at) : null;
      if (unenrolledDate && unenrolledDate < monthStart) return false;

      const firstDay = getMonthStartDate(y, m);
      const lastDay = getMonthEndDate(y, m);

      const priceHistory = enrollmentPriceHistoryMap.get(e.id);
      const coversByPriceHistory = enrollmentHistoryCoversMonth(priceHistory, y, m);

      // Account history is the authoritative source: if an account binding existed for
      // this month the enrollment was active then, regardless of price history or
      // effective_from (which may have been corrupted by a prior account rebind).
      const accountHistory = enrollmentAccountHistoryMap.get(e.id);
      const coversByAccountHistory = accountHistory && accountHistory.length > 0
        ? accountHistory.some((record) => {
            if (record.effective_from > lastDay) return false;
            if (record.effective_to != null && record.effective_to <= firstDay) return false;
            return true;
          })
        : false;

      const inScopeByHistory = coversByPriceHistory || coversByAccountHistory;
      const hasAnyHistory =
        (priceHistory && priceHistory.length > 0) ||
        (accountHistory && accountHistory.length > 0);

      if (hasAnyHistory) {
        if (!inScopeByHistory) return false;
        if (isFutureMonth) return e.is_active === true;
        if (e.is_active === true) return true;
        if (e.is_active === false && unenrolledDate) {
          return unenrolledDate >= monthStart;
        }
        return false;
      }

      // Fallback: без будь-якої історії — по effective_from / enrolled_at
      const effectiveDate = (e.effective_from ?? e.enrolled_at)
        ? new Date(e.effective_from ?? e.enrolled_at)
        : null;
      if (effectiveDate && effectiveDate > monthEnd) return false;
      if (isFutureMonth) {
        return e.is_active === true && effectiveDate && effectiveDate <= monthEnd;
      }
      if (e.is_active === true) return true;
      if (e.is_active === false && unenrolledDate) {
        return unenrolledDate >= monthStart;
      }
      return false;
    });

    const monthKey = `${y}-${m}`;
    const monthTransactions = transactionsByMonth.get(monthKey) || [];
    const monthAttendance = attendanceByMonth.get(monthKey) || [];

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
      attendanceV1BaseTariffIdSet,
      m,
      y,
      enrollmentAccountHistoryMap,
      enrollmentPriceHistoryMap,
      subscriptionChargeExclusions,
      activityPriceHistoryMap,
    );
    monthlyBalancesMap.set(monthKey, monthlyBalances);
  }

  if (!cumulative && month !== undefined && year !== undefined) {
    const monthKey = `${year}-${month}`;
    const monthlyBalances = monthlyBalancesMap.get(monthKey) || [];
    const previousBalancesMap = new Map<string | null, number>();
    for (const { month: m, year: y } of previousMonthsToCalculate) {
      const key = `${y}-${m}`;
      const monthStartStr = getMonthStartDate(y, m);
      const openingForMonth = new Map<string | null, number>();
      openingBalances
        .filter(
          (ob) => (ob.balance_date?.split?.("T")[0] ?? ob.balance_date) === monthStartStr
        )
        .forEach((ob) => {
          const aid = ob.account_id || null;
          openingForMonth.set(aid, (openingForMonth.get(aid) || 0) + (ob.amount ?? 0));
        });
      const balances = monthlyBalancesMap.get(key) || [];
      balances.forEach((balance) => {
        const cur = previousBalancesMap.get(balance.account_id) || 0;
        const opening = openingForMonth.get(balance.account_id ?? null) ?? 0;
        previousBalancesMap.set(balance.account_id, cur + balance.balance + opening);
      });
    }
    const monthlyByAccount = new Map<string | null, StudentAccountBalance>();
    monthlyBalances.forEach((balance) => {
      monthlyByAccount.set(balance.account_id ?? null, balance);
    });

    const currentMonthStart = getMonthStartDate(year, month);
    const openingByAccount = new Map<string | null, number>();
    openingBalances
      .filter(
        (ob) =>
          (ob.balance_date?.split?.("T")[0] ?? ob.balance_date) === currentMonthStart,
      )
      .forEach((ob) => {
        const aid = ob.account_id || null;
        openingByAccount.set(aid, (openingByAccount.get(aid) || 0) + (ob.amount ?? 0));
      });

    const result: StudentAccountBalance[] = [];
    const accountIds = new Set<string | null>([
      ...Array.from(monthlyByAccount.keys()),
      ...Array.from(previousBalancesMap.keys()),
      ...Array.from(openingByAccount.keys()),
    ]);

    accountIds.forEach((accountId) => {
      const balance = monthlyByAccount.get(accountId);
      const opening = openingByAccount.get(accountId) || 0;
      result.push({
        account_id: accountId,
        balance: balance?.balance ?? 0,
        payments: balance?.payments ?? 0,
        charges: balance?.charges ?? 0,
        refunds: balance?.refunds ?? 0,
        subscription_charges: balance?.subscription_charges ?? 0,
        unassigned_payments: balance?.unassigned_payments ?? 0,
        // «На початок» = сальдо попереднього місяця + внесений залишок поточного місяця.
        previous_balance: (previousBalancesMap.get(accountId) || 0) + opening,
      });
    });

    return result;
  }

  const cumulativeBalances = new Map<string | null, StudentAccountBalance>();
  for (const balances of monthlyBalancesMap.values()) {
    balances.forEach((balance) => {
      const existing = cumulativeBalances.get(balance.account_id);
      if (existing) {
        existing.balance += balance.balance;
        existing.payments += balance.payments;
        existing.charges += balance.charges;
        existing.refunds += balance.refunds;
        existing.subscription_charges =
          (existing.subscription_charges ?? 0) + (balance.subscription_charges ?? 0);
        existing.unassigned_payments =
          (existing.unassigned_payments || 0) + (balance.unassigned_payments || 0);
      } else {
        cumulativeBalances.set(balance.account_id, { ...balance });
      }
    });
  }
  return Array.from(cumulativeBalances.values());
}

export async function fetchStudentAccountBalances({
  studentId,
  month,
  year,
  excludeActivityIds = [],
  foodTariffIds = [],
  cumulative = false,
}: {
  studentId: string;
  month?: number;
  year?: number;
  excludeActivityIds?: string[];
  foodTariffIds?: string[];
  cumulative?: boolean;
}): Promise<StudentAccountBalance[]> {
  if (month === undefined || year === undefined) return [];

  const attendanceV1BaseTariffIdSet = await fetchAttendanceV1BaseTariffIds();

  const { data: enrollments, error: enrollmentsError } = await supabaseAny
    .from("enrollments")
    .select(
      "id, activity_id, custom_price, discount_percent, account_id, is_active, unenrolled_at, enrolled_at, effective_from",
    )
    .eq("student_id", studentId);

  if (enrollmentsError) throw enrollmentsError;

  const excludedSet = new Set(excludeActivityIds);
  const allFilteredEnrollments = (enrollments || []).filter(
    (e: any) => !excludedSet.has(e.activity_id),
  );
  if (allFilteredEnrollments.length === 0) return [];

  const earliestEnrolled = allFilteredEnrollments.reduce(
    (min: string | null, e: any) => {
      const at = e.effective_from ?? e.enrolled_at ?? null;
      if (!at) return min;
      return !min || at < min ? at : min;
    },
    null as string | null,
  );
  if (!earliestEnrolled) return [];

  const earliest = new Date(earliestEnrolled);
  const startYear = earliest.getFullYear();
  const startMonth = earliest.getMonth();
  const startDate = getMonthStartDate(startYear, startMonth);
  const endDate = getMonthEndDate(year, month);

  const enrollmentIds = allFilteredEnrollments.map((e: any) => e.id);

  const [
    { data: transactions, error: transactionsError },
    { data: attendance, error: attendanceError },
    { data: enrollmentPriceHistory, error: priceHistoryError },
    { data: openingBalances, error: openingError },
    { data: chargeExclusions, error: exclusionsError },
  ] = await Promise.all([
    supabaseAny
      .from("finance_transactions")
      .select("activity_id, allocation_activity_ids, type, amount, account_id, date, description")
      .eq("student_id", studentId)
      .not("student_id", "is", null)
      .in("type", ["payment", "income", "expense"])
      .gte("date", startDate)
      .lte("date", endDate),
    enrollmentIds.length > 0
      ? supabaseAny
          .from("attendance")
          .select("enrollment_id, charged_amount, date")
          .in("enrollment_id", enrollmentIds)
          .gte("date", startDate)
          .lte("date", endDate)
      : { data: [] as { enrollment_id: string; charged_amount: number | null; date: string }[], error: null },
    enrollmentIds.length > 0
      ? supabaseAny
          .from("enrollment_price_history")
          .select("*")
          .in("enrollment_id", enrollmentIds)
          .order("effective_from", { ascending: false })
      : { data: [] as EnrollmentPriceHistory[], error: null },
    supabaseAny
      .from("account_opening_balances")
      .select("balance_date, account_id, amount")
      .eq("student_id", studentId)
      .gte("balance_date", startDate)
      .lte("balance_date", endDate),
    enrollmentIds.length > 0
      ? supabaseAny
          .from("subscription_charge_exclusions")
          .select("enrollment_id, year, month")
          .in("enrollment_id", enrollmentIds)
      : { data: [] as { enrollment_id: string; year: number; month: number }[], error: null },
  ]);

  if (transactionsError) throw transactionsError;
  if (attendanceError) throw attendanceError;
  if (exclusionsError) throw exclusionsError;
  if (priceHistoryError) throw priceHistoryError;
  if (openingError) throw openingError;

  // Группируем историю цен по enrollment_id
  const enrollmentPriceHistoryMap = new Map<string, EnrollmentPriceHistory[]>();
  (enrollmentPriceHistory || []).forEach((ph: EnrollmentPriceHistory) => {
    if (!enrollmentPriceHistoryMap.has(ph.enrollment_id)) {
      enrollmentPriceHistoryMap.set(ph.enrollment_id, []);
    }
    enrollmentPriceHistoryMap.get(ph.enrollment_id)!.push(ph);
  });
  const enrollmentAccountHistoryMap = new Map<string, EnrollmentAccountHistory[]>();
  if (enrollmentIds.length > 0) {
    const { data: enrollmentAccountHistoryRows, error: enrollmentAccountHistoryError } =
      await supabaseAny
        .from("enrollment_account_history")
        .select("*")
        .in("enrollment_id", enrollmentIds)
        .order("effective_from", { ascending: false });
    if (enrollmentAccountHistoryError) throw enrollmentAccountHistoryError;
    (enrollmentAccountHistoryRows || []).forEach((row: EnrollmentAccountHistory) => {
      if (!enrollmentAccountHistoryMap.has(row.enrollment_id)) {
        enrollmentAccountHistoryMap.set(row.enrollment_id, []);
      }
      enrollmentAccountHistoryMap.get(row.enrollment_id)!.push(row);
    });
  }
  const activityIds = [
    ...new Set(allFilteredEnrollments.map((e: any) => e.activity_id)),
  ];
  let activityAccountMap: Record<string, string | null> = {};
  let activityDataMap: Record<
    string,
    { billing_rules: any; default_price: number; balance_display_mode: string | null }
  > = {};
  if (activityIds.length > 0) {
    const { data: activities, error: activitiesError } = await supabaseAny
      .from("activities")
      .select("id, account_id, billing_rules, default_price, balance_display_mode")
      .in("id", activityIds);
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

  const exclusionSet = new Set<string>();
  (chargeExclusions || []).forEach((ex: { enrollment_id: string; year: number; month: number }) => {
    exclusionSet.add(`${ex.enrollment_id}-${ex.year}-${ex.month}`);
  });

  const activityPriceHistoryMap = new Map<string, ActivityPriceHistory[]>();
  if (activityIds.length > 0) {
    const { data: aphRows, error: aphError } = await supabaseAny
      .from('activity_price_history')
      .select('*')
      .in('activity_id', activityIds)
      .order('effective_from', { ascending: false });
    if (aphError) throw aphError;
    (aphRows || []).forEach((row: ActivityPriceHistory) => {
      if (!activityPriceHistoryMap.has(row.activity_id)) {
        activityPriceHistoryMap.set(row.activity_id, []);
      }
      activityPriceHistoryMap.get(row.activity_id)!.push(row);
    });
  }

  return computeStudentAccountBalancesFromData({
    enrollments: allFilteredEnrollments,
    transactions: transactions || [],
    attendanceData: attendance || [],
    activityAccountMap,
    activityDataMap,
    attendanceV1BaseTariffIdSet,
    month,
    year,
    cumulative,
    excludeActivityIds,
    foodTariffIds,
    enrollmentAccountHistoryMap,
    enrollmentPriceHistoryMap,
    activityPriceHistoryMap,
    openingBalances: (openingBalances || []).map((ob: any) => ({
      balance_date: ob.balance_date,
      account_id: ob.account_id,
      amount: ob.amount ?? 0,
    })),
    subscriptionChargeExclusions: exclusionSet,
  });
}

// Вспомогательная функция для расчета месячного баланса из уже загруженных данных
function calculateMonthlyBalanceFromData(
  filteredEnrollments: any[],
  transactions: any[],
  attendanceData: any[],
  enrollmentActivityMap: Map<string, string>,
  enrollmentAccountMap: Map<string, string | null>,
  enrollmentDataMap: Map<
    string,
    {
      activity_id: string;
      custom_price: number | null;
      discount_percent: number | null;
      account_id: string | null;
      is_active: boolean;
      unenrolled_at: string | null;
      enrolled_at: string | null;
    }
  >,
  activityAccountMap: Record<string, string | null>,
  activityDataMap: Record<
    string,
    {
      billing_rules: any;
      default_price: number;
      balance_display_mode: string | null;
    }
  >,
  foodTariffIdSet: Set<string>,
  attendanceV1BaseTariffIdSet: Set<string>,
  month: number,
  year: number,
  enrollmentAccountHistoryMap: Map<string, EnrollmentAccountHistory[]> = new Map(),
  enrollmentPriceHistoryMap: Map<string, EnrollmentPriceHistory[]> = new Map(),
  subscriptionChargeExclusions: Set<string> = new Set(),
  activityPriceHistoryMap: Map<string, ActivityPriceHistory[]> = new Map(),
): StudentAccountBalance[] {
  const enrollmentIds = filteredEnrollments.map((e: any) => e.id);
  const activityIds = new Set(
    filteredEnrollments.map((e: any) => e.activity_id),
  );

  const paymentsByActivity: Record<string, number> = {};
  const incomeByActivity: Record<string, number> = {};
  const expenseByActivity: Record<string, number> = {};
  const paymentsByAccount: Map<string | null, number> = new Map();

  transactions.forEach((trans: any) => {
    if (!trans.activity_id) {
      if (trans.type === "payment") {
        const accountId = trans.account_id || null;
        const current = paymentsByAccount.get(accountId) || 0;
        paymentsByAccount.set(accountId, current + (trans.amount || 0));
      }
      return;
    }
    if (!activityIds.has(trans.activity_id)) return;
    if (trans.type === "payment") {
      paymentsByActivity[trans.activity_id] =
        (paymentsByActivity[trans.activity_id] || 0) + (trans.amount || 0);
    } else if (trans.type === "income") {
      if (!isAttendanceV1InfoIncome(trans, attendanceV1BaseTariffIdSet)) {
        incomeByActivity[trans.activity_id] =
          (incomeByActivity[trans.activity_id] || 0) + (trans.amount || 0);
      }
    } else if (trans.type === "expense") {
      expenseByActivity[trans.activity_id] =
        (expenseByActivity[trans.activity_id] || 0) + (trans.amount || 0);
    }
  });

  const attendanceByActivity: Record<string, number> = {};
  attendanceData.forEach((att) => {
    const activityId = enrollmentActivityMap.get(att.enrollment_id);
    if (!activityId) return;
    attendanceByActivity[activityId] =
      (attendanceByActivity[activityId] || 0) + (att.charged_amount || 0);
  });

  const activityIdList = Array.from(activityIds);
  const monthlyChargesByActivity: Record<string, number> = {};
  /** Тільки абонплата для «До сплати на початок»: include present.subscription + custom_status (subscription/subscription_with_logic), exclude present.fixed. */
  const subscriptionOnlyChargesByActivity: Record<string, number> = {};
  const displayModeByActivity: Record<
    string,
    "subscription" | "recalculation" | "subscription_and_recalculation"
  > = {};
  const monthEndDateStr = getMonthEndDate(year, month);
  enrollmentDataMap.forEach((enrollment, enrollmentId) => {
    if (!filteredEnrollments.find((e: any) => e.id === enrollmentId)) return;
    const activity = activityDataMap[enrollment.activity_id];
    if (!activity) return;
    const presentRule = activity.billing_rules?.present;
    const isMonthlyBilling = presentRule?.type === "subscription";
    const isArchivedInViewedMonth =
      enrollment.is_active === false &&
      (!enrollment.unenrolled_at || enrollment.unenrolled_at <= monthEndDateStr);
    const fallbackMode = isMonthlyBilling ? "subscription" : "recalculation";
    displayModeByActivity[enrollment.activity_id] =
      (activity.balance_display_mode as any) || fallbackMode;
    if (foodTariffIdSet.has(enrollment.activity_id)) return;
    // Не пропускати архівні — вони теж мають показувати історію в минулих місяцях
    let baseMonthlyCharge = 0;

    if (isMonthlyBilling) {
      const priceHistory = enrollmentPriceHistoryMap.get(enrollmentId);
      const priceForDate = getEnrollmentPriceForDate(
        enrollment,
        priceHistory,
        monthEndDateStr,
      );
      if (
        priceForDate.custom_price !== null &&
        priceForDate.custom_price !== undefined
      ) {
        const discountMultiplier = 1 - (priceForDate.discount_percent || 0) / 100;
        baseMonthlyCharge = Math.round(priceForDate.custom_price * discountMultiplier * 100) / 100;
      } else if (presentRule?.rate && presentRule.rate > 0) {
        baseMonthlyCharge = presentRule.rate;
      } else {
        baseMonthlyCharge = activity.default_price || 0;
      }
      // «Нараховано на початок» — subscription only (not fixed).
      // Use actual income tx amount when available; fall back to billing rule for future months.
      if (presentRule?.type === "subscription" && !isArchivedInViewedMonth) {
        const exclusionKey = `${enrollmentId}-${year}-${month}`;
        if (!subscriptionChargeExclusions.has(exclusionKey)) {
          const actualIncome = incomeByActivity[enrollment.activity_id] || 0;
          const chargeAmount = actualIncome > 0 ? actualIncome : baseMonthlyCharge;
          if (chargeAmount > 0) {
            subscriptionOnlyChargesByActivity[enrollment.activity_id] =
              (subscriptionOnlyChargesByActivity[enrollment.activity_id] || 0) + chargeAmount;
          }
        }
      }
    } else {
      // Resolve billing_rules for this month via activity price history (string comparison, UTC-safe)
      const actPriceHistory = activityPriceHistoryMap.get(enrollment.activity_id);
      const historicalBillingRules: any = (() => {
        if (actPriceHistory && actPriceHistory.length > 0) {
          const applicable = actPriceHistory.find((h) => {
            if (h.effective_from > monthEndDateStr) return false;
            if (h.effective_to != null && h.effective_to <= monthEndDateStr) return false;
            return true;
          });
          if (applicable?.billing_rules) {
            return {
              ...applicable.billing_rules,
              custom_statuses:
                applicable.billing_rules.custom_statuses ??
                activity.billing_rules?.custom_statuses,
            };
          }
        }
        return activity.billing_rules;
      })();

      const customStatuses = historicalBillingRules?.custom_statuses || [];
      const subscriptionCustom = customStatuses.filter(
        (cs: any) =>
          cs.is_active !== false &&
          (cs.type === "subscription" || cs.type === "subscription_with_logic") &&
          cs.rate != null &&
          cs.rate > 0,
      );
      if (subscriptionCustom.length > 0 && !isArchivedInViewedMonth) {
        const maxRate = Math.max(...subscriptionCustom.map((cs: any) => Number(cs.rate)));
        displayModeByActivity[enrollment.activity_id] =
          (activity.balance_display_mode as any) || "subscription";
        const exclusionKey = `${enrollmentId}-${year}-${month}`;
        if (!subscriptionChargeExclusions.has(exclusionKey)) {
          subscriptionOnlyChargesByActivity[enrollment.activity_id] =
            (subscriptionOnlyChargesByActivity[enrollment.activity_id] || 0) + maxRate;
        }
      }
    }

    if (!isArchivedInViewedMonth) {
      const actualIncome = incomeByActivity[enrollment.activity_id] || 0;
      const chargeAmount = actualIncome > 0 ? actualIncome : baseMonthlyCharge;
      if (chargeAmount > 0) {
        monthlyChargesByActivity[enrollment.activity_id] =
          (monthlyChargesByActivity[enrollment.activity_id] || 0) + chargeAmount;
      }
    }
  });

  const balancesByAccount = new Map<string | null, StudentAccountBalance>();
  const enrollmentToActivityMap = new Map<string, string>();
  filteredEnrollments.forEach((enrollment: any) => {
    enrollmentToActivityMap.set(enrollment.id, enrollment.activity_id);
  });
  const attendanceByEnrollment = new Map<string, number>();
  attendanceData.forEach((att) => {
    const current = attendanceByEnrollment.get(att.enrollment_id) || 0;
    attendanceByEnrollment.set(
      att.enrollment_id,
      current + (att.charged_amount || 0),
    );
  });

  activityIdList.forEach((activityId) => {
    const payments = paymentsByActivity[activityId] || 0;
    const income = incomeByActivity[activityId] || 0;
    const expense = expenseByActivity[activityId] || 0;
    const monthlyCharges = monthlyChargesByActivity[activityId] || 0;
    const attendanceTotal = attendanceByActivity[activityId] || 0;
    const displayMode =
      displayModeByActivity[activityId] ||
      (monthlyCharges > 0 ? "subscription" : "recalculation");

    const enrollmentsForActivity = Array.from(
      enrollmentDataMap.entries(),
    ).filter(
      ([eId, data]) =>
        data.activity_id === activityId &&
        filteredEnrollments.find((e: any) => e.id === eId),
    );

    let charges = attendanceTotal;
    if (displayMode === "subscription") {
      charges = monthlyCharges;
    } else if (displayMode === "subscription_and_recalculation") {
      charges = monthlyCharges + attendanceTotal;
    }
    const refunds = expense;
    const balance = payments - charges + refunds;
    // «Нараховано на початок» — з вартості абонплати (billing rules). На 1 число ще не може бути income-транзакцій.
    const subscriptionCharges = subscriptionOnlyChargesByActivity[activityId] ?? 0;

    if (enrollmentsForActivity.length === 0) {
      const accountId = activityAccountMap[activityId] ?? null;
      const existing = balancesByAccount.get(accountId) || {
        account_id: accountId,
        balance: 0,
        payments: 0,
        charges: 0,
        refunds: 0,
        subscription_charges: 0,
      };
      balancesByAccount.set(accountId, {
        account_id: accountId,
        balance: existing.balance + balance,
        payments: existing.payments + payments,
        charges: existing.charges + charges,
        refunds: existing.refunds + refunds,
        subscription_charges: (existing.subscription_charges ?? 0) + subscriptionCharges,
      });
    } else {
      const perEnrollment = enrollmentsForActivity.length;
      const perEnrollmentBalance = balance / perEnrollment;
      const perEnrollmentPayments = payments / perEnrollment;
      const perEnrollmentCharges = charges / perEnrollment;
      const perEnrollmentRefunds = refunds / perEnrollment;
      const perEnrollmentSubscriptionCharges = subscriptionCharges / perEnrollment;
      const monthEndDateStr = getMonthEndDate(year, month);

      enrollmentsForActivity.forEach(([enrollmentId, enrollmentData]) => {
        const resolvedEnrollmentAccountId = getEnrollmentAccountForDate(
          { account_id: enrollmentData.account_id ?? null },
          enrollmentAccountHistoryMap.get(enrollmentId),
          monthEndDateStr,
        );
        const accountId =
          resolvedEnrollmentAccountId ??
          activityAccountMap[enrollmentData.activity_id] ??
          null;
        const existing = balancesByAccount.get(accountId) || {
          account_id: accountId,
          balance: 0,
          payments: 0,
          charges: 0,
          refunds: 0,
          subscription_charges: 0,
        };
        balancesByAccount.set(accountId, {
          account_id: accountId,
          balance: existing.balance + perEnrollmentBalance,
          payments: existing.payments + perEnrollmentPayments,
          charges: existing.charges + perEnrollmentCharges,
          refunds: existing.refunds + perEnrollmentRefunds,
          subscription_charges: (existing.subscription_charges ?? 0) + perEnrollmentSubscriptionCharges,
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
      subscription_charges: 0,
    };
    balancesByAccount.set(accountId, {
      account_id: accountId,
      balance: existing.balance + amount,
      payments: existing.payments + amount,
      charges: existing.charges,
      refunds: existing.refunds,
      subscription_charges: existing.subscription_charges,
      unassigned_payments:
        (existing.unassigned_payments || 0) + (accountId === null ? amount : 0),
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
  foodTariffIds: string[] = [],
): Promise<StudentAccountBalance[]> {
  const attendanceV1BaseTariffIdSet = await fetchAttendanceV1BaseTariffIds();
  const startDate = getMonthStartDate(year, month);
  const endDate = getMonthEndDate(year, month);

  const { data: enrollments, error: enrollmentsError } = await supabase
    .from("enrollments")
    .select(
      "id, activity_id, custom_price, discount_percent, account_id, is_active, unenrolled_at, enrolled_at, effective_from",
    )
    .eq("student_id", studentId);

  if (enrollmentsError) throw enrollmentsError;

  const allEnrollmentIds = (enrollments || []).map((e: any) => e.id);
  let priceHistoryMap = new Map<string, EnrollmentPriceHistory[]>();
  if (allEnrollmentIds.length > 0) {
    const { data: priceHistoryRows } = await supabaseAny
      .from("enrollment_price_history")
      .select("*")
      .in("enrollment_id", allEnrollmentIds)
      .order("effective_from", { ascending: false });
    (priceHistoryRows || []).forEach((row: EnrollmentPriceHistory) => {
      const id = row.enrollment_id;
      if (!priceHistoryMap.has(id)) priceHistoryMap.set(id, []);
      priceHistoryMap.get(id)!.push(row);
    });
  }

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const isFutureMonth =
    year > currentYear || (year === currentYear && month > currentMonth);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  let filteredEnrollmentsByDate = (enrollments || []).filter((e: any) => {
    const unenrolledDate = e.unenrolled_at ? new Date(e.unenrolled_at) : null;
    if (unenrolledDate && unenrolledDate < monthStart) return false;

    const history = priceHistoryMap.get(e.id);
    const coversByHistory = enrollmentHistoryCoversMonth(history, year, month);

    if (history && history.length > 0) {
      if (!coversByHistory) return false;
      if (isFutureMonth) return e.is_active === true;
      if (e.is_active === true) return true;
      if (e.is_active === false && unenrolledDate) {
        return unenrolledDate >= monthStart && unenrolledDate <= monthEnd;
      }
      return false;
    }

    const effectiveDate = (e.effective_from ?? e.enrolled_at)
      ? new Date(e.effective_from ?? e.enrolled_at)
      : null;
    if (effectiveDate && effectiveDate > monthEnd) return false;
    if (isFutureMonth) {
      return e.is_active === true && effectiveDate && effectiveDate <= monthEnd;
    }
    if (e.is_active === true) return true;
    if (e.is_active === false && unenrolledDate) {
      return unenrolledDate >= monthStart && unenrolledDate <= monthEnd;
    }
    return false;
  });

  const excludedSet = new Set(excludeActivityIds);
  const filteredEnrollments = filteredEnrollmentsByDate.filter(
    (enrollment: any) => !excludedSet.has(enrollment.activity_id),
  );
  const enrollmentIds = filteredEnrollments.map((e: any) => e.id);
  const enrollmentActivityMap = new Map<string, string>();
  const enrollmentAccountMap = new Map<string, string | null>();
  const enrollmentDataMap = new Map<
    string,
    {
      activity_id: string;
      custom_price: number | null;
      discount_percent: number | null;
      account_id: string | null;
      is_active: boolean;
      unenrolled_at: string | null;
      enrolled_at: string | null;
    }
  >();
  const activityIds = new Set<string>();
  filteredEnrollments.forEach((enrollment: any) => {
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
    activityIds.add(enrollment.activity_id);
  });

  let attendanceData: {
    enrollment_id: string;
    charged_amount: number | null;
  }[] = [];
  if (enrollmentIds.length > 0) {
    const { data: attendance, error: attendanceError } = await supabaseAny
      .from("attendance")
      .select("enrollment_id, charged_amount")
      .in("enrollment_id", enrollmentIds)
      .gte("date", startDate)
      .lte("date", endDate);
    if (attendanceError) throw attendanceError;
    attendanceData = attendance || [];
  }

  const { data: transactions, error: transactionsError } = await supabaseAny
    .from("finance_transactions")
    .select("activity_id, type, amount, account_id, description")
    .eq("student_id", studentId)
    .not("student_id", "is", null)
    .in("type", ["payment", "income", "expense"])
    .gte("date", startDate)
    .lte("date", endDate);

  if (transactionsError) throw transactionsError;
  const activityIdList = Array.from(activityIds);
  const activityAccountMap: Record<string, string | null> = {};
  const activityDataMap: Record<
    string,
    {
      billing_rules: any;
      default_price: number;
      balance_display_mode: string | null;
    }
  > = {};
  if (activityIdList.length > 0) {
    const { data: activities, error: activitiesError } = await supabase
      .from("activities")
      .select(
        "id, account_id, billing_rules, default_price, balance_display_mode",
      )
      .in("id", activityIdList);
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
  return calculateMonthlyBalanceFromData(
    filteredEnrollments,
    transactions || [],
    attendanceData,
    enrollmentActivityMap,
    enrollmentAccountMap,
    enrollmentDataMap,
    activityAccountMap,
    activityDataMap,
    new Set(foodTariffIds),
    attendanceV1BaseTariffIdSet,
    month,
    year,
    new Map(),
    priceHistoryMap,
  );
}

/**
 * Пакетная версия: загружает данные один раз, для каждого студента вызывает
 * computeStudentAccountBalancesFromData — один код пути, отображение как у fetchStudentAccountBalances.
 */
export async function fetchAllStudentsAccountBalancesForMonth({
  month,
  year,
  studentIds,
  excludeActivityIds = [],
  foodTariffIds = [],
}: {
  month: number;
  year: number;
  studentIds: string[];
  excludeActivityIds?: string[];
  foodTariffIds?: string[];
}): Promise<Map<string, StudentAccountBalance[]>> {
  if (studentIds.length === 0) return new Map();

  const attendanceV1BaseTariffIdSet = await fetchAttendanceV1BaseTariffIds();
  const excludedSet = new Set(excludeActivityIds);
  const endDate = getMonthEndDate(year, month);

  const allEnrollmentsRaw = (await supabaseAny
    .from("enrollments")
    .select(
      "id, student_id, activity_id, custom_price, discount_percent, account_id, is_active, unenrolled_at, enrolled_at, effective_from",
    )
    .in("student_id", studentIds)
  ).data as any[];

  const allEnrollments = (allEnrollmentsRaw || []).filter(
    (e: any) => !excludedSet.has(e.activity_id),
  );
  const enrollmentIds = allEnrollments.map((e: any) => e.id);

  const earliestGlobal = allEnrollments.reduce((min: string | null, e: any) => {
    const at = e.effective_from ?? e.enrolled_at ?? null;
    if (!at) return min;
    return !min || at < min ? at : min;
  }, null as string | null);
  const startDate = earliestGlobal || getMonthStartDate(year, month);

  const [
    transactions,
    attendance,
    enrollmentPriceHistory,
    enrollmentAccountHistory,
    openingBalancesAll,
    chargeExclusionsAll,
  ] = await Promise.all([
      fetchAllRows<any>((from, to) =>
        supabaseAny
          .from("finance_transactions")
          .select("activity_id, type, amount, account_id, date, description, student_id")
          .in("student_id", studentIds)
          .not("student_id", "is", null)
          .in("type", ["payment", "income", "expense"])
          .gte("date", startDate)
          .lte("date", endDate)
          .range(from, to),
      ),
      enrollmentIds.length > 0
        ? fetchAllRows<any>((from, to) =>
            supabaseAny
              .from("attendance")
              .select("enrollment_id, charged_amount, date")
              .in("enrollment_id", enrollmentIds)
              .gte("date", startDate)
              .lte("date", endDate)
              .range(from, to),
          )
        : Promise.resolve([]),
      enrollmentIds.length > 0
        ? fetchAllRows<any>((from, to) =>
            supabaseAny
              .from("enrollment_price_history")
              .select("*")
              .in("enrollment_id", enrollmentIds)
              .order("effective_from", { ascending: false })
              .range(from, to),
          )
        : Promise.resolve([]),
      enrollmentIds.length > 0
        ? fetchAllRows<any>((from, to) =>
            supabaseAny
              .from("enrollment_account_history")
              .select("*")
              .in("enrollment_id", enrollmentIds)
              .order("effective_from", { ascending: false })
              .range(from, to),
          )
        : Promise.resolve([]),
      (async () => {
        const { data } = await supabaseAny
          .from("account_opening_balances")
          .select("balance_date, account_id, amount, student_id")
          .in("student_id", studentIds)
          .gte("balance_date", startDate)
          .lte("balance_date", endDate);
        return (data || []) as {
          balance_date: string;
          account_id: string;
          amount: number;
          student_id: string;
        }[];
      })(),
      enrollmentIds.length > 0
        ? (async () => {
            const { data } = await supabaseAny
              .from("subscription_charge_exclusions")
              .select("enrollment_id, year, month")
              .in("enrollment_id", enrollmentIds);
            return (data || []) as {
              enrollment_id: string;
              year: number;
              month: number;
            }[];
          })()
        : Promise.resolve([]),
    ]);

  const activityIds = [...new Set(allEnrollments.map((e: any) => e.activity_id))];
  let activityAccountMap: Record<string, string | null> = {};
  let activityDataMap: Record<
    string,
    { billing_rules: any; default_price: number; balance_display_mode: string | null }
  > = {};
  if (activityIds.length > 0) {
    const { data: activities, error: activitiesError } = await supabaseAny
      .from("activities")
      .select("id, account_id, billing_rules, default_price, balance_display_mode")
      .in("id", activityIds);
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

  const enrollmentPriceHistoryMap = new Map<string, EnrollmentPriceHistory[]>();
  (enrollmentPriceHistory || []).forEach((ph: EnrollmentPriceHistory) => {
    if (!enrollmentPriceHistoryMap.has(ph.enrollment_id)) {
      enrollmentPriceHistoryMap.set(ph.enrollment_id, []);
    }
    enrollmentPriceHistoryMap.get(ph.enrollment_id)!.push(ph);
  });
  const enrollmentAccountHistoryMap = new Map<string, EnrollmentAccountHistory[]>();
  (enrollmentAccountHistory || []).forEach((row: EnrollmentAccountHistory) => {
    if (!enrollmentAccountHistoryMap.has(row.enrollment_id)) {
      enrollmentAccountHistoryMap.set(row.enrollment_id, []);
    }
    enrollmentAccountHistoryMap.get(row.enrollment_id)!.push(row);
  });

  const exclusionSet = new Set<string>();
  (chargeExclusionsAll || []).forEach(
    (ex: { enrollment_id: string; year: number; month: number }) => {
      exclusionSet.add(`${ex.enrollment_id}-${ex.year}-${ex.month}`);
    },
  );

  const result = new Map<string, StudentAccountBalance[]>();

  for (const studentId of studentIds) {
    const studentEnrollments = allEnrollments.filter(
      (e: any) => e.student_id === studentId,
    );
    if (studentEnrollments.length === 0) {
      result.set(studentId, []);
      continue;
    }

    const studentEnrollmentIds = new Set(studentEnrollments.map((e: any) => e.id));
    const studentTransactions = (transactions || []).filter(
      (t: any) => t.student_id === studentId,
    );
    const studentAttendance = (attendance || []).filter((a: any) =>
      studentEnrollmentIds.has(a.enrollment_id),
    );

    const studentOpeningBalances = (openingBalancesAll || [])
      .filter((ob: any) => ob.student_id === studentId)
      .map((ob: any) => ({ balance_date: ob.balance_date, account_id: ob.account_id, amount: ob.amount ?? 0 }));
    const [balances, cumulativeBalances] = [
      computeStudentAccountBalancesFromData({
        enrollments: studentEnrollments,
        transactions: studentTransactions,
        attendanceData: studentAttendance,
        activityAccountMap,
        activityDataMap,
        attendanceV1BaseTariffIdSet,
        month,
        year,
        cumulative: false,
        excludeActivityIds,
        foodTariffIds,
        enrollmentAccountHistoryMap,
        enrollmentPriceHistoryMap,
        openingBalances: studentOpeningBalances,
        subscriptionChargeExclusions: exclusionSet,
      }),
      computeStudentAccountBalancesFromData({
        enrollments: studentEnrollments,
        transactions: studentTransactions,
        attendanceData: studentAttendance,
        activityAccountMap,
        activityDataMap,
        attendanceV1BaseTariffIdSet,
        month,
        year,
        cumulative: true,
        excludeActivityIds,
        foodTariffIds,
        enrollmentAccountHistoryMap,
        enrollmentPriceHistoryMap,
        openingBalances: studentOpeningBalances,
        subscriptionChargeExclusions: exclusionSet,
      }),
    ];
    const byAccountCumulative = new Map<string | null, number>();
    cumulativeBalances.forEach((b) => byAccountCumulative.set(b.account_id, b.balance));
    const merged = balances.map((b) => ({
      ...b,
      balance_at_period_end: byAccountCumulative.get(b.account_id),
    }));
    result.set(studentId, merged);
  }

  return result;
}

export function useStudentAccountBalances(
  studentId: string,
  month?: number,
  year?: number,
  excludeActivityIds: string[] = [],
  foodTariffIds: string[] = [],
  cumulative: boolean = false, // Если true, считает от начала до выбранного месяца включительно
) {
  return useQuery({
    queryKey: [
      "student_account_balances",
      studentId,
      month,
      year,
      excludeActivityIds,
      foodTariffIds,
      cumulative,
    ],
    queryFn: async () => {
      return fetchStudentAccountBalances({
        studentId,
        month,
        year,
        excludeActivityIds,
        foodTariffIds,
        cumulative,
      });
    },
    enabled: !!studentId,
  });
}

// Delete payment transaction and rollback distribution
export function useDeletePaymentTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      transactionId,
      reason,
    }: {
      transactionId: string;
      reason: string;
    }) => {
      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(transactionId)) {
        const error = new Error(
          `Invalid transaction ID format: ${transactionId}`,
        );
        console.error("[useDeletePaymentTransaction] Validation error:", error);
        throw error;
      }

      if (!reason || !reason.trim()) {
        const error = new Error("Reason is required");
        console.error("[useDeletePaymentTransaction] Validation error:", error);
        throw error;
      }

      try {
        const { data, error } = await supabase.rpc(
          "delete_payment_transaction",
          {
            p_transaction_id: transactionId,
            p_reason: reason.trim(),
          },
        );

        if (error) {
          console.error(
            "[useDeletePaymentTransaction] RPC error:",
            error.code,
            error.message,
          );
          throw error;
        }

        return data;
      } catch (err: any) {
        console.error(
          "[useDeletePaymentTransaction] Exception:",
          err?.code,
          err?.message,
        );
        throw err;
      }
    },
    onSuccess: async () => {
      // Invalidate all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance_transactions"] }),
        queryClient.invalidateQueries({
          queryKey: ["student_activity_balance"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["student_account_balances"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["dashboard"],
          exact: false,
        }),
      ]);
      await queryClient.refetchQueries({
        queryKey: ["dashboard"],
        exact: false,
      });
    },
    onError: (error) => {
      console.error("Error deleting payment transaction:", error);
      toast({
        title: "Помилка",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/** Fetch payment allocation for display (debts by activity/month, how payments distribute) */
export async function fetchPaymentAllocation(params: {
  studentId: string;
  month: number;
  year: number;
  accountId?: string | null;
  excludeActivityIds?: string[];
}): Promise<PaymentAllocationResult> {
  const {
    studentId,
    month,
    year,
    accountId,
    excludeActivityIds = [],
  } = params;
  const endDate = getMonthEndDate(year, month);
  const excludedSet = new Set(excludeActivityIds);

  const { data: enrollments, error: enrollError } = await supabaseAny
    .from("enrollments")
    .select("id, activity_id, account_id, effective_from, enrolled_at, custom_price, discount_percent, is_active, unenrolled_at")
    .eq("student_id", studentId);

  if (enrollError) throw enrollError;
  const allEnrollments = (enrollments || []).filter(
    (e: any) => !excludedSet.has(e.activity_id),
  );
  if (allEnrollments.length === 0) return { items: [], totalPaid: 0, totalRemaining: 0 };

  // Тільки поточний і попередній місяць (для боргів і нарахувань)
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const startDate = getMonthStartDate(prevYear, prevMonth);
  // Платежі — лише вибраного місяця, щоб «Розподіл» відповідав тому, що бачить користувач у таблиці оплат
  const paymentStart = getMonthStartDate(year, month);
  const paymentEnd = getMonthEndDate(year, month);

  const enrollmentIds = allEnrollments.map((e: any) => e.id);
  const activityIdSet = new Set(allEnrollments.map((e: any) => e.activity_id));
  const gardenTariffIds = await fetchGardenTariffActivityIds();
  gardenTariffIds.forEach((id) => activityIdSet.add(id));

  const [attendanceRes, paymentsRes, incomeRes, activitiesRes, baseTariffRes, priceHistoryRes] =
    await Promise.all([
    supabaseAny
      .from("attendance")
      .select("enrollment_id, charged_amount, date")
      .in("enrollment_id", enrollmentIds)
      .gte("date", startDate)
      .lte("date", endDate),
    supabaseAny
      .from("finance_transactions")
      .select("id, amount, date, allocation_activity_ids, account_id")
      .eq("student_id", studentId)
      .eq("type", "payment")
      .gte("date", paymentStart)
      .lte("date", paymentEnd),
    supabaseAny
      .from("finance_transactions")
      .select("activity_id, amount, date, account_id, description")
      .eq("student_id", studentId)
      .eq("type", "income")
      .not("activity_id", "is", null)
      .in("activity_id", Array.from(activityIdSet))
      .gte("date", startDate)
      .lte("date", endDate),
    supabaseAny
      .from("activities")
      .select("id, name, account_id, billing_rules, default_price")
      .in("id", Array.from(activityIdSet)),
    fetchAttendanceV1BaseTariffIds(),
    enrollmentIds.length > 0
      ? supabaseAny
          .from("enrollment_price_history")
          .select("*")
          .in("enrollment_id", enrollmentIds)
          .order("effective_from", { ascending: false })
      : Promise.resolve({ data: [] as EnrollmentPriceHistory[], error: null }),
  ]);
  const attendance = attendanceRes.data;
  const payments = paymentsRes.data;
  const activities = activitiesRes.data;
  const priceHistoryMap = new Map<string, EnrollmentPriceHistory[]>();
  ((priceHistoryRes as any)?.data || []).forEach((ph: EnrollmentPriceHistory) => {
    if (!priceHistoryMap.has(ph.enrollment_id)) priceHistoryMap.set(ph.enrollment_id, []);
    priceHistoryMap.get(ph.enrollment_id)!.push(ph);
  });
  const attendanceV1BaseTariffIdSet = baseTariffRes;
  const incomeTransactions = (incomeRes.data || []).filter(
    (inc: any) => !isAttendanceV1InfoIncome(inc, attendanceV1BaseTariffIdSet),
  );
  if (attendanceRes.error) throw attendanceRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (incomeRes.error) throw incomeRes.error;
  if (activitiesRes.error) throw activitiesRes.error;

  const activityAccountMap = new Map<string, string | null>();
  (activities || []).forEach((a: any) =>
    activityAccountMap.set(a.id, a.account_id ?? null),
  );
  // Якщо обрано рахунок — тільки записи та борги цього рахунка (не змішувати з іншими)
  const filteredEnrollments =
    accountId != null && accountId !== ""
      ? allEnrollments.filter(
          (e: any) =>
            (e.account_id ?? activityAccountMap.get(e.activity_id)) === accountId,
        )
      : allEnrollments;
  const activityIdSetFiltered = new Set(
    filteredEnrollments.map((e: any) => e.activity_id),
  );
  if (filteredEnrollments.length === 0)
    return { items: [], totalPaid: 0, totalRemaining: 0 };

  const enrollToActivity = new Map<string, string>();
  const enrollToAccount = new Map<string, string | null>();
  const enrollmentById = new Map<string, any>();
  filteredEnrollments.forEach((e: any) => {
    enrollToActivity.set(e.id, e.activity_id);
    const acc = e.account_id ?? activityAccountMap.get(e.activity_id) ?? null;
    enrollToAccount.set(e.id, acc);
    enrollmentById.set(e.id, e);
  });
  const activityNames = new Map<string, string>();
  (activities || []).forEach((a: any) => activityNames.set(a.id, a.name || a.id));

  const attendanceByKey = new Map<
    string,
    { activityId: string; accountId: string | null; amount: number }
  >();
  (attendance || []).forEach((att: any) => {
    const enrollment = enrollmentById.get(att.enrollment_id);
    if (!enrollment) return;
    const d = new Date(att.date);
    const m = d.getMonth();
    const y = d.getFullYear();
    const activityId = enrollToActivity.get(att.enrollment_id);
    const accountId = enrollToAccount.get(att.enrollment_id) ?? null;
    if (!activityId) return;
    const amt = att.charged_amount ?? 0;
    if (amt <= 0) return;
    // Don't apply enrollmentInScopeForMonth here: it checks enrollment.enrolled_at vs monthEnd
    // and incorrectly excludes retroactive attendance (enrollment created in a later month
    // but attendance explicitly recorded for an earlier month with charged_amount > 0).
    const key = `${activityId}|${accountId ?? "none"}|${y}|${m}`;
    const cur = attendanceByKey.get(key);
    attendanceByKey.set(key, {
      activityId,
      accountId,
      amount: (cur?.amount ?? 0) + amt,
    });
  });
  const enrollmentsByActivity = new Map<string, any[]>();
  filteredEnrollments.forEach((e: any) => {
    const list = enrollmentsByActivity.get(e.activity_id) || [];
    list.push(e);
    enrollmentsByActivity.set(e.activity_id, list);
  });
  const incomeByKey = new Map<
    string,
    { activityId: string; accountId: string | null; amount: number }
  >();
  (incomeTransactions || []).forEach((inc: any) => {
    const activityId = inc.activity_id;
    if (!activityId || !activityIdSetFiltered.has(activityId)) return;
    const d = new Date(inc.date);
    const m = d.getMonth();
    const y = d.getFullYear();
    // Skip if no enrollment exists for this activity at all (student was never enrolled)
    const list = enrollmentsByActivity.get(activityId) || [];
    if (list.length === 0) return;
    // Don't apply enrollmentInScopeForMonth: it excludes retroactive income transactions
    // when the enrollment was created after the transaction date (e.g. backdated attendance).
    const amt = inc.amount ?? 0;
    if (amt <= 0) return;
    const accountId =
      inc.account_id ?? activityAccountMap.get(activityId) ?? null;
    const key = `${activityId}|${accountId ?? "none"}|${y}|${m}`;
    const cur = incomeByKey.get(key);
    incomeByKey.set(key, {
      activityId,
      accountId,
      amount: (cur?.amount ?? 0) + amt,
    });
  });

  // У розподілі — тільки фактичні нарахування: з журналу відвідувань (attendance) або з доходів (income). Тариф з активності не використовуємо.
  const allKeys = new Set([
    ...attendanceByKey.keys(),
    ...incomeByKey.keys(),
  ]);
  const debtByKey = new Map<
    string,
    { activityId: string; accountId: string | null; amount: number }
  >();
  allKeys.forEach((key) => {
    const att = attendanceByKey.get(key);
    const inc = incomeByKey.get(key);
    const incomeAmt = inc?.amount ?? 0;
    const attendanceAmt = att?.amount ?? 0;
    const amount = incomeAmt > 0 ? incomeAmt : attendanceAmt;
    if (amount <= 0) return;
    const src = inc ?? att!;
    debtByKey.set(key, { ...src, amount });
  });

  const debts: DebtEntry[] = Array.from(debtByKey.entries())
    .filter(([key, { activityId, accountId }]) => {
      const parts = key.split("|");
      const y = Number(parts[2]);
      const m = Number(parts[3]);
      const acc = accountId ?? null;
      // Only require that an enrollment for this activity/account exists —
      // don't apply enrollmentInScopeForMonth, which would filter out retroactive
      // charges (enrollment created in a later month, attendance backdated).
      const hasEnrollment = filteredEnrollments.some((e: any) => {
        if (e.activity_id !== activityId) return false;
        const eAcc = e.account_id ?? activityAccountMap.get(e.activity_id) ?? null;
        return (eAcc ?? "none") === (acc ?? "none");
      });
      return hasEnrollment;
    })
    .map(([key, { activityId, accountId, amount }]) => {
      const parts = key.split("|");
      const y = Number(parts[2]);
      const m = Number(parts[3]); // 0-based month
      return {
        activityId,
        activityName: activityNames.get(activityId) ?? activityId,
        accountId,
        month: m,
        year: y,
        amount,
      };
    });

  const paymentEntries: PaymentEntry[] = (payments || [])
    .filter((p: any) => (accountId == null || p.account_id === accountId) && (p.amount ?? 0) > 0)
    .map((p: any) => ({
      id: p.id,
      amount: p.amount ?? 0,
      date: p.date,
      allocationActivityIds: p.allocation_activity_ids ?? null,
      accountId: p.account_id ?? null,
    }));

  return computePaymentAllocationFromEntries(debts, paymentEntries);
}

export function usePaymentAllocation(params: {
  studentId: string;
  month: number;
  year: number;
  accountId?: string | null;
  excludeActivityIds?: string[];
  /** Не робити запит (коли показуємо розподіл по рахунках окремими запитами) */
  enabled?: boolean;
}) {
  const { enabled: enabledParam, ...rest } = params;
  return useQuery({
    queryKey: [
      "payment_allocation",
      rest.studentId,
      rest.month,
      rest.year,
      rest.accountId,
      rest.excludeActivityIds,
    ],
    queryFn: () => fetchPaymentAllocation(rest),
    enabled:
      enabledParam !== false &&
      !!rest.studentId &&
      rest.month >= 0 &&
      rest.month <= 11 &&
      rest.year > 0,
  });
}

// Get income transaction for activity and month (for subscription charges)
export function useActivityIncomeTransaction(
  studentId: string,
  activityId: string,
  month?: number,
  year?: number,
) {
  return useQuery({
    queryKey: [
      "activity_income_transaction",
      studentId,
      activityId,
      month,
      year,
    ],
    queryFn: async () => {
      const now = new Date();
      const targetMonth = month !== undefined ? month : now.getMonth();
      const targetYear = year !== undefined ? year : now.getFullYear();

      const startDate = getMonthStartDate(targetYear, targetMonth);
      const endDate = getMonthEndDate(targetYear, targetMonth);

      // First, try to find transaction for the specific month
      const { data: initialData, error } = await supabaseAny
        .from("finance_transactions")
        .select("*")
        .eq("student_id", studentId)
        .eq("activity_id", activityId)
        .eq("type", "income")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[useActivityIncomeTransaction] Error:", error);
        throw error;
      }

      // Повертаємо тільки транзакцію з обраного місяця. Якщо нарахування видалено (корзина),
      // initialData = null, і рядок коректно покаже 0. Fallback на "будь-яку" транзакцію з іншого
      // місяця ламав це — hasIncomeTransaction був true, рядок показував charge замість 0.
      return initialData as FinanceTransaction | null;
    },
    enabled:
      !!studentId && !!activityId && month !== undefined && year !== undefined,
  });
}

// Add subscription charge exclusion (when user clicks trash — exclude from «Нараховано на початок»)
export function useAddSubscriptionChargeExclusion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      enrollmentId,
      year,
      month,
    }: {
      enrollmentId: string;
      year: number;
      month: number;
    }) => {
      const { data, error } = await supabaseAny
        .from("subscription_charge_exclusions")
        .insert({ enrollment_id: enrollmentId, year, month })
        .select("id")
        .single();

      if (error) {
        if (error.code === "23505") return { id: null }; // unique violation = already excluded
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student_account_balances"] });
      queryClient.invalidateQueries({ queryKey: ["student_total_balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"], exact: false });
    },
  });
}

// Delete income transaction (for subscription charges)
export function useDeleteIncomeTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      transactionId,
      reason,
    }: {
      transactionId: string;
      reason: string;
    }) => {
      // Get transaction details before deletion for logging
      const { data: transaction, error: fetchError } = await supabaseAny
        .from("finance_transactions")
        .select("*")
        .eq("id", transactionId)
        .eq("type", "income")
        .single();

      if (fetchError) throw fetchError;
      if (!transaction) throw new Error("Transaction not found");

      // Delete the transaction
      const { error: deleteError } = await supabaseAny
        .from("finance_transactions")
        .delete()
        .eq("id", transactionId);

      if (deleteError) throw deleteError;

      return transaction;
    },
    onSuccess: async (transaction) => {
      // Invalidate all related queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance_transactions"] }),
        queryClient.invalidateQueries({
          queryKey: ["activity_income_transaction"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["student_activity_balance"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["student_activity_monthly_balance"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["student_account_balances"],
        }),
        queryClient.invalidateQueries({ queryKey: ["student_total_balance"] }),
        queryClient.invalidateQueries({
          queryKey: ["dashboard"],
          exact: false,
        }),
      ]);

      // Refetch queries for the specific student and activity if we have transaction data
      if (transaction?.student_id && transaction?.activity_id) {
        // Get month and year from transaction date
        const transactionDate = new Date(transaction.date);
        const month = transactionDate.getMonth();
        const year = transactionDate.getFullYear();

        await Promise.all([
          queryClient.refetchQueries({
            queryKey: [
              "student_activity_balance",
              transaction.student_id,
              transaction.activity_id,
              month,
              year,
            ],
          }),
          queryClient.refetchQueries({
            queryKey: ["student_activity_monthly_balance"],
            predicate: (query) => {
              const key = query.queryKey;
              return (
                key[1] === transaction.student_id &&
                key[2] === transaction.activity_id
              );
            },
          }),
          queryClient.refetchQueries({
            queryKey: [
              "student_account_balances",
              transaction.student_id,
              month,
              year,
            ],
          }),
        ]);
      }

      await queryClient.refetchQueries({
        queryKey: ["dashboard"],
        exact: false,
      });
    },
    onError: (error) => {
      console.error("Error deleting income transaction:", error);
      toast({
        title: "Помилка",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Recalculate all subscription income transactions for a student/month.
// - Active enrollments with subscription billing: delete if wrong amount, recreate with correct amount.
// - Archived-before-month enrollments: delete income transaction + add exclusion.
export function useRecalculateMonthlyCharges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      studentId,
      month,
      year,
    }: {
      studentId: string;
      month: number;
      year: number;
      reason: string;
    }) => {
      const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const monthEndDateStr = monthEnd;

      // 1. Fetch all enrollments for this student
      const { data: enrollments, error: eErr } = await supabaseAny
        .from("enrollments")
        .select("id, activity_id, account_id, is_active, unenrolled_at, custom_price, discount_percent, enrolled_at, effective_from")
        .eq("student_id", studentId);
      if (eErr) throw eErr;
      if (!enrollments?.length) return 0;

      const enrollmentIds = enrollments.map((e: any) => e.id);
      const activityIds = [...new Set(enrollments.map((e: any) => e.activity_id as string))];

      // 2. Fetch price history, account history, activities, activity price history in parallel
      const [
        { data: priceHistoryRows, error: phErr },
        { data: accountHistoryRows, error: ahErr },
        { data: activities, error: actErr },
        { data: activityPriceHistoryRows, error: aphErr },
      ] = await Promise.all([
        supabaseAny
          .from("enrollment_price_history")
          .select("*")
          .in("enrollment_id", enrollmentIds)
          .order("effective_from", { ascending: false }),
        supabaseAny
          .from("enrollment_account_history")
          .select("*")
          .in("enrollment_id", enrollmentIds)
          .order("effective_from", { ascending: false }),
        supabaseAny
          .from("activities")
          .select("id, account_id, billing_rules, default_price, config, payment_type")
          .in("id", activityIds),
        supabaseAny
          .from("activity_price_history")
          .select("*")
          .in("activity_id", activityIds)
          .order("effective_from", { ascending: false }),
      ]);
      if (phErr) throw phErr;
      if (ahErr) throw ahErr;
      if (actErr) throw actErr;
      if (aphErr) throw aphErr;

      // Build lookup maps
      const priceHistoryMap = new Map<string, any[]>();
      (priceHistoryRows ?? []).forEach((ph: any) => {
        if (!priceHistoryMap.has(ph.enrollment_id)) priceHistoryMap.set(ph.enrollment_id, []);
        priceHistoryMap.get(ph.enrollment_id)!.push(ph);
      });
      const accountHistoryMap = new Map<string, any[]>();
      (accountHistoryRows ?? []).forEach((ah: any) => {
        if (!accountHistoryMap.has(ah.enrollment_id)) accountHistoryMap.set(ah.enrollment_id, []);
        accountHistoryMap.get(ah.enrollment_id)!.push(ah);
      });
      const activityMap = new Map<string, any>((activities ?? []).map((a: any) => [a.id, a]));
      const activityPriceHistoryMap = new Map<string, any[]>();
      (activityPriceHistoryRows ?? []).forEach((aph: any) => {
        if (!activityPriceHistoryMap.has(aph.activity_id)) activityPriceHistoryMap.set(aph.activity_id, []);
        activityPriceHistoryMap.get(aph.activity_id)!.push(aph);
      });

      const monthStartDate = new Date(year, month, 1);
      let changedCount = 0;

      // Build sets of garden activity IDs:
      // - gardenSkipIds: controller + base tariff → skip entirely (managed by garden journal)
      // - gardenFoodIds: food tariff → delete any spurious income txs, but don't create new ones
      const gardenSkipIds = new Set<string>();
      const gardenFoodIds = new Set<string>();
      (activities ?? []).forEach((act: any) => {
        if (isGardenAttendanceController(act)) {
          gardenSkipIds.add(act.id);
          const config = getGardenAttendanceConfig(act);
          (config.base_tariff_ids || []).forEach((id: string) => gardenSkipIds.add(id));
          (config.food_tariff_ids || []).forEach((id: string) => gardenFoodIds.add(id));
        }
      });

      for (const enrollment of (enrollments as any[])) {
        if (gardenSkipIds.has(enrollment.activity_id)) continue;

        // Food tariff activities: clean up any spurious income txs left by previous bugs, then skip.
        // Their expense txs (food returns for absences) are managed by GardenAttendanceJournal.
        if (gardenFoodIds.has(enrollment.activity_id)) {
          await supabaseAny
            .from("finance_transactions")
            .delete()
            .eq("student_id", studentId)
            .eq("activity_id", enrollment.activity_id)
            .eq("type", "income")
            .gte("date", monthStart)
            .lte("date", monthEnd);
          continue;
        }

        const activity = activityMap.get(enrollment.activity_id);
        if (!activity) continue;

        // Monthly billing = subscription payment type (one income tx per month).
        // Per-visit activities (payment_type = 'per_session') use attendance-based logic
        // regardless of what billing rule type their present rule uses.
        const isMonthlyBilling = activity.payment_type === "subscription";

        const unenrolledDate = enrollment.unenrolled_at ? new Date(enrollment.unenrolled_at) : null;
        const isActiveInMonth = !unenrolledDate || unenrolledDate >= monthStartDate;

        // Delete ALL income txs for this activity this month (always, for all billing types)
        const { error: delAllErr } = await supabaseAny
          .from("finance_transactions")
          .delete()
          .eq("student_id", studentId)
          .eq("activity_id", enrollment.activity_id)
          .eq("type", "income")
          .gte("date", monthStart)
          .lte("date", monthEnd);
        if (delAllErr) throw delAllErr;

        if (isMonthlyBilling) {
          // ── Subscription / fixed: one income tx per month ──

          if (!isActiveInMonth) {
            const { error: exErr } = await supabaseAny
              .from("subscription_charge_exclusions")
              .upsert(
                { enrollment_id: enrollment.id, year, month },
                { onConflict: "enrollment_id,year,month" },
              );
            if (exErr) throw exErr;
            changedCount++;
            continue;
          }

          const priceForDate = getEnrollmentPriceForDate(
            enrollment,
            priceHistoryMap.get(enrollment.id),
            monthEndDateStr,
          );

          let correctAmount = 0;
          if (priceForDate.custom_price !== null && priceForDate.custom_price !== undefined) {
            const discountMultiplier = 1 - (priceForDate.discount_percent || 0) / 100;
            correctAmount = Math.round(priceForDate.custom_price * discountMultiplier * 100) / 100;
          } else if (presentRule?.rate && presentRule.rate > 0) {
            correctAmount = presentRule.rate;
          } else {
            correctAmount = activity.default_price || 0;
          }

          // Remove exclusion — enrollment is active, we will (re)create the tx
          await supabaseAny
            .from("subscription_charge_exclusions")
            .delete()
            .eq("enrollment_id", enrollment.id)
            .eq("year", year)
            .eq("month", month);

          if (correctAmount <= 0) {
            const { error: exErr } = await supabaseAny
              .from("subscription_charge_exclusions")
              .upsert(
                { enrollment_id: enrollment.id, year, month },
                { onConflict: "enrollment_id,year,month" },
              );
            if (exErr) throw exErr;
            changedCount++;
            continue;
          }

          const resolvedAccountId =
            getEnrollmentAccountForDate(
              { account_id: enrollment.account_id ?? null },
              accountHistoryMap.get(enrollment.id),
              monthEndDateStr,
            ) ?? activity.account_id ?? null;

          const { error: insErr } = await supabaseAny
            .from("finance_transactions")
            .insert({
              type: "income",
              student_id: studentId,
              activity_id: enrollment.activity_id,
              account_id: resolvedAccountId,
              amount: correctAmount,
              date: monthStart,
              description: null,
              category: null,
              staff_id: null,
            });
          if (insErr) throw insErr;
          changedCount++;
        } else {
          // ── Attendance-based billing (per_visit, custom_statuses) ──

          // Clear any stale exclusion — attendance-based activities are never excluded
          await supabaseAny
            .from("subscription_charge_exclusions")
            .delete()
            .eq("enrollment_id", enrollment.id)
            .eq("year", year)
            .eq("month", month);

          if (!isActiveInMonth) {
            changedCount++;
            continue;
          }

          const { data: attendanceRows, error: attErr } = await supabaseAny
            .from("attendance")
            .select("id, enrollment_id, date, status, charged_amount, value, notes, manual_value_edit")
            .eq("enrollment_id", enrollment.id)
            .gte("date", monthStart)
            .lte("date", monthEnd)
            .order("date", { ascending: true });
          if (attErr) throw attErr;
          if (!attendanceRows?.length) continue;

          const resolvedAccountId =
            getEnrollmentAccountForDate(
              { account_id: enrollment.account_id ?? null },
              accountHistoryMap.get(enrollment.id),
              monthEndDateStr,
            ) ?? activity.account_id ?? null;

          const visitCountByStatus = new Map<string, number>();

          for (const record of attendanceRows as any[]) {
            // Track visitCountBefore for subscription_with_logic BEFORE any skip —
            // manually edited records still count as visits for subsequent records
            let visitCountBefore = 0;
            if (record.status !== null) {
              const csForCount = activity.billing_rules?.custom_statuses?.find(
                (cs: any) =>
                  cs.id === record.status &&
                  cs.is_active !== false &&
                  cs.type === "subscription_with_logic",
              );
              if (csForCount) {
                visitCountBefore = visitCountByStatus.get(record.status) || 0;
                visitCountByStatus.set(record.status, visitCountBefore + 1);
              }
            }

            let newValue: number | null = null;
            let chargedAmount = 0;
            let recalculated = false;

            if (record.manual_value_edit) {
              // Preserve manually edited amount — recreate income tx with existing value
              chargedAmount = record.charged_amount ?? 0;
              newValue = record.value ?? null;
            } else if (record.status === null) {
              newValue = record.value ?? null;
              chargedAmount = newValue !== null ? newValue : 0;
              recalculated = true;
            } else {
              const result = calculateAttendanceChargeForRecalc({
                date: record.date,
                status: record.status,
                enrollment: {
                  custom_price: enrollment.custom_price,
                  discount_percent: enrollment.discount_percent,
                },
                activity,
                activityPriceHistory: activityPriceHistoryMap.get(enrollment.activity_id),
                enrollmentPriceHistory: priceHistoryMap.get(enrollment.id),
                visitCountBefore,
              });
              newValue = result.value;
              chargedAmount = result.chargedAmount;
              recalculated = true;
            }

            // Update attendance.charged_amount only for recalculated records
            if (recalculated && ((record.charged_amount ?? 0) !== chargedAmount || record.value !== newValue)) {
              await supabaseAny
                .from("attendance")
                .update({ charged_amount: chargedAmount, value: newValue, manual_value_edit: false })
                .eq("enrollment_id", enrollment.id)
                .eq("date", record.date);
            }

            // Always recreate income tx if charged (covers manual + recalculated)
            if (chargedAmount > 0) {
              const { error: insErr } = await supabaseAny.from("finance_transactions").insert({
                type: "income",
                student_id: studentId,
                activity_id: enrollment.activity_id,
                account_id: resolvedAccountId,
                amount: chargedAmount,
                date: record.date,
                description: "Нарахування за відвідування",
                attendance_id: record.id,
              });
              if (insErr) throw insErr;
            }
            changedCount++;
          }
        }
      }

      return changedCount;
    },
    onSuccess: (_count, vars) => {
      queryClient.invalidateQueries({ queryKey: ["finance_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["activity_income_transaction"] });
      queryClient.invalidateQueries({ queryKey: ["student_activity_balance"] });
      queryClient.invalidateQueries({ queryKey: ["student_activity_monthly_balance"] });
      queryClient.invalidateQueries({
        queryKey: ["student_account_balances", vars.studentId, vars.month, vars.year],
      });
      queryClient.invalidateQueries({ queryKey: ["student_total_balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}
