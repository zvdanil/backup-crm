import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchStudentAccountBalances } from '@/hooks/useFinanceTransactions';
import {
  getGardenAttendanceConfig,
  isGardenAttendanceController,
} from '@/lib/gardenAttendance';
import { getMonthStartDate, getMonthEndDate } from '@/lib/attendance';
import { fetchAllRows } from '@/lib/supabasePagination';

const supabaseAny = supabase as any;

export interface MonthlyFinancialData {
  month: string; // "2024-01"
  monthLabel: string; // "Січень 2024"
  projectedIncome: number; // Прогноз дохода
  projectedExpense: number; // Прогноз расхода
  actualIncome: number; // Реальный доход
  actualExpense: number; // Оборот по всім витратам (включно з дивідендами)
  transferExpense: number; // Перекази між рахунками
  businessExpense: number; // Реальні витрати: зарплата + журнали затрат (без дивідендів і виводу коштів)
  delta: number; // Реальний дохід − Реальні витрати
  dividendExpense: number; // Виведено дивідендів
  cashWithdrawal: number; // Вивід коштів (витрати з cash_withdrawal_id)
  expenseWithoutDividends: number; // Оборот по витратах без дівідендів
  expectedBalance: number; // projectedIncome - projectedExpense
  actualBalance: number; // actualIncome - actualExpense
  difference: number; // actualBalance - expectedBalance (не відображається)
  cumulativeDifference: number; // Накопичене відхилення (не відображається)
  accountBalance: number; // Залишок на рахунку (накопичений, з opening_balance)
  accountBalanceWithoutDividends: number; // Баланс без дивідендів (накопичений)
  initialBalance?: number; // Залишок на початок місяця (тільки для окремих рахунків)
}

interface UseFinancialSummaryReportParams {
  startYear: number;
  startMonth: number; // 0-11
  endYear: number;
  endMonth: number; // 0-11
  accountIds?: string[]; // Фильтр по счетам, если пусто - все счета
  enabled?: boolean; // false = не завантажувати автоматично при відкритті
}

const MONTHS_UA = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

export interface StudentBreakdownEntry {
  studentName: string;
  accountId: string | null;
  accountName: string;
  charges: number;
  refunds: number;
  net: number;
}

export interface ProjectedIncomeBreakdownRow {
  studentName: string;
  activityName: string;
  accountName: string;
  billingType: 'Абонплата' | 'Поурочно' | 'Повернення';
  monthsCharged: number;
  total: number;
}

const historyCoversMonth = (history: any[], year: number, month: number): boolean => {
  const monthStart = getMonthStartDate(year, month);
  const monthEnd = getMonthEndDate(year, month);

  return history.some((record: any) => {
    const effectiveFrom = record.effective_from as string | undefined;
    const effectiveTo = record.effective_to as string | null | undefined;
    if (!effectiveFrom) return false;

    // Price history interval intersects this month.
    if (effectiveFrom > monthEnd) return false;
    if (effectiveTo && effectiveTo <= monthStart) return false;
    return true;
  });
};

export function useProjectedIncomeBreakdown({
  startYear,
  startMonth,
  endYear,
  endMonth,
  accountIds,
  enabled = true,
}: UseFinancialSummaryReportParams) {
  return useQuery({
    queryKey: ['projected-income-breakdown', startYear, startMonth, endYear, endMonth, accountIds],
    enabled,
    queryFn: async (): Promise<ProjectedIncomeBreakdownRow[]> => {
      const reportStart = getMonthStartDate(startYear, startMonth);
      const reportEnd = getMonthEndDate(endYear, endMonth);

      const [
        { data: enrollmentsRaw },
        { data: accounts },
        attendanceData,
        refundData,
        { data: exclusionsRaw },
      ] = await Promise.all([
        supabaseAny
          .from('enrollments')
          .select(
            'id, student_id, activity_id, account_id, custom_price, is_active, unenrolled_at, enrolled_at, effective_from, students(full_name), activities(id, name, account_id, billing_rules, default_price, balance_display_mode, config)'
          ),
        supabaseAny.from('payment_accounts').select('id, name'),
        fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('attendance')
            .select('enrollment_id, charged_amount')
            .gte('date', reportStart)
            .lte('date', reportEnd)
            .range(from, to)
        ),
        fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('student_id, activity_id, amount, account_id, activities(id, name, account_id)')
            .eq('type', 'expense')
            .not('student_id', 'is', null)
            .gte('date', reportStart)
            .lte('date', reportEnd)
            .range(from, to)
        ),
        supabaseAny
          .from('subscription_charge_exclusions')
          .select('enrollment_id, year, month'),
      ]);

      const enrollments = enrollmentsRaw || [];
      const accountMap = new Map<string, string>(
        (accounts || []).map((a: any) => [String(a.id), String(a.name || '—')])
      );
      const buildRefundKey = (studentId: unknown, activityId: unknown) =>
        `${String(studentId)}|${activityId == null ? 'null' : String(activityId)}`;

      // Food tariff IDs from garden controllers
      const foodTariffIdSet = new Set<string>();
      enrollments.forEach((e: any) => {
        if (!isGardenAttendanceController(e.activities)) return;
        const cfg = getGardenAttendanceConfig(e.activities);
        (cfg.food_tariff_ids || []).forEach((id: string) => foodTariffIdSet.add(id));
      });

      // Enrollment price history
      const enrollmentIds = enrollments.map((e: any) => e.id as string);
      const priceHistoryMap = new Map<string, any[]>();
      if (enrollmentIds.length > 0) {
        const { data: phData } = await supabaseAny
          .from('enrollment_price_history')
          .select('enrollment_id, custom_price, effective_from, effective_to')
          .in('enrollment_id', enrollmentIds);
        (phData || []).forEach((ph: any) => {
          if (!priceHistoryMap.has(ph.enrollment_id)) priceHistoryMap.set(ph.enrollment_id, []);
          priceHistoryMap.get(ph.enrollment_id)!.push(ph);
        });
      }

      // Exclusions: "enrollmentId-year-month" (month 0-indexed у БД)
      const exclusionSet = new Set(
        (exclusionsRaw || []).map((ex: any) => `${ex.enrollment_id}-${ex.year}-${ex.month}`)
      );

      // Attendance sums by enrollment
      const attByEnrollment = new Map<string, number>();
      attendanceData.forEach((att: any) => {
        attByEnrollment.set(att.enrollment_id, (attByEnrollment.get(att.enrollment_id) || 0) + (att.charged_amount || 0));
      });

      // Refund sums by student+activity
      const refundByStudentActivity = new Map<string, number>();
      refundData.forEach((tx: any) => {
        const key = buildRefundKey(tx.student_id, tx.activity_id);
        refundByStudentActivity.set(key, (refundByStudentActivity.get(key) || 0) + (tx.amount || 0));
      });
      const addedRefundKeys = new Set<string>();
      const studentNameById = new Map<string, string>();
      const activityMetaById = new Map<string, { name: string; accountId: string | null }>();

      // Months in period
      const months: Array<{ year: number; month: number }> = [];
      for (let y = startYear; y <= endYear; y++) {
        const mStart = y === startYear ? startMonth : 0;
        const mEnd = y === endYear ? endMonth : 11;
        for (let m = mStart; m <= mEnd; m++) months.push({ year: y, month: m });
      }

      const matchesAccount = (accountId: string | null) => {
        if (!accountIds || accountIds.length === 0) return true;
        return accountId === null ? accountIds.includes('null') : accountIds.includes(accountId);
      };

      const getRateForMonthEnd = (enrollmentId: string, e: any, activity: any, monthEndStr: string): number => {
        const history = priceHistoryMap.get(enrollmentId);
        if (history && history.length > 0) {
          const rec = history.find((r: any) => {
            if (monthEndStr < r.effective_from) return false;
            if (r.effective_to && monthEndStr >= r.effective_to) return false;
            return true;
          });
          if (rec?.custom_price != null) return Number(rec.custom_price);
        }
        if (e.custom_price != null) return Number(e.custom_price);
        const rate = activity.billing_rules?.present?.rate;
        if (rate) return Number(rate);
        return Number(activity.default_price || 0);
      };

      const rows: ProjectedIncomeBreakdownRow[] = [];

      enrollments.forEach((e: any) => {
        const activity = e.activities;
        if (!activity) return;
        if (e.student_id) {
          const name =
            typeof e.students?.full_name === 'string' ? e.students.full_name : '—';
          studentNameById.set(String(e.student_id), name);
        }
        if (activity.id) {
          const activityName =
            typeof activity.name === 'string' ? activity.name : '—';
          const activityAccountId = activity.account_id ? String(activity.account_id) : null;
          activityMetaById.set(String(activity.id), { name: activityName, accountId: activityAccountId });
        }
        if (isGardenAttendanceController(activity)) return;

        const resolvedAccountId: string | null = e.account_id || activity.account_id || null;
        const studentName: string =
          typeof e.students?.full_name === 'string' ? e.students.full_name : '—';
        const activityName: string =
          typeof activity.name === 'string' ? activity.name : '—';
        const accountName: string = resolvedAccountId
          ? (accountMap.get(resolvedAccountId) ?? '—')
          : '— без рахунку —';
        const refund = refundByStudentActivity.get(buildRefundKey(e.student_id, activity.id)) || 0;
        if (refund > 0) {
          const refundKey = buildRefundKey(e.student_id, activity.id);
          if (!addedRefundKeys.has(refundKey)) {
            if (matchesAccount(resolvedAccountId)) {
              rows.push({ studentName, activityName, accountName, billingType: 'Повернення', monthsCharged: 0, total: -refund });
            }
            addedRefundKeys.add(refundKey);
          }
        }

        // For food tariffs we show only refunds in breakdown.
        if (foodTariffIdSet.has(activity.id)) return;

        if (!matchesAccount(resolvedAccountId)) return;

        const isSubscription = activity.billing_rules?.present?.type === 'subscription';

        const history = priceHistoryMap.get(e.id);
        const hasHistory = history && history.length > 0;

        if (isSubscription) {
          let total = 0;
          let monthsCharged = 0;

          for (const { year: yy, month: mm } of months) {
            const monthEndStr = getMonthEndDate(yy, mm);
            const monthStartStr = getMonthStartDate(yy, mm);

            if (hasHistory) {
              // Якщо є history — включати тільки якщо вона покриває місяць (точна логіка головного звіту)
              if (!historyCoversMonth(history, yy, mm)) continue;
              // Відрахований в цьому або попередньому місяці
              const isArchivedInMonth =
                e.is_active === false &&
                (!e.unenrolled_at || e.unenrolled_at <= monthEndStr);
              if (isArchivedInMonth) continue;
              if (e.unenrolled_at && e.unenrolled_at < monthStartStr) continue;
            } else {
              // Без history — по effective_from / enrolled_at (fallback логіка)
              const effectiveStr = e.effective_from ?? e.enrolled_at ?? null;
              if (effectiveStr && monthEndStr < effectiveStr) continue;
              const isArchivedInMonth =
                e.is_active === false &&
                (!e.unenrolled_at || e.unenrolled_at <= monthEndStr);
              if (isArchivedInMonth) continue;
              if (e.unenrolled_at && e.unenrolled_at < monthStartStr) continue;
            }

            // Виключено через корзину (month 0-indexed у БД)
            if (exclusionSet.has(`${e.id}-${yy}-${mm}`)) continue;

            const rate = getRateForMonthEnd(e.id, e, activity, monthEndStr);
            if (rate <= 0) continue;

            total += rate;
            monthsCharged++;
          }

          if (monthsCharged === 0) return;
          rows.push({ studentName, activityName, accountName, billingType: 'Абонплата', monthsCharged, total });
        } else {
          const attTotal = attByEnrollment.get(e.id) || 0;
          if (attTotal === 0) return;
          rows.push({ studentName, activityName, accountName, billingType: 'Поурочно', monthsCharged: 0, total: attTotal });
        }

      });

      // Add refunds that are not represented by non-food enrollments (e.g. food refunds)
      refundByStudentActivity.forEach((refund, refundKey) => {
        if (refund <= 0 || addedRefundKeys.has(refundKey)) return;

        const [studentIdRaw, activityIdRaw] = refundKey.split('|');
        const studentId = studentIdRaw || '';
        const activityId = activityIdRaw && activityIdRaw !== 'null' ? activityIdRaw : null;

        const txSample = refundData.find(
          (tx: any) =>
            String(tx.student_id) === studentId &&
            ((activityId === null && !tx.activity_id) || String(tx.activity_id) === activityId)
        );

        const fallbackActivityName =
          typeof txSample?.activities?.name === 'string'
            ? txSample.activities.name
            : activityId
              ? (activityMetaById.get(activityId)?.name || '—')
              : 'Харчування';
        const resolvedAccountId: string | null =
          txSample?.account_id
            ? String(txSample.account_id)
            : txSample?.activities?.account_id
              ? String(txSample.activities.account_id)
              : activityId
                ? (activityMetaById.get(activityId)?.accountId ?? null)
                : null;
        if (!matchesAccount(resolvedAccountId)) return;

        const accountName = resolvedAccountId
          ? (accountMap.get(resolvedAccountId) ?? '—')
          : '— без рахунку —';
        const studentName = studentNameById.get(studentId) || '—';

        rows.push({
          studentName,
          activityName: fallbackActivityName,
          accountName,
          billingType: 'Повернення',
          monthsCharged: 0,
          total: -refund,
        });
      });

      rows.sort((a, b) =>
        a.studentName.localeCompare(b.studentName, 'uk') ||
        a.activityName.localeCompare(b.activityName, 'uk')
      );
      return rows;
    },
  });
}

export function useFinancialSummaryReport({
  startYear,
  startMonth,
  endYear,
  endMonth,
  accountIds,
  enabled = true,
}: UseFinancialSummaryReportParams) {
  return useQuery({
    queryKey: ['financial-summary-report', startYear, startMonth, endYear, endMonth, accountIds],
    enabled,
    queryFn: async (): Promise<MonthlyFinancialData[]> => {
      // Получаем все данные для расчета
      const [
        { data: students, error: studentsError },
        { data: activities, error: activitiesError },
        { data: accounts, error: accountsError },
      ] = await Promise.all([
        supabaseAny.from('students').select('id').order('id'),
        supabaseAny.from('activities').select('id, config, is_actual_expense, account_id'),
        supabaseAny.from('payment_accounts').select('id, name, opening_balance_date, opening_balance_amount').order('name'),
      ]);

      if (studentsError) throw studentsError;
      if (activitiesError) throw activitiesError;
      if (accountsError) throw accountsError;

      // Выплаты дивидендов до конца периода (для реального расхода и остатка на начало месяца)
      const reportStart = getMonthStartDate(startYear, startMonth);
      const reportEnd = getMonthEndDate(endYear, endMonth);
      const { data: dividendPayoutsToEnd } = await supabaseAny
        .from('dividend_payouts')
        .select('id, payout_date')
        .lte('payout_date', reportEnd);
      const payoutIds = (dividendPayoutsToEnd || []).map((p: any) => p.id);
      const payoutIdToDate: Record<string, string> = {};
      (dividendPayoutsToEnd || []).forEach((p: any) => { payoutIdToDate[p.id] = p.payout_date; });
      let dividendLegs: { payout_id: string; account_id: string | null; amount: number }[] = [];
      if (payoutIds.length > 0) {
        const { data: legs } = await supabaseAny
          .from('dividend_payout_legs')
          .select('payout_id, account_id, amount')
          .in('payout_id', payoutIds);
        dividendLegs = (legs || []).map((l: any) => ({
          payout_id: l.payout_id,
          account_id: l.account_id,
          amount: Number(l.amount),
        }));
      }

      // Определяем controller activities и food tariffs
      const controllerActivityIds = (activities || [])
        .filter((activity: any) => isGardenAttendanceController(activity))
        .map((activity: any) => activity.id);

      const foodTariffIds = new Set<string>();
      (activities || []).forEach((activity: any) => {
        if (!isGardenAttendanceController(activity)) return;
        const config = getGardenAttendanceConfig(activity);
        (config.food_tariff_ids || []).forEach((id: string) => foodTariffIds.add(id));
      });

      // Формируем список месяцев в выбранном периоде
      const months: Array<{ year: number; month: number }> = [];
      for (let y = startYear; y <= endYear; y++) {
        const monthStart = y === startYear ? startMonth : 0;
        const monthEnd = y === endYear ? endMonth : 11;
        for (let m = monthStart; m <= monthEnd; m++) {
          months.push({ year: y, month: m });
        }
      }

      // Функция для проверки соответствия счету
      const matchesAccount = (accountId: string | null): boolean => {
        if (!accountIds || accountIds.length === 0) return true; // Все счета
        if (accountId === null) {
          // Проверяем, включен ли "Без счета" в фильтр
          return accountIds.includes('null') || accountIds.some(id => id === null);
        }
        return accountIds.includes(accountId);
      };

      // account_opening_balances (student balances) only correct student balance display, not account state
      const results: MonthlyFinancialData[] = [];
      // Накопительные показатели считаются только в рамках выбранного периода
      let cumulativeDifference = 0;

      // Сума opening_balance_amount по рахунках, чия дата відкриття — до початку звітного періоду.
      // Це виправляє розбіжність між звітом і карткою рахунку: картка завжди включає opening_balance.
      const initialOpeningBalance = (accounts || []).reduce((sum: number, acc: any) => {
        if (!matchesAccount(acc.id)) return sum;
        const dateVal = acc.opening_balance_date;
        const amountVal = Number(acc.opening_balance_amount || 0);
        if (!dateVal || dateVal < reportStart) {
          return sum + amountVal;
        }
        return sum;
      }, 0);

      // Перенос залишку: баланс на кінець попереднього місяця = початок поточного
      let accountBalance = initialOpeningBalance;
      let accountBalanceWithoutDividends = initialOpeningBalance;

      // Сума внесених залишків на рахунках для місяця (дата внесённого остатка в цьому місяці)
      const getOpeningBalanceForMonth = (startDate: string, endDate: string): number =>
        (accounts || []).reduce((sum: number, acc: any) => {
          if (!matchesAccount(acc.id)) return sum;
          const dateVal = acc.opening_balance_date ?? acc.openingBalanceDate;
          const amountVal = acc.opening_balance_amount ?? acc.openingBalanceAmount;
          if (dateVal && dateVal >= startDate && dateVal <= endDate) {
            return sum + Number(amountVal || 0);
          }
          return sum;
        }, 0);

      // Функция для расчета остатка на начало конкретного месяца (на 1 число) — тільки рух коштів, без внесених залишків
      const calculateInitialBalanceForMonth = async (year: number, month: number): Promise<number> => {
        if (!accountIds || accountIds.length === 0) return 0; // Для всех счетов не считаем
        
        const monthStartDate = getMonthStartDate(year, month);
        
        // Реальный доход до начала месяца
        const preMonthPayments = await fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('amount, account_id')
            .in('type', ['payment', 'cash_in'])
            .lt('date', monthStartDate)
            .range(from, to)
        );

        const preMonthIncome = preMonthPayments.reduce((sum: number, tx: any) => {
          if (matchesAccount(tx.account_id)) {
            return sum + (tx.amount || 0);
          }
          return sum;
        }, 0);

        // Реальный расход до начала месяца
        // 1. Виплати зарплати (джерело істини як у картці рахунку: finance_transactions.type = salary)
        const preMonthSalaryTransactions = await fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('amount, account_id, dividend_payout_id')
            .eq('type', 'salary')
            .lt('date', monthStartDate)
            .range(from, to)
        );

        const preMonthSalaryTotal = preMonthSalaryTransactions.reduce((sum: number, tx: any) => {
          if (tx.dividend_payout_id) return sum;
          if (matchesAccount(tx.account_id)) {
            return sum + (tx.amount || 0);
          }
          return sum;
        }, 0);

        // 2. Реальные расходы из expense_journal_entries (исключаем записи, выведенные как дивиденд)
        const { data: preMonthActualExpenses } = await supabaseAny
          .from('expense_journal_entries')
          .select('amount, account_id, activity_id, dividend_payout_id, activities(is_actual_expense, account_id)')
          .lt('entry_date', monthStartDate);

        const preMonthActualExpenseTotal = (preMonthActualExpenses || []).reduce((sum: number, entry: any) => {
          if (entry.dividend_payout_id) return sum;
          const isActual = entry.activities?.is_actual_expense || false;
          if (isActual) {
            const entryAccountId = entry.account_id || entry.activities?.account_id || null;
            if (matchesAccount(entryAccountId)) {
              return sum + (entry.amount || 0);
            }
          }
          return sum;
        }, 0);

        // 3. Реальные расходы из finance_transactions (исключаем выведенные как дивиденд)
        const preMonthDirectExpenseTransactions = await fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('amount, account_id, activity_id, expense_entry_id, transfer_id, dividend_payout_id, activities(is_actual_expense, account_id)')
            .in('type', ['expense', 'household'])
            .lt('date', monthStartDate)
            .is('expense_entry_id', null)
            .is('transfer_id', null)
            .range(from, to)
        );

        const preMonthDirectExpenseTotal = preMonthDirectExpenseTransactions.reduce((sum: number, tx: any) => {
          if (tx.dividend_payout_id) return sum;
          const isActual = tx.activities?.is_actual_expense || false;
          if (isActual) {
            const txAccountId = tx.account_id || tx.activities?.account_id || null;
            if (matchesAccount(txAccountId)) {
              return sum + (tx.amount || 0);
            }
          }
          return sum;
        }, 0);

        // 3.4. Реальные расходы из переводов (исключаем выведенные как дивиденд)
        const preMonthTransferExpenseTransactions = await fetchAllRows<any>((from, to) =>
          supabaseAny
            .from('finance_transactions')
            .select('amount, account_id, transfer_id, dividend_payout_id')
            .eq('type', 'expense')
            .not('transfer_id', 'is', null)
            .lt('date', monthStartDate)
            .range(from, to)
        );

        const preMonthTransferExpenseTotal = preMonthTransferExpenseTransactions.reduce((sum: number, tx: any) => {
          if (tx.dividend_payout_id) return sum;
          if (matchesAccount(tx.account_id)) {
            return sum + (tx.amount || 0);
          }
          return sum;
        }, 0);

        const preMonthDividendTotal = dividendLegs.reduce((sum: number, leg: any) => {
          if (payoutIdToDate[leg.payout_id] < monthStartDate && matchesAccount(leg.account_id)) {
            return sum + leg.amount;
          }
          return sum;
        }, 0);

        const preMonthActualExpense = preMonthSalaryTotal + preMonthActualExpenseTotal + preMonthDirectExpenseTotal + preMonthTransferExpenseTotal + preMonthDividendTotal;

        // Додаємо opening_balance_amount для рахунків, чия дата — до початку місяця (або не вказана).
        // Без цього залишок у звіті не збігається з карткою рахунку.
        const preMonthOpeningBalance = (accounts || []).reduce((sum: number, acc: any) => {
          if (!matchesAccount(acc.id)) return sum;
          const dateVal = acc.opening_balance_date;
          const amountVal = Number(acc.opening_balance_amount || 0);
          if (!dateVal || dateVal < monthStartDate) {
            return sum + amountVal;
          }
          return sum;
        }, 0);

        return preMonthIncome - preMonthActualExpense + preMonthOpeningBalance;
      };

      // Обрабатываем каждый месяц
      for (let monthIndex = 0; monthIndex < months.length; monthIndex++) {
        const { year: y, month: m } = months[monthIndex];
        const startDate = getMonthStartDate(y, m);
        const endDate = getMonthEndDate(y, m);
        const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
        const monthLabel = `${MONTHS_UA[m]} ${y}`;

        // 1. Прогнозируемый доход (факт нарахування) — из реестра должников (charges - refunds), по одному студенту
        const projectedIncomePromise =
          students && students.length > 0
            ? Promise.all(
                (students as any[]).map((s: any) =>
                  fetchStudentAccountBalances({
                    studentId: s.id,
                    month: m,
                    year: y,
                    excludeActivityIds: controllerActivityIds,
                    foodTariffIds: Array.from(foodTariffIds),
                  })
                )
              ).then((arrays) => arrays.flat())
            : Promise.resolve([]);

        // Оптимизация: выполняем все запросы для месяца параллельно
        const [
          projectedIncomeBalances,
          { data: salaryProjections },
          { data: expenseProjections },
          actualPayments,
          cashInPayments,
          transferInPayments,
          salaryTransactions,
          { data: actualExpenses },
          directExpenseTransactions,
          transferExpenseTransactions,
          cashWithdrawalTransactions,
        ] = await Promise.all([
          projectedIncomePromise,
          // 2. Прогнозируемый расход (метод начисления)
          // 2.1. Автоматические начисления зарплат (БЕЗ учета счетов - это прогноз)
          supabaseAny
            .from('staff_journal_entries')
            .select('amount')
            .gte('date', startDate)
            .lte('date', endDate),
          // 2.2. Планы по расходам (журналы с типом "Прогноз", БЕЗ учета счетов)
          supabaseAny
            .from('expense_journal_entries')
            .select('amount, activity_id, activities(is_actual_expense)')
            .gte('entry_date', startDate)
            .lte('entry_date', endDate),
          // 3. Реальный доход от оплат (type=payment, без переказів): родительские платежи
          fetchAllRows<any>((from, to) =>
            supabaseAny
              .from('finance_transactions')
              .select('amount, account_id')
              .eq('type', 'payment')
              .is('transfer_id', null)
              .gte('date', startDate)
              .lte('date', endDate)
              .range(from, to)
          ),
          // 3.1. Поступления от вывода наличных (cash_in): учитываются в залишку, но не в "Реальному доходу"
          fetchAllRows<any>((from, to) =>
            supabaseAny
              .from('finance_transactions')
              .select('amount, account_id')
              .eq('type', 'cash_in')
              .gte('date', startDate)
              .lte('date', endDate)
              .range(from, to)
          ),
          // 3.2. Входящие переказы (type=payment, transfer_id IS NOT NULL): учитываются в залишку, но не в "Реальному доходу"
          fetchAllRows<any>((from, to) =>
            supabaseAny
              .from('finance_transactions')
              .select('amount, account_id')
              .eq('type', 'payment')
              .not('transfer_id', 'is', null)
              .gte('date', startDate)
              .lte('date', endDate)
              .range(from, to)
          ),
          // 4. Реальный расход (кассовый метод) - с учетом счетов
          // 4.1. Виплати зарплати (джерело істини як у картці рахунку: finance_transactions.type = salary)
          fetchAllRows<any>((from, to) =>
            supabaseAny
              .from('finance_transactions')
              .select('amount, account_id, dividend_payout_id')
              .eq('type', 'salary')
              .gte('date', startDate)
              .lte('date', endDate)
              .range(from, to)
          ),
          // 4.2. Реальные расходы из expense_journal_entries (исключаем выведенные как дивиденд)
          supabaseAny
            .from('expense_journal_entries')
            .select('amount, account_id, activity_id, dividend_payout_id, activities(is_actual_expense, account_id)')
            .gte('entry_date', startDate)
            .lte('entry_date', endDate),
          // 4.3. Реальные расходы из finance_transactions (исключаем выведенные как дивиденд)
          fetchAllRows<any>((from, to) =>
            supabaseAny
              .from('finance_transactions')
              .select('amount, account_id, activity_id, expense_entry_id, transfer_id, dividend_payout_id, activities(is_actual_expense, account_id)')
              .in('type', ['expense', 'household'])
              .gte('date', startDate)
              .lte('date', endDate)
              .is('expense_entry_id', null)
              .is('transfer_id', null)
              .range(from, to)
          ),
          // 4.4. Реальные расходы из переводов (исключаем выведенные как дивиденд)
          fetchAllRows<any>((from, to) =>
            supabaseAny
              .from('finance_transactions')
              .select('amount, account_id, transfer_id, dividend_payout_id')
              .eq('type', 'expense')
              .not('transfer_id', 'is', null)
              .gte('date', startDate)
              .lte('date', endDate)
              .range(from, to)
          ),
          // 5. Вивід коштів: витрати, позначені як готівковий вивід (cash_withdrawal_id IS NOT NULL)
          fetchAllRows<any>((from, to) =>
            supabaseAny
              .from('finance_transactions')
              .select('amount, account_id, activities(is_actual_expense, account_id)')
              .in('type', ['expense', 'household'])
              .not('cash_withdrawal_id', 'is', null)
              .gte('date', startDate)
              .lte('date', endDate)
              .range(from, to)
          ),
        ]);

        let projectedIncome = 0;
        (projectedIncomeBalances || []).forEach((balance: any) => {
          if (matchesAccount(balance.account_id)) {
            projectedIncome += (balance.charges || 0) - (balance.refunds || 0);
          }
        });

        const salaryProjectionTotal = (salaryProjections || []).reduce(
          (sum: number, entry: any) => sum + (entry.amount || 0),
          0
        );

        const expenseProjectionTotal = (expenseProjections || []).reduce(
          (sum: number, entry: any) => {
            const isActual = entry.activities?.is_actual_expense || false;
            if (!isActual) {
              return sum + (entry.amount || 0);
            }
            return sum;
          },
          0
        );

        const projectedExpense = salaryProjectionTotal + expenseProjectionTotal;

        const actualIncome = (actualPayments || []).reduce((sum: number, tx: any) => {
          if (matchesAccount(tx.account_id)) {
            return sum + (tx.amount || 0);
          }
          return sum;
        }, 0);

        // cash_in и входящие переказы не входят в "Реальний дохід", но учитываются в "Залишку на рахунку"
        const cashInTotal = (cashInPayments || []).reduce((sum: number, tx: any) => {
          if (matchesAccount(tx.account_id)) {
            return sum + (tx.amount || 0);
          }
          return sum;
        }, 0);

        const transferInTotal = (transferInPayments || []).reduce((sum: number, tx: any) => {
          if (matchesAccount(tx.account_id)) {
            return sum + (tx.amount || 0);
          }
          return sum;
        }, 0);

        const salaryTotal = (salaryTransactions || []).reduce((sum: number, tx: any) => {
          if (tx.dividend_payout_id) return sum;
          if (matchesAccount(tx.account_id)) {
            return sum + (tx.amount || 0);
          }
          return sum;
        }, 0);

        const actualExpenseTotal = (actualExpenses || []).reduce((sum: number, entry: any) => {
          if (entry.dividend_payout_id) return sum;
          const isActual = entry.activities?.is_actual_expense || false;
          if (isActual) {
            const entryAccountId = entry.account_id || entry.activities?.account_id || null;
            if (matchesAccount(entryAccountId)) {
              return sum + (entry.amount || 0);
            }
          }
          return sum;
        }, 0);

        const directExpenseTotal = (directExpenseTransactions || []).reduce((sum: number, tx: any) => {
          if (tx.dividend_payout_id) return sum;
          const isActual = tx.activities?.is_actual_expense || false;
          if (isActual) {
            const txAccountId = tx.account_id || tx.activities?.account_id || null;
            if (matchesAccount(txAccountId)) {
              return sum + (tx.amount || 0);
            }
          }
          return sum;
        }, 0);

        const transferExpenseTotal = (transferExpenseTransactions || []).reduce((sum: number, tx: any) => {
          if (tx.dividend_payout_id) return sum;
          if (matchesAccount(tx.account_id)) {
            return sum + (tx.amount || 0);
          }
          return sum;
        }, 0);

        // 4.5. Виплати дивідендів (списання з рахунків у журналі дивідендів)
        const dividendExpenseTotal = dividendLegs.reduce((sum: number, leg: any) => {
          const legDate = payoutIdToDate[leg.payout_id];
          if (legDate >= startDate && legDate <= endDate && matchesAccount(leg.account_id)) {
            return sum + leg.amount;
          }
          return sum;
        }, 0);

        const actualExpense = salaryTotal + actualExpenseTotal + directExpenseTotal + transferExpenseTotal + dividendExpenseTotal;
        const expenseWithoutDividends = actualExpense - dividendExpenseTotal;

        // Вивід коштів: сума витрат, що були виведені готівкою
        const cashWithdrawalTotal = (cashWithdrawalTransactions || []).reduce((sum: number, tx: any) => {
          const isActual = tx.activities?.is_actual_expense ?? true; // прямі витрати без activity вважаємо реальними
          if (!isActual) return sum;
          const txAccountId = tx.account_id || tx.activities?.account_id || null;
          if (matchesAccount(txAccountId)) return sum + (tx.amount || 0);
          return sum;
        }, 0);

        // Реальні витрати по госп. діяльності:
        // Всі реальні витрати (actualExpense) за вирахуванням:
        // - переказів між рахунками (не є витратою підприємства)
        // - дивідендів (виведення коштів власниками)
        // - виводу коштів (готівкове зняття)
        const businessExpense = actualExpense - transferExpenseTotal - dividendExpenseTotal - cashWithdrawalTotal;
        const delta = actualIncome - businessExpense;

        // Расчетные показатели
        const expectedBalance = projectedIncome - projectedExpense;
        const actualBalance = actualIncome - actualExpense;
        const difference = actualBalance - expectedBalance;
        cumulativeDifference += difference;

        // Залишок на початок місяця: перенос з попереднього місяця + внесені залишки (payment_accounts)
        let monthInitialBalance: number | undefined;
        const monthOpening = getOpeningBalanceForMonth(startDate, endDate);
        if (accountIds && accountIds.length > 0) {
          if (monthIndex === 0) {
            const carriedForward = await calculateInitialBalanceForMonth(y, m);
            // На початок місяця беремо тільки залишок ДО 1 числа.
            // opening_balance з датою всередині місяця додається як рух місяця, а не стартовий залишок.
            monthInitialBalance = carriedForward;
          } else {
            monthInitialBalance = accountBalance;
          }
        } else {
          monthInitialBalance = undefined;
        }

        if (monthInitialBalance !== undefined) {
          accountBalance = monthInitialBalance + actualBalance + cashInTotal + transferInTotal + monthOpening;
          accountBalanceWithoutDividends = monthInitialBalance + (actualIncome + cashInTotal + transferInTotal - expenseWithoutDividends) + monthOpening;
        } else {
          // Для режиму "всі рахунки": додаємо opening_balance_amount, якщо їх дата потрапляє в цей місяць
          accountBalance += actualBalance + cashInTotal + transferInTotal + monthOpening;
          accountBalanceWithoutDividends += (actualIncome + cashInTotal + transferInTotal - expenseWithoutDividends) + monthOpening;
        }

        results.push({
          month: monthKey,
          monthLabel,
          projectedIncome,
          projectedExpense,
          actualIncome,
          actualExpense,
          transferExpense: transferExpenseTotal,
          businessExpense,
          delta,
          dividendExpense: dividendExpenseTotal,
          cashWithdrawal: cashWithdrawalTotal,
          expenseWithoutDividends,
          expectedBalance,
          actualBalance,
          difference,
          cumulativeDifference,
          accountBalance,
          accountBalanceWithoutDividends,
          initialBalance: monthInitialBalance,
        });
      }

      return results;
    },
  });
}
