import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchStudentAccountBalances } from '@/hooks/useFinanceTransactions';
import {
  getGardenAttendanceConfig,
  isGardenAttendanceController,
} from '@/lib/gardenAttendance';

const supabaseAny = supabase as any;

export interface MonthlyFinancialData {
  month: string; // "2024-01"
  monthLabel: string; // "Січень 2024"
  projectedIncome: number; // Прогноз дохода
  projectedExpense: number; // Прогноз расхода
  actualIncome: number; // Реальный доход
  actualExpense: number; // Реальный расход
  expectedBalance: number; // projectedIncome - projectedExpense
  actualBalance: number; // actualIncome - actualExpense
  difference: number; // actualBalance - expectedBalance
  cumulativeDifference: number; // Накопительное отклонение
  accountBalance: number; // Накопительный остаток (с учетом начального остатка)
  initialBalance?: number; // Остаток на начало периода (только для отдельных счетов)
}

interface UseFinancialSummaryReportParams {
  startYear: number;
  startMonth: number; // 0-11
  endYear: number;
  endMonth: number; // 0-11
  accountIds?: string[]; // Фильтр по счетам, если пусто - все счета
}

const MONTHS_UA = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

function getMonthStartDate(year: number, month: number): string {
  return new Date(year, month, 1).toISOString().split('T')[0];
}

function getMonthEndDate(year: number, month: number): string {
  return new Date(year, month + 1, 0).toISOString().split('T')[0];
}

export function useFinancialSummaryReport({
  startYear,
  startMonth,
  endYear,
  endMonth,
  accountIds,
}: UseFinancialSummaryReportParams) {
  return useQuery({
    queryKey: ['financial-summary-report', startYear, startMonth, endYear, endMonth, accountIds],
    queryFn: async (): Promise<MonthlyFinancialData[]> => {
      // Получаем все данные для расчета
      const [
        { data: students, error: studentsError },
        { data: activities, error: activitiesError },
        { data: accounts, error: accountsError },
      ] = await Promise.all([
        supabaseAny.from('students').select('id').order('id'),
        supabaseAny.from('activities').select('id, config, is_actual_expense, account_id'),
        supabaseAny.from('payment_accounts').select('id, name').order('name'),
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

      const results: MonthlyFinancialData[] = [];
      // Накопительные показатели считаются только в рамках выбранного периода
      let cumulativeDifference = 0;
      
      // Функция для расчета остатка на начало конкретного месяца (на 1 число)
      const calculateInitialBalanceForMonth = async (year: number, month: number): Promise<number> => {
        if (!accountIds || accountIds.length === 0) return 0; // Для всех счетов не считаем
        
        const monthStartDate = getMonthStartDate(year, month);
        
        // Реальный доход до начала месяца
        const { data: preMonthPayments } = await supabaseAny
          .from('finance_transactions')
          .select('amount, account_id')
          .eq('type', 'payment')
          .lt('date', monthStartDate);

        const preMonthIncome = (preMonthPayments || []).reduce((sum: number, tx: any) => {
          if (matchesAccount(tx.account_id)) {
            return sum + (tx.amount || 0);
          }
          return sum;
        }, 0);

        // Реальный расход до начала месяца
        // 1. Выплаты зарплаты
        const { data: preMonthSalaryPayouts } = await supabaseAny
          .from('staff_payouts')
          .select('amount, account_id')
          .lt('payout_date', monthStartDate)
          .or('is_deleted.is.null,is_deleted.eq.false');

        const preMonthSalaryPayoutTotal = (preMonthSalaryPayouts || []).reduce((sum: number, payout: any) => {
          if (matchesAccount(payout.account_id)) {
            return sum + (payout.amount || 0);
          }
          return sum;
        }, 0);

        // 2. Реальные расходы из expense_journal_entries
        const { data: preMonthActualExpenses } = await supabaseAny
          .from('expense_journal_entries')
          .select('amount, account_id, activity_id, activities(is_actual_expense, account_id)')
          .lt('entry_date', monthStartDate);

        const preMonthActualExpenseTotal = (preMonthActualExpenses || []).reduce((sum: number, entry: any) => {
          const isActual = entry.activities?.is_actual_expense || false;
          if (isActual) {
            const entryAccountId = entry.account_id || entry.activities?.account_id || null;
            if (matchesAccount(entryAccountId)) {
              return sum + (entry.amount || 0);
            }
          }
          return sum;
        }, 0);

        // 3. Реальные расходы из finance_transactions (созданные через диалог "Додати витрату")
        // ИСКЛЮЧАЕМ транзакции с transfer_id (переводы учитываются отдельно)
        const { data: preMonthDirectExpenseTransactions } = await supabaseAny
          .from('finance_transactions')
          .select('amount, account_id, activity_id, expense_entry_id, transfer_id, activities(is_actual_expense, account_id)')
          .in('type', ['expense', 'household'])
          .lt('date', monthStartDate)
          .is('expense_entry_id', null)
          .is('transfer_id', null); // Исключаем переводы

        const preMonthDirectExpenseTotal = (preMonthDirectExpenseTransactions || []).reduce((sum: number, tx: any) => {
          const isActual = tx.activities?.is_actual_expense || false;
          if (isActual) {
            const txAccountId = tx.account_id || tx.activities?.account_id || null;
            if (matchesAccount(txAccountId)) {
              return sum + (tx.amount || 0);
            }
          }
          return sum;
        }, 0);

        // 3.4. Реальные расходы из переводов (транзакции типа 'expense' с transfer_id)
        const { data: preMonthTransferExpenseTransactions } = await supabaseAny
          .from('finance_transactions')
          .select('amount, account_id, transfer_id')
          .eq('type', 'expense')
          .not('transfer_id', 'is', null)
          .lt('date', monthStartDate);

        const preMonthTransferExpenseTotal = (preMonthTransferExpenseTransactions || []).reduce((sum: number, tx: any) => {
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

        const preMonthActualExpense = preMonthSalaryPayoutTotal + preMonthActualExpenseTotal + preMonthDirectExpenseTotal + preMonthTransferExpenseTotal + preMonthDividendTotal;
        return preMonthIncome - preMonthActualExpense;
      };
      
      // accountBalance начинается с 0, будет накапливаться
      let accountBalance = 0;

      // Обрабатываем каждый месяц
      for (const { year: y, month: m } of months) {
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
          { data: actualPayments },
          { data: salaryPayouts },
          { data: actualExpenses },
          { data: directExpenseTransactions },
          { data: transferExpenseTransactions }
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
          // 3. Реальный доход (кассовый метод) - с учетом счетов
          supabaseAny
            .from('finance_transactions')
            .select('amount, account_id')
            .eq('type', 'payment')
            .gte('date', startDate)
            .lte('date', endDate),
          // 4. Реальный расход (кассовый метод) - с учетом счетов
          // 4.1. Выплаты зарплаты
          supabaseAny
            .from('staff_payouts')
            .select('amount, account_id')
            .gte('payout_date', startDate)
            .lte('payout_date', endDate)
            .or('is_deleted.is.null,is_deleted.eq.false'),
          // 4.2. Реальные расходы из expense_journal_entries (журналы с типом "Факт", с учетом счетов)
          supabaseAny
            .from('expense_journal_entries')
            .select('amount, account_id, activity_id, activities(is_actual_expense, account_id)')
            .gte('entry_date', startDate)
            .lte('entry_date', endDate),
          // 4.3. Реальные расходы из finance_transactions (созданные через диалог "Додати витрату")
          supabaseAny
            .from('finance_transactions')
            .select('amount, account_id, activity_id, expense_entry_id, transfer_id, activities(is_actual_expense, account_id)')
            .in('type', ['expense', 'household'])
            .gte('date', startDate)
            .lte('date', endDate)
            .is('expense_entry_id', null)
            .is('transfer_id', null),
          // 4.4. Реальные расходы из переводов (транзакции типа 'expense' с transfer_id)
          supabaseAny
            .from('finance_transactions')
            .select('amount, account_id, transfer_id')
            .eq('type', 'expense')
            .not('transfer_id', 'is', null)
            .gte('date', startDate)
            .lte('date', endDate)
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

        const salaryPayoutTotal = (salaryPayouts || []).reduce((sum: number, payout: any) => {
          if (matchesAccount(payout.account_id)) {
            return sum + (payout.amount || 0);
          }
          return sum;
        }, 0);

        const actualExpenseTotal = (actualExpenses || []).reduce((sum: number, entry: any) => {
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

        const actualExpense = salaryPayoutTotal + actualExpenseTotal + directExpenseTotal + transferExpenseTotal + dividendExpenseTotal;

        // Расчетные показатели
        const expectedBalance = projectedIncome - projectedExpense;
        const actualBalance = actualIncome - actualExpense;
        const difference = actualBalance - expectedBalance;
        cumulativeDifference += difference;
        
        // Рассчитываем остаток на начало месяца (для отдельных счетов)
        const monthInitialBalance = accountIds && accountIds.length > 0 
          ? await calculateInitialBalanceForMonth(y, m)
          : undefined;
        
        // accountBalance = остаток на начало месяца + actualBalance
        if (monthInitialBalance !== undefined) {
          accountBalance = monthInitialBalance + actualBalance;
        } else {
          accountBalance += actualBalance;
        }

        results.push({
          month: monthKey,
          monthLabel,
          projectedIncome,
          projectedExpense,
          actualIncome,
          actualExpense,
          expectedBalance,
          actualBalance,
          difference,
          cumulativeDifference,
          accountBalance,
          initialBalance: monthInitialBalance,
        });
      }

      return results;
    },
  });
}
