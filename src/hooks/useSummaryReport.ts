import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getMonthStartDate, getMonthEndDate } from '@/lib/attendance';
import {
  enrollmentInScopeForMonth,
  getEnrollmentPriceForDate,
  type EnrollmentPriceHistory,
} from '@/hooks/useEnrollments';

export interface SummaryReportData {
  incomeTotal: number;
  incomeDetails: Array<{
    activity_id: string;
    activity_name: string;
    account_id: string | null;
    account_name: string | null;
    amount: number; // charges - refunds
    charges: number;
    refunds: number;
  }>;
  salaryTotal: number;
  salaryDetails: Array<{
    staff_id: string;
    staff_name: string;
    activity_id: string | null;
    activity_name: string | null;
    amount: number;
    count: number;
  }>;
  expensesTotal: number;
  expensesDetails: Array<{
    category_id: string | null;
    category_name: string | null;
    activity_id: string | null;
    activity_name: string | null;
    account_id: string | null;
    account_name: string | null;
    amount: number;
    count: number;
  }>;
}

interface UseSummaryReportDataParams {
  year: number;
  month: number;
  cumulative: boolean;
  accountId?: string;
  activityId?: string;
  categoryId?: string;
}

// Helper: calculate income for all students using the same monthly balance rules as student cards
async function calculateIncomeForPeriod(
  startDate: string | undefined,
  endDate: string,
  accountId?: string,
  activityId?: string
): Promise<Map<string, { charges: number; refunds: number; activity_name: string; account_name: string | null }>> {
  const resultMap = new Map<string, { charges: number; refunds: number; activity_name: string; account_name: string | null }>();

  // Get all students
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id')
    .limit(10000);

  if (studentsError) throw studentsError;
  if (!students || students.length === 0) return resultMap;

  // Get all activities for account_id mapping
  const { data: activities, error: activitiesError } = await supabase
    .from('activities')
    .select('id, name, account_id, billing_rules, default_price, balance_display_mode');

  if (activitiesError) throw activitiesError;
  const activityMap = new Map<string, any>();
  const activityAccountMap = new Map<string, string | null>();
  (activities || []).forEach((activity: any) => {
    activityMap.set(activity.id, activity);
    activityAccountMap.set(activity.id, activity.account_id || null);
  });

  // Get payment accounts for names
  const { data: accounts, error: accountsError } = await supabase
    .from('payment_accounts')
    .select('id, name');

  if (accountsError) throw accountsError;
  const accountMap = new Map<string, string>();
  (accounts || []).forEach((account: any) => {
    accountMap.set(account.id, account.name);
  });

  const endDateObj = new Date(endDate);
  const targetMonth = endDateObj.getMonth();
  const targetYear = endDateObj.getFullYear();
  const monthEndDateStr = getMonthEndDate(targetYear, targetMonth);
  const now = new Date();
  const isFutureMonth =
    targetYear > now.getFullYear() ||
    (targetYear === now.getFullYear() && targetMonth > now.getMonth());

  // Process each student
  for (const student of students) {
    // Get enrollments for this student
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('enrollments')
      .select('id, activity_id, custom_price, discount_percent, account_id, is_active, unenrolled_at, enrolled_at, effective_from')
      .eq('student_id', student.id);

    if (enrollmentsError) throw enrollmentsError;
    if (!enrollments || enrollments.length === 0) continue;

    const allEnrollmentIds = enrollments.map((e: any) => e.id);
    let priceHistoryMap = new Map<string, EnrollmentPriceHistory[]>();
    if (allEnrollmentIds.length > 0) {
      const { data: historyRows, error: historyError } = await supabase
        .from('enrollment_price_history')
        .select('*')
        .in('enrollment_id', allEnrollmentIds)
        .order('effective_from', { ascending: false });
      if (historyError) throw historyError;
      (historyRows || []).forEach((row: EnrollmentPriceHistory) => {
        if (!priceHistoryMap.has(row.enrollment_id)) priceHistoryMap.set(row.enrollment_id, []);
        priceHistoryMap.get(row.enrollment_id)!.push(row);
      });
    }

    let filteredEnrollments: any[];
    if (startDate) {
      filteredEnrollments = enrollments.filter((e: any) => {
        const activity = activityMap.get(e.activity_id);
        const history = priceHistoryMap.get(e.id);
        return enrollmentInScopeForMonth(
          e,
          activity ?? null,
          history,
          targetYear,
          targetMonth,
        );
      });
    } else {
      filteredEnrollments = enrollments.filter((e: any) => {
        const effectiveDate = (e.effective_from ?? e.enrolled_at) ? new Date(e.effective_from ?? e.enrolled_at) : null;
        const unenrolledDate = e.unenrolled_at ? new Date(e.unenrolled_at) : null;

        if (effectiveDate && effectiveDate > endDateObj) return false;
        if (e.is_active === true) return true;
        if (e.is_active === false && unenrolledDate) return unenrolledDate <= endDateObj;
        return false;
      });
    }

    if (isFutureMonth) {
      filteredEnrollments = filteredEnrollments.filter((e: any) => e.is_active === true);
    }

    // Apply activity filter
    if (activityId) {
      filteredEnrollments = filteredEnrollments.filter((e: any) => e.activity_id === activityId);
    }

    if (filteredEnrollments.length === 0) continue;

    const enrollmentIds = filteredEnrollments.map((e: any) => e.id);
    const enrollmentActivityMap = new Map<string, string>();
    const enrollmentAccountMap = new Map<string, string | null>();
    const enrollmentDataMap = new Map<string, {
      activity_id: string;
      custom_price: number | null;
      discount_percent: number | null;
      account_id: string | null;
      is_active: boolean;
    }>();
    const enrollmentById = new Map<string, any>();
    const activityIds = new Set<string>();

    filteredEnrollments.forEach((enrollment: any) => {
      enrollmentActivityMap.set(enrollment.id, enrollment.activity_id);
      enrollmentAccountMap.set(enrollment.id, enrollment.account_id);
      enrollmentById.set(enrollment.id, enrollment);
      enrollmentDataMap.set(enrollment.id, {
        activity_id: enrollment.activity_id,
        custom_price: enrollment.custom_price ?? null,
        discount_percent: enrollment.discount_percent ?? null,
        account_id: enrollment.account_id ?? null,
        is_active: enrollment.is_active ?? true,
      });
      activityIds.add(enrollment.activity_id);
    });

    // Get attendance data
    let attendanceData: { enrollment_id: string; charged_amount: number | null }[] = [];
    if (enrollmentIds.length > 0) {
      const attendanceQuery = supabase
        .from('attendance')
        .select('enrollment_id, charged_amount')
        .in('enrollment_id', enrollmentIds);
      
      if (startDate) {
        attendanceQuery.gte('date', startDate);
      }
      attendanceQuery.lte('date', endDate);

      const { data: attendance, error: attendanceError } = await attendanceQuery;
      if (attendanceError) throw attendanceError;
      attendanceData = attendance || [];
    }

    // Get transactions
    const transactionsQuery = supabase
      .from('finance_transactions')
      .select('activity_id, type, amount')
      .eq('student_id', student.id)
      .not('student_id', 'is', null)
      .in('type', ['income', 'expense']);

    if (startDate) {
      transactionsQuery.gte('date', startDate);
    }
    transactionsQuery.lte('date', endDate);

    const { data: transactions, error: transactionsError } = await transactionsQuery;
    if (transactionsError) throw transactionsError;

    // Process transactions and attendance
    const incomeByActivity: Record<string, number> = {};
    const expenseByActivity: Record<string, number> = {};
    const attendanceByActivity: Record<string, number> = {};

    (transactions || []).forEach((trans: any) => {
      if (!trans.activity_id || !activityIds.has(trans.activity_id)) return;
      if (trans.type === 'income') {
        incomeByActivity[trans.activity_id] = (incomeByActivity[trans.activity_id] || 0) + (trans.amount || 0);
      } else if (trans.type === 'expense') {
        expenseByActivity[trans.activity_id] = (expenseByActivity[trans.activity_id] || 0) + (trans.amount || 0);
      }
    });

    attendanceData.forEach((att) => {
      const activityId = enrollmentActivityMap.get(att.enrollment_id);
      if (!activityId) return;
      attendanceByActivity[activityId] = (attendanceByActivity[activityId] || 0) + (att.charged_amount || 0);
    });

    // Calculate charges for each activity using the same monthly balance rules
    const monthlyChargesByActivity: Record<string, number> = {};
    const displayModeByActivity: Record<string, 'subscription' | 'recalculation' | 'subscription_and_recalculation'> = {};
    const enrollmentIsActiveMap = new Map<string, boolean>();

    filteredEnrollments.forEach((enrollment: any) => {
      enrollmentIsActiveMap.set(enrollment.id, enrollment.is_active);
    });

    enrollmentDataMap.forEach((enrollment, enrollmentId) => {
      const activity = activityMap.get(enrollment.activity_id);
      if (!activity) return;
      const presentRule = activity.billing_rules?.present;
      const isMonthlyBilling = presentRule?.type === 'fixed' || presentRule?.type === 'subscription';
      const fallbackMode = isMonthlyBilling ? 'subscription' : 'recalculation';
      displayModeByActivity[enrollment.activity_id] = (activity.balance_display_mode as any) || fallbackMode;
      
      if (!isMonthlyBilling) return;
      const isActive = enrollmentIsActiveMap.get(enrollmentId) ?? true;
      if (!isActive) return;

      let baseMonthlyCharge = 0;
      const enrollmentSource = enrollmentById.get(enrollmentId) || enrollment;
      const history = priceHistoryMap.get(enrollmentId);
      const priceForDate = getEnrollmentPriceForDate(
        enrollmentSource,
        history,
        monthEndDateStr,
      );
      if (priceForDate.custom_price !== null && priceForDate.custom_price !== undefined) {
        const discountMultiplier = 1 - ((priceForDate.discount_percent || 0) / 100);
        baseMonthlyCharge = Math.round(priceForDate.custom_price * discountMultiplier * 100) / 100;
      } else if (presentRule?.rate && presentRule.rate > 0) {
        baseMonthlyCharge = presentRule.rate;
      } else {
        baseMonthlyCharge = activity.default_price || 0;
      }

      monthlyChargesByActivity[enrollment.activity_id] =
        (monthlyChargesByActivity[enrollment.activity_id] || 0) + baseMonthlyCharge;
    });

    // Calculate charges and refunds per activity and account
    activityIds.forEach((activityId) => {
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

      // Group by account_id (COALESCE(enrollment.account_id, activity.account_id))
      const enrollmentsForActivityList = enrollmentsForActivity.map(([eId, data]) => ({ eId, data }));
      
      if (enrollmentsForActivityList.length === 0) {
        // No enrollments, use activity account_id
        const finalAccountId = activityAccountMap.get(activityId) ?? null;
        if (accountId && finalAccountId !== accountId) return; // Apply account filter
        
        const key = `${activityId}-${finalAccountId || 'null'}`;
        const existing = resultMap.get(key) || {
          charges: 0,
          refunds: 0,
          activity_name: activityMap.get(activityId)?.name || 'Невідома активність',
          account_name: finalAccountId ? accountMap.get(finalAccountId) || null : null,
        };
        resultMap.set(key, {
          charges: existing.charges + charges,
          refunds: existing.refunds + refunds,
          activity_name: existing.activity_name,
          account_name: existing.account_name,
        });
      } else {
        // Distribute charges and refunds per enrollment
        const perEnrollmentCharges = charges / enrollmentsForActivityList.length;
        const perEnrollmentRefunds = refunds / enrollmentsForActivityList.length;

        enrollmentsForActivityList.forEach(({ eId, data }) => {
          const finalAccountId = data.account_id ?? activityAccountMap.get(data.activity_id) ?? null;
          
          // Apply account filter
          if (accountId && finalAccountId !== accountId) return;
          
          const key = `${activityId}-${finalAccountId || 'null'}`;
          const existing = resultMap.get(key) || {
            charges: 0,
            refunds: 0,
            activity_name: activityMap.get(activityId)?.name || 'Невідома активність',
            account_name: finalAccountId ? accountMap.get(finalAccountId) || null : null,
          };
          resultMap.set(key, {
            charges: existing.charges + perEnrollmentCharges,
            refunds: existing.refunds + perEnrollmentRefunds,
            activity_name: existing.activity_name,
            account_name: existing.account_name,
          });
        });
      }
    });
  }

  return resultMap;
}

export function useSummaryReportData({
  year,
  month,
  cumulative,
  accountId,
  activityId,
  categoryId,
}: UseSummaryReportDataParams) {
  return useQuery({
    queryKey: ['summary-report', year, month, cumulative, accountId, activityId, categoryId],
    queryFn: async (): Promise<SummaryReportData> => {
      // Calculate date range
      let startDate: string | undefined;
      const endDate = getMonthEndDate(year, month);

      if (cumulative) {
        // For cumulative: from beginning of time to end of selected month
        startDate = undefined;
      } else {
        // For monthly: only selected month
        startDate = getMonthStartDate(year, month);
      }

      // Calculate income using the same logic as student balance cards
      const incomeMap = await calculateIncomeForPeriod(startDate, endDate, accountId, activityId);

      // Convert to incomeDetails array
      const incomeDetails = Array.from(incomeMap.entries()).map(([key, value]) => {
        const [activity_id, account_id] = key.split('-');
        return {
          activity_id,
          activity_name: value.activity_name,
          account_id: account_id === 'null' ? null : account_id,
          account_name: value.account_name,
          amount: value.charges - value.refunds, // Доход = charges - refunds
          charges: value.charges,
          refunds: value.refunds,
        };
      });

      // Apply account filter to incomeDetails
      let filteredIncomeDetails = incomeDetails;
      if (accountId) {
        filteredIncomeDetails = incomeDetails.filter(d => d.account_id === accountId);
      }

      const incomeTotal = filteredIncomeDetails.reduce((sum, d) => sum + d.amount, 0);

      // Get salary data (unchanged)
      const salaryQuery = supabase
        .from('staff_journal_entries' as any)
        .select(`
          amount,
          staff_id,
          activity_id,
          staff (
            id,
            full_name
          ),
          activities (
            id,
            name
          )
        `);

      if (startDate) {
        salaryQuery.gte('date', startDate);
      }
      salaryQuery.lte('date', endDate);

      const { data: salaryResult, error: salaryError } = await salaryQuery.range(0, 99999);
      if (salaryError) throw salaryError;

      // Process salary data
      const salaryMap = new Map<string, { 
        amount: number; 
        count: number; 
        staff_name: string;
        activity_name: string | null;
      }>();
      let salaryTotal = 0;

      (salaryResult.data || []).forEach((item: any) => {
        const key = `${item.staff_id}-${item.activity_id || 'none'}`;
        const existing = salaryMap.get(key) || { 
          amount: 0, 
          count: 0, 
          staff_name: item.staff?.full_name || 'Невідомий',
          activity_name: item.activities?.name || null,
        };
        salaryMap.set(key, {
          amount: existing.amount + (item.amount || 0),
          count: existing.count + 1,
          staff_name: item.staff?.full_name || existing.staff_name,
          activity_name: item.activities?.name || existing.activity_name,
        });
        salaryTotal += item.amount || 0;
      });

      const salaryDetails = Array.from(salaryMap.entries()).map(([key, value]) => {
        const [staff_id, activity_id] = key.split('-');
        return {
          staff_id,
          staff_name: value.staff_name,
          activity_id: activity_id === 'none' ? null : activity_id,
          activity_name: value.activity_name,
          amount: value.amount,
          count: value.count,
        };
      });

      // Get expenses data (unchanged)
      const expensesQuery = supabase
        .from('finance_transactions' as any)
        .select(`
          amount,
          activity_id,
          account_id,
          expense_category_id,
          expense_categories (
            id,
            name
          ),
          activities!inner (
            id,
            name,
            category
          ),
          payment_accounts (
            id,
            name
          )
        `)
        .in('type', ['expense', 'household']);

      if (startDate) {
        expensesQuery.gte('date', startDate);
      }
      expensesQuery.lte('date', endDate);

      if (accountId) {
        expensesQuery.eq('account_id', accountId);
      }

      if (activityId) {
        expensesQuery.eq('activity_id', activityId);
      }

      if (categoryId) {
        expensesQuery.eq('expense_category_id', categoryId);
      }

      const { data: expensesResult, error: expensesError } = await expensesQuery.range(0, 99999);
      if (expensesError) throw expensesError;

      // Process expenses data
      const expensesMap = new Map<string, { 
        amount: number; 
        count: number; 
        category_name: string | null;
        activity_name: string | null;
        account_name: string | null;
      }>();
      let expensesTotal = 0;

      (expensesResult.data || []).forEach((item: any) => {
        const categoryKey = item.expense_category_id || 'none';
        const key = `${categoryKey}-${item.activity_id || 'none'}-${item.account_id || 'null'}`;
        const existing = expensesMap.get(key) || { 
          amount: 0, 
          count: 0, 
          category_name: item.expense_categories?.name || null,
          activity_name: item.activities?.name || null,
          account_name: item.payment_accounts?.name || null,
        };
        expensesMap.set(key, {
          amount: existing.amount + (item.amount || 0),
          count: existing.count + 1,
          category_name: item.expense_categories?.name || existing.category_name,
          activity_name: item.activities?.name || existing.activity_name,
          account_name: item.payment_accounts?.name || existing.account_name,
        });
        expensesTotal += item.amount || 0;
      });

      const expensesDetails = Array.from(expensesMap.entries()).map(([key, value]) => {
        const [category_id, activity_id, account_id] = key.split('-');
        return {
          category_id: category_id === 'none' ? null : category_id,
          category_name: value.category_name,
          activity_id: activity_id === 'none' ? null : activity_id,
          activity_name: value.activity_name,
          account_id: account_id === 'null' ? null : account_id,
          account_name: value.account_name,
          amount: value.amount,
          count: value.count,
        };
      });

      return {
        incomeTotal,
        incomeDetails: filteredIncomeDetails.sort((a, b) => b.amount - a.amount),
        salaryTotal,
        salaryDetails: salaryDetails.sort((a, b) => b.amount - a.amount),
        expensesTotal,
        expensesDetails: expensesDetails.sort((a, b) => b.amount - a.amount),
      };
    },
  });
}
