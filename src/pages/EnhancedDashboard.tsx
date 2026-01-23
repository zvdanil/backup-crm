import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { useDashboardData, useCategorySummary } from '@/hooks/useDashboardData';
import { useActivities } from '@/hooks/useActivities';
import { ACTIVITY_CATEGORY_LABELS, type ActivityCategory } from '@/hooks/useActivities';
import { formatCurrency, getDaysInMonth, formatShortDate, getWeekdayShort, isWeekend, formatDateString, WEEKEND_BG_COLOR } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { isGardenAttendanceController, type GardenAttendanceConfig } from '@/lib/gardenAttendance';
import { useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

const CATEGORY_ORDER: ActivityCategory[] = ['income', 'additional_income', 'expense', 'household_expense', 'salary'];

const CATEGORY_STYLES: Record<ActivityCategory, { bg: string; text: string; border: string }> = {
  income: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  additional_income: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  expense: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
  household_expense: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
  salary: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
};

interface StudentGroup {
  studentId: string;
  studentName: string;
  activities: Array<{
    enrollmentId: string;
    activityId: string;
    activityName: string;
    activityColor: string;
    category: ActivityCategory;
  }>;
}

export default function EnhancedDashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDayIndex, setSelectedDayIndex] = useState(now.getDate() - 1);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const tableScrollRefs = useRef<Set<HTMLDivElement>>(new Set());

  const { data, isLoading, refetch: refetchDashboard, dataUpdatedAt } = useDashboardData(year, month);
  const { data: summary, refetch: refetchSummary } = useCategorySummary(year, month);
  const { data: allActivities = [] } = useActivities();

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const selectedDay = days[selectedDayIndex] || days[0];
  const selectedDateStr = selectedDay ? formatDateString(selectedDay) : '';

  useEffect(() => {
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth()) {
      setSelectedDayIndex(Math.max(0, Math.min(today.getDate() - 1, days.length - 1)));
    } else {
      setSelectedDayIndex(0);
    }
  }, [year, month, days.length]);

  // Find controller activities and get their config
  const controllerActivitiesMap = useMemo(() => {
    const map = new Map<string, GardenAttendanceConfig>();
    allActivities.forEach(activity => {
      if (isGardenAttendanceController(activity)) {
        const config = (activity.config as GardenAttendanceConfig) || {};
        map.set(activity.id, config);
      }
    });
    return map;
  }, [allActivities]);

  // Get food tariff IDs and base tariff IDs from all controller activities
  const foodTariffIds = useMemo(() => {
    const ids = new Set<string>();
    controllerActivitiesMap.forEach(config => {
      (config.food_tariff_ids || []).forEach(id => ids.add(id));
    });
    return ids;
  }, [controllerActivitiesMap]);

  const baseTariffIds = useMemo(() => {
    const ids = new Set<string>();
    controllerActivitiesMap.forEach(config => {
      (config.base_tariff_ids || []).forEach(id => ids.add(id));
    });
    return ids;
  }, [controllerActivitiesMap]);

  const enrollmentsWithAttendanceCharges = useMemo(() => {
    const set = new Set<string>();
    data?.attendance?.forEach((att) => {
      const amount = att.value !== null && att.value !== undefined ? att.value : (att.charged_amount || 0);
      if (amount !== 0) {
        set.add(att.enrollment_id);
      }
    });
    return set;
  }, [data?.attendance, dataUpdatedAt]);

  const enrollmentsWithTransactions = useMemo(() => {
    const set = new Set<string>();
    data?.financeTransactions?.forEach((trans) => {
      if (!trans.student_id || !trans.activity_id) return;
      if ((trans.amount || 0) !== 0) {
        set.add(`${trans.student_id}:${trans.activity_id}`);
      }
    });
    return set;
  }, [data?.financeTransactions, dataUpdatedAt]);

  const shouldShowEnrollment = useMemo(
    () => (enrollment: { id: string; is_active: boolean; student_id: string; activity_id: string }) =>
      enrollment.is_active ||
      enrollmentsWithAttendanceCharges.has(enrollment.id) ||
      enrollmentsWithTransactions.has(`${enrollment.student_id}:${enrollment.activity_id}`),
    [enrollmentsWithAttendanceCharges, enrollmentsWithTransactions]
  );

  const visibleEnrollments = useMemo(
    () => (data?.enrollments || []).filter((enrollment) => shouldShowEnrollment(enrollment)),
    [data?.enrollments, shouldShowEnrollment]
  );

  // Групування по дітях (исключаем управляющие активности, но добавляем базовые тарифы и питание)
  const studentsGrouped = useMemo(() => {
    if (!data?.enrollments) return [] as StudentGroup[];

    const studentMap = new Map<string, StudentGroup>();
    const processedEnrollmentIds = new Set<string>();

    // Сначала обрабатываем обычные enrollments (исключаем управляющие активности)
    visibleEnrollments.forEach((enrollment) => {
      const activity = allActivities.find(a => a.id === enrollment.activity_id);
      if (activity && isGardenAttendanceController(activity)) {
        return; // Пропускаем управляющие активности
      }

      processedEnrollmentIds.add(enrollment.id);
      const studentId = enrollment.students.id;
      const studentName = enrollment.students.full_name;

      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          studentId,
          studentName,
          activities: [],
        });
      }

      studentMap.get(studentId)!.activities.push({
        enrollmentId: enrollment.id,
        activityId: enrollment.activity_id,
        activityName: enrollment.activities.name,
        activityColor: enrollment.activities.color,
        category: enrollment.activities.category,
      });
    });

    // Теперь добавляем базовые тарифы и питание из Garden Attendance Journal
    // Находим студентов, у которых есть enrollment на управляющую активность
    data.enrollments.forEach((enrollment) => {
      const activity = allActivities.find(a => a.id === enrollment.activity_id);
      if (activity && isGardenAttendanceController(activity)) {
        const config = (activity.config as any) || {};
        const baseTariffIds = config.base_tariff_ids || [];
        const foodTariffIds = config.food_tariff_ids || [];
        const allTariffIds = [...baseTariffIds, ...foodTariffIds];

        const studentId = enrollment.students.id;
        const studentName = enrollment.students.full_name;

        // Находим enrollments для базовых тарифов и питания этого студента
        allTariffIds.forEach(tariffActivityId => {
          const tariffEnrollment = data.enrollments.find(
            e => e.student_id === studentId && 
                 e.activity_id === tariffActivityId && 
                 !processedEnrollmentIds.has(e.id)
          );

          if (tariffEnrollment && shouldShowEnrollment(tariffEnrollment)) {
            processedEnrollmentIds.add(tariffEnrollment.id);
            
            if (!studentMap.has(studentId)) {
              studentMap.set(studentId, {
                studentId,
                studentName,
                activities: [],
              });
            }

            studentMap.get(studentId)!.activities.push({
              enrollmentId: tariffEnrollment.id,
              activityId: tariffEnrollment.activity_id,
              activityName: tariffEnrollment.activities.name,
              activityColor: tariffEnrollment.activities.color,
              category: tariffEnrollment.activities.category,
            });
          }
        });
      }
    });

    return Array.from(studentMap.values());
  }, [data?.enrollments, allActivities, dataUpdatedAt, visibleEnrollments, shouldShowEnrollment]);

  // Map attendance by enrollment_id + date (for regular journals)
  const attendanceMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    data?.attendance?.forEach((att) => {
      if (!map[att.enrollment_id]) map[att.enrollment_id] = {};
      // Використовуємо value (якщо є) або charged_amount
      const amount = att.value !== null && att.value !== undefined && att.value > 0 
        ? att.value 
        : (att.charged_amount || 0);
      map[att.enrollment_id][att.date] = amount;
    });
    return map;
  }, [data?.attendance, dataUpdatedAt]);

  const salaryAccrualsDaily = useMemo(() => {
    const totals: Record<string, number> = {};
    data?.staffExpenses?.forEach((expense) => {
      totals[expense.date] = (totals[expense.date] || 0) + (expense.amount || 0);
    });
    return totals;
  }, [data?.staffExpenses, dataUpdatedAt]);

  const salaryCombinedDaily = useMemo(() => {
    const totals: Record<string, number> = {};
    days.forEach((day) => {
      const dateStr = formatDateString(day);
      totals[dateStr] = salaryAccrualsDaily[dateStr] || 0;
    });
    return totals;
  }, [days, salaryAccrualsDaily]);

  // Map finance transactions by student_id + activity_id + date (for Garden Attendance Journal)
  // income = positive, expense = negative (for dashboard perspective)
  const financeTransactionsMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    data?.financeTransactions?.forEach((trans) => {
      if (!trans.student_id || !trans.activity_id) return;
      const key = `${trans.student_id}-${trans.activity_id}`;
      if (!map[key]) map[key] = {};
      // income = positive, expense = negative (for organization)
      const amount = trans.type === 'income' ? (trans.amount || 0) : -(trans.amount || 0);
      map[key][trans.date] = (map[key][trans.date] || 0) + amount;
    });
    return map;
  }, [data?.financeTransactions, dataUpdatedAt]);

  // Виправлення: сума лише за конкретний день, а не накопичувальний підсумок
  const dailyTotals = useMemo(() => {
    const totals: Record<ActivityCategory, Record<string, number>> = {
      income: {}, additional_income: {}, expense: {}, household_expense: {}, salary: {},
    };
    
    // Підсумовуємо доходи з attendance (для обычных журналов)
    // ИСКЛЮЧАЕМ активности, которые относятся к Garden Attendance Journal (базовые тарифы и питание)
    data?.attendance?.forEach((att) => {
      const enrollment = data.enrollments.find(e => e.id === att.enrollment_id);
      if (enrollment) {
        // Проверяем, не является ли эта активность базовым тарифом или питанием из Garden Attendance Journal
        const isBaseTariff = baseTariffIds.has(enrollment.activity_id);
        const isFoodTariff = foodTariffIds.has(enrollment.activity_id);
        
        // Если это активность из Garden Attendance Journal, пропускаем её в attendance
        // (данные для неё уже есть в finance_transactions)
        if (isBaseTariff || isFoodTariff) {
          return;
        }
        
        const category = enrollment.activities.category;
        // Підсумовуємо value (якщо є) або charged_amount
        const amount = att.value !== null && att.value !== undefined && att.value > 0 
          ? att.value 
          : (att.charged_amount || 0);
        totals[category][att.date] = (totals[category][att.date] || 0) + amount;
      }
    });
    
    // Підсумовуємо доходи/витрати з finance_transactions (только для обычных транзакций, НЕ Garden Attendance Journal)
    // Данные из Garden Attendance Journal уже обрабатываются через dashboardDataTable
    data?.financeTransactions?.forEach((trans) => {
      if (trans.activities?.category) {
        const category = trans.activities.category;
        const activityId = trans.activity_id;
        
        // Проверяем, является ли это базовым тарифом или питанием из Garden Attendance Journal
        const isBaseTariff = baseTariffIds.has(activityId);
        const isFoodTariff = foodTariffIds.has(activityId);
        const isControllerActivity = isGardenAttendanceController(trans.activities as any);
        
        // Пропускаем управляющую активность (она не должна отображаться)
        if (isControllerActivity) {
          return;
        }
        
        // Пропускаем базовые тарифы и питание из Garden Attendance Journal
        // (данные для них обрабатываются через dashboardDataTable)
        if (isBaseTariff || isFoodTariff) {
          return;
        }
        
        // Для обычных транзакций: income = положительное, expense = отрицательное
        if (trans.type === 'income') {
          totals[category][trans.date] = (totals[category][trans.date] || 0) + (trans.amount || 0);
        } else if (trans.type === 'expense' || trans.type === 'salary' || trans.type === 'household') {
          totals[category][trans.date] = (totals[category][trans.date] || 0) - (trans.amount || 0);
        }
      }
    });
    
    // Підсумовуємо витрати з staff_journal_entries (категорія 'salary')
    data?.staffExpenses?.forEach((expense) => {
      totals.salary[expense.date] = (totals.salary[expense.date] || 0) + (expense.amount || 0);
    });
    return totals;
  }, [data, allActivities, baseTariffIds, foodTariffIds]);

  // Создаём промежуточную таблицу данных из отображаемых значений в дашборде
  // Эта таблица содержит те же значения, что выводятся в ячейках таблицы
  const dashboardDataTable = useMemo(() => {
    interface DashboardRow {
      studentId: string;
      studentName: string;
      activityId: string;
      activityName: string;
      category: ActivityCategory;
      amountsByDate: Record<string, number>; // dateStr -> amount
    }
    
    const table: DashboardRow[] = [];
    
    // Проходим по всем студентам и активностям, как в таблице
    studentsGrouped.forEach((student) => {
      student.activities.forEach((activity) => {
        const enrollment = data?.enrollments.find(e => e.id === activity.enrollmentId);
        if (!enrollment) return;
        
        // Проверяем, не является ли это управляющей активностью - она не должна учитываться
        const activityObject = allActivities.find(a => a.id === activity.activityId);
        if (activityObject && isGardenAttendanceController(activityObject)) {
          return; // Пропускаем управляющую активность
        }
        
        // Определяем тип активности
        const isBaseOrFoodTariff = baseTariffIds.has(activity.activityId) || foodTariffIds.has(activity.activityId);
        let activityData: Record<string, number> = {};
        
        if (isBaseOrFoodTariff) {
          // For Garden Attendance Journal base/food tariffs: use finance_transactions
          const transactionKey = `${student.studentId}-${activity.activityId}`;
          activityData = financeTransactionsMap[transactionKey] || {};
        } else {
          // For regular journals: use attendance
          activityData = attendanceMap[enrollment.id] || {};
        }
        
        // Создаём запись в таблице с данными по всем дням
        const amountsByDate: Record<string, number> = {};
        days.forEach((day) => {
          const dateStr = formatDateString(day);
          const amount = activityData[dateStr];
          if (amount !== undefined && amount !== 0) {
            amountsByDate[dateStr] = amount;
          }
        });
        
        table.push({
          studentId: student.studentId,
          studentName: student.studentName,
          activityId: activity.activityId,
          activityName: activity.activityName,
          category: activity.category,
          amountsByDate,
        });
      });
    });
    
    // Добавляем зарплату (staff expenses) - как отдельные строки
    data?.staffExpenses?.forEach((expense) => {
      const dateStr = expense.date;
      // Проверяем, есть ли уже строка для зарплаты за этот день
      const existingSalaryRow = table.find(row => row.activityId === 'salary' && row.amountsByDate[dateStr] !== undefined);
      if (existingSalaryRow) {
        existingSalaryRow.amountsByDate[dateStr] = (existingSalaryRow.amountsByDate[dateStr] || 0) + (expense.amount || 0);
      } else {
        const amountsByDate: Record<string, number> = {};
        amountsByDate[dateStr] = expense.amount || 0;
        table.push({
          studentId: 'salary',
          studentName: 'Витрати на зарплату',
          activityId: 'salary',
          activityName: 'Зарплата',
          category: 'salary',
          amountsByDate,
        });
      }
    });
    
    return table;
  }, [studentsGrouped, data?.enrollments, data?.staffExpenses, financeTransactionsMap, attendanceMap, baseTariffIds, foodTariffIds, days, allActivities, dataUpdatedAt]);
  
  // Розрахунок "Разом за день" по категориям - суммируем данные из промежуточной таблицы
  const dailyTotalsByCategory = useMemo(() => {
    const totals: Record<ActivityCategory, Record<string, number>> = {
      income: {},
      additional_income: {},
      expense: {},
      household_expense: {},
      salary: {},
    };
    
    // Инициализируем все дни нулями для каждой категории
    days.forEach((day) => {
      const dateStr = formatDateString(day);
      Object.keys(totals).forEach(category => {
        totals[category as ActivityCategory][dateStr] = 0;
      });
    });

    // Доходы считаем из фактически отображаемых строк (таблицы по детям/активностям),
    // чтобы учесть Garden Attendance и не терять видимые суммы.
    dashboardDataTable.forEach((row) => {
      if (row.category === 'income' || row.category === 'additional_income') {
        Object.entries(row.amountsByDate).forEach(([dateStr, amount]) => {
          totals[row.category][dateStr] = (totals[row.category][dateStr] || 0) + amount;
        });
      }
    });

    // Расходы/зарплата берем из агрегированных дневных сумм
    days.forEach((day) => {
      const dateStr = formatDateString(day);
      totals.expense[dateStr] = Math.abs(dailyTotals.expense?.[dateStr] || 0);
      totals.household_expense[dateStr] = Math.abs(dailyTotals.household_expense?.[dateStr] || 0);
      totals.salary[dateStr] = Math.abs(salaryCombinedDaily[dateStr] || 0);
    });
    
    return totals;
  }, [dashboardDataTable, days, dailyTotals, salaryCombinedDaily]);
  
  // Розрахунок "Разом за день" (Доходи - Витрати) - суммируем данные из промежуточной таблицы
  const dailyDisplayTotals = useMemo(() => {
    const incomeTotals: Record<string, number> = {};
    const expenseTotals: Record<string, number> = {};
    const salaryTotals: Record<string, number> = {};
    
    // Инициализируем все дни нулями
    days.forEach((day) => {
      const dateStr = formatDateString(day);
      incomeTotals[dateStr] = 0;
      expenseTotals[dateStr] = 0;
      salaryTotals[dateStr] = 0;
    });
    
    days.forEach((day) => {
      const dateStr = formatDateString(day);
      incomeTotals[dateStr] =
        (dailyTotalsByCategory.income[dateStr] || 0) +
        (dailyTotalsByCategory.additional_income[dateStr] || 0);
      expenseTotals[dateStr] =
        (dailyTotalsByCategory.expense[dateStr] || 0) +
        (dailyTotalsByCategory.household_expense[dateStr] || 0);
      salaryTotals[dateStr] = dailyTotalsByCategory.salary[dateStr] || 0;
    });
    
    // Рассчитываем итоговые значения для каждого дня
    const netTotals: Record<string, number> = {};
    days.forEach((day) => {
      const dateStr = formatDateString(day);
      const income = incomeTotals[dateStr] || 0;
      const expenses = (expenseTotals[dateStr] || 0) + (salaryTotals[dateStr] || 0);
      netTotals[dateStr] = income - expenses;
    });
    
    return {
      income: incomeTotals,
      expense: expenseTotals,
      salary: salaryTotals,
      net: netTotals,
    };
  }, [dailyTotalsByCategory, days]);

  const summaryByCategory = useMemo(() => {
    const totals: Record<ActivityCategory, number> = {
      income: 0,
      additional_income: 0,
      expense: 0,
      household_expense: 0,
      salary: 0,
    };
    days.forEach((day) => {
      const dateStr = formatDateString(day);
      totals.income += dailyTotalsByCategory.income[dateStr] || 0;
      totals.additional_income += dailyTotalsByCategory.additional_income[dateStr] || 0;
      totals.expense += dailyTotalsByCategory.expense[dateStr] || 0;
      totals.household_expense += dailyTotalsByCategory.household_expense[dateStr] || 0;
      totals.salary += dailyTotalsByCategory.salary[dateStr] || 0;
    });
    return totals;
  }, [dailyTotalsByCategory, days]);

  const handlePrevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else { setMonth(month - 1); }
  };

  const handleNextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else { setMonth(month + 1); }
  };

  const handleRefresh = async () => {
    // Принудительно обновляем все данные дашборда
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
      refetchDashboard(),
      refetchSummary(),
    ]);
  };

  const totalIncome = summaryByCategory.income + summaryByCategory.additional_income;
  const totalExpense = summaryByCategory.expense + summaryByCategory.household_expense + summaryByCategory.salary;
  const profit = totalIncome - totalExpense;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Дашборд" description="Зведена таблиця за категоріями та відвідуваністю" />
      
      <div className="p-8 space-y-6">
        {/* Кнопка обновления данных */}
        <div className="flex justify-end">
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Оновити дані
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-card border border-border p-4 shadow-soft">
            <p className="text-sm text-muted-foreground">Доходи</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(totalIncome)}</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-4 shadow-soft">
            <p className="text-sm text-muted-foreground">Витрати</p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totalExpense)}</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-4 shadow-soft">
            <p className="text-sm text-muted-foreground">Прибуток</p>
            <p className={cn("text-2xl font-bold", profit >= 0 ? "text-success" : "text-destructive")}>
              {formatCurrency(profit)}
            </p>
          </div>
          <div className="rounded-xl bg-card border border-border p-4 shadow-soft flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth}><ChevronLeft className="h-5 w-5" /></Button>
            <div className="text-center">
              <p className="font-semibold">{MONTHS[month]}</p>
              <p className="text-sm text-muted-foreground">{year}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleNextMonth}><ChevronRight className="h-5 w-5" /></Button>
          </div>
        </div>

        {isMobile && (
          <div className="rounded-xl bg-card border border-border p-4 shadow-soft flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedDayIndex((prev) => Math.max(0, prev - 1))}
              disabled={selectedDayIndex <= 0}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="text-center">
              <p className="font-semibold">{selectedDay ? formatDateString(selectedDay) : ''}</p>
              <p className="text-sm text-muted-foreground">{selectedDay ? getWeekdayShort(selectedDay) : ''}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedDayIndex((prev) => Math.min(days.length - 1, prev + 1))}
              disabled={selectedDayIndex >= days.length - 1}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Групування по дітях */}
        {CATEGORY_ORDER.map((category) => {
          const categoryStudents = studentsGrouped.filter(student =>
            student.activities.some(act => act.category === category)
          );

          // Для категорії "salary" показуємо навіть якщо немає enrollments, бо витрати беруться з staff_journal_entries
          const categoryTotal = summaryByCategory[category] || 0;
          const hasDailyTotals = Object.values(dailyTotalsByCategory[category] || {}).some((value) => value !== 0);
          const hasData = categoryStudents.length > 0 || hasDailyTotals || Math.abs(categoryTotal) > 0;
          if (!hasData) return null;

          const styles = CATEGORY_STYLES[category];

          if (isMobile) {
            return (
              <div key={category} className="rounded-xl bg-card border border-border shadow-soft overflow-hidden">
                <div className={cn("px-4 py-3 border-b flex items-center justify-between", styles.bg, styles.border)}>
                  <h3 className={cn("font-semibold", styles.text)}>{ACTIVITY_CATEGORY_LABELS[category]}</h3>
                  <span className={cn("text-base font-bold", styles.text)}>{formatCurrency(summaryByCategory[category] || 0)}</span>
                </div>
                <div className="divide-y">
                  {categoryStudents.map((student) =>
                    student.activities.map((activity) => {
                      const enrollment = data?.enrollments.find(e => e.id === activity.enrollmentId);
                      if (!enrollment) return null;

                      const isBaseOrFoodTariff = baseTariffIds.has(activity.activityId) || foodTariffIds.has(activity.activityId);
                      let activityData: Record<string, number> = {};
                      if (isBaseOrFoodTariff) {
                        const transactionKey = `${student.studentId}-${activity.activityId}`;
                        activityData = financeTransactionsMap[transactionKey] || {};
                      } else {
                        activityData = attendanceMap[enrollment.id] || {};
                      }

                      const dayAmount = activityData[selectedDateStr] || 0;
                      const rowTotal = Object.values(activityData).reduce((sum, val) => sum + val, 0);
                      const isFoodActivity = foodTariffIds.has(activity.activityId);

                      return (
                        <div
                          key={activity.enrollmentId}
                          className={cn('p-4', !enrollment.is_active && 'bg-muted/40 text-muted-foreground')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: activity.activityColor }} />
                                {student.studentId ? (
                                  <Link to={`/students/${student.studentId}`} className="font-medium text-primary hover:underline truncate">
                                    {student.studentName}
                                  </Link>
                                ) : (
                                  <span className="font-medium truncate">{student.studentName}</span>
                                )}
                                {!enrollment.is_active && (
                                  <span className="rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide">
                                    Архів
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {isFoodActivity ? `+ ${activity.activityName}` : activity.activityName}
                              </p>
                            </div>
                            <div className="text-right text-sm">
                              <div className={cn(dayAmount > 0 ? "text-success" : dayAmount < 0 ? "text-destructive" : "text-muted-foreground")}>
                                {dayAmount !== 0 ? formatCurrency(dayAmount) : '—'}
                              </div>
                              <div className={cn("text-xs", rowTotal > 0 ? "text-success" : rowTotal < 0 ? "text-destructive" : "text-muted-foreground")}>
                                Разом: {rowTotal !== 0 ? formatCurrency(rowTotal) : '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {category === 'salary' && categoryStudents.length === 0 && data?.staffExpenses && data.staffExpenses.length > 0 && (
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">Витрати на зарплату</p>
                          <p className="text-xs text-muted-foreground">З журналу витрат</p>
                        </div>
                      <div className="text-right text-sm">
                        <div className="text-destructive">
                          {dailyTotals.salary[selectedDateStr]
                            ? formatCurrency(Math.abs(dailyTotals.salary[selectedDateStr]))
                            : '—'}
                        </div>
                        <div className="text-xs text-destructive">
                          Разом: {formatCurrency(Math.abs(summaryByCategory.salary || 0))}
                        </div>
                      </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={category} className="rounded-xl bg-card border border-border shadow-soft overflow-visible">
              <div className={cn("px-6 py-3 border-b flex items-center justify-between", styles.bg, styles.border)}>
                <h3 className={cn("font-semibold", styles.text)}>{ACTIVITY_CATEGORY_LABELS[category]}</h3>
                <span className={cn("text-lg font-bold", styles.text)}>{formatCurrency(summaryByCategory[category] || 0)}</span>
              </div>
              <StickyDateTable
                days={days}
                leftHeader="Дитина / Активність"
                rightHeader="Разом"
                tableScrollRefs={tableScrollRefs}
              >
                    {categoryStudents.map((student, studentIndex) => 
                      student.activities.map((activity, activityIndex) => {
                        const enrollment = data?.enrollments.find(e => e.id === activity.enrollmentId);
                        if (!enrollment) return null;

                        // Check if this activity is a base tariff or food tariff from Garden Attendance Journal
                        const isBaseOrFoodTariff = baseTariffIds.has(activity.activityId) || foodTariffIds.has(activity.activityId);
                        
                        let activityData: Record<string, number> = {};
                        let rowTotal = 0;
                        
                        if (isBaseOrFoodTariff) {
                          // For Garden Attendance Journal base/food tariffs: use finance_transactions
                          const transactionKey = `${student.studentId}-${activity.activityId}`;
                          activityData = financeTransactionsMap[transactionKey] || {};
                        } else {
                          // For regular journals: use attendance
                          activityData = attendanceMap[enrollment.id] || {};
                        }
                        
                        rowTotal = Object.values(activityData).reduce((sum, val) => sum + val, 0);
                        const isIncome = category === 'income' || category === 'additional_income';
                        // Проверяем, является ли это активностью питания (расход для организации)
                        const isFoodActivity = foodTariffIds.has(activity.activityId);
                        
                        const isStripedGroup = studentIndex % 2 === 1;
                        const isLastInGroup = activityIndex === student.activities.length - 1;
                        const rowBgClass = cn(
                          isStripedGroup ? 'bg-amber-50/60' : 'bg-card',
                          !enrollment.is_active && 'bg-muted/40'
                        );

                        return (
                          <tr
                            key={activity.enrollmentId}
                            className={cn(
                              "border-b hover:bg-muted/20",
                              isStripedGroup && "bg-amber-50/60",
                              isLastInGroup && "border-b-2",
                              !enrollment.is_active && "bg-muted/40 text-muted-foreground"
                            )}
                          >
                            <td className={cn("py-2 px-3 sticky left-0 z-10", rowBgClass)}>
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: activity.activityColor }} />
                                <div className="min-w-0">
                                  {student.studentId ? (
                                    <Link
                                      to={`/students/${student.studentId}`}
                                      className="font-medium truncate text-primary hover:underline"
                                    >
                                      {student.studentName}
                                    </Link>
                                  ) : (
                                    <p className="font-medium truncate">{student.studentName}</p>
                                  )}
                                  {!enrollment.is_active && (
                                    <span className="mt-1 inline-flex rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide">
                                      Архів
                                    </span>
                                  )}
                                  <p className="text-xs text-muted-foreground truncate">
                                    {activity.activityName}
                                  </p>
                                </div>
                              </div>
                            </td>
                            {days.map((day) => {
                              const dateStr = formatDateString(day);
                              const amount = activityData[dateStr];
                              // For food activity, amount is already negative (expense)
                              return (
                                <td
                                  key={formatDateString(day)}
                                  className={cn("py-1.5 px-0.5 text-center", rowBgClass, isWeekend(day) && WEEKEND_BG_COLOR)}
                                >
                                  {amount !== undefined && amount !== 0 && (
                                    <span className={cn("text-xs font-medium leading-tight", amount > 0 ? "text-success" : "text-destructive")}>
                                      {formatCurrency(amount)}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className={cn("py-2 px-3 text-right font-semibold sticky right-0 z-10", rowBgClass, rowTotal > 0 ? "text-success" : rowTotal < 0 ? "text-destructive" : "")}>
                              {rowTotal !== 0 ? formatCurrency(rowTotal) : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                    {category === 'salary' && categoryStudents.length === 0 && Object.values(salaryAccrualsDaily).some((value) => value !== 0) && (
                      <tr className="border-b hover:bg-muted/20">
                        <td className="py-2 px-3 sticky left-0 z-10 bg-card">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">Нарахування зарплати</p>
                              <p className="text-xs text-muted-foreground truncate">З журналу відвідуваності</p>
                            </div>
                          </div>
                        </td>
                        {days.map((day) => {
                          const dateStr = formatDateString(day);
                          const dayTotal = salaryAccrualsDaily[dateStr] || 0;
                          return (
                            <td key={formatDateString(day)} className={cn("py-1.5 px-0.5 text-center", isWeekend(day) && WEEKEND_BG_COLOR)}>
                              {dayTotal !== 0 && (
                                <span className="text-xs font-medium leading-tight text-destructive">
                                  {formatCurrency(Math.abs(dayTotal))}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 text-right font-semibold sticky right-0 z-10 bg-card text-destructive">
                          {formatCurrency(Math.abs(Object.values(salaryAccrualsDaily).reduce((sum, val) => sum + (val || 0), 0)))}
                        </td>
                      </tr>
                    )}
                    {/* Для категорій витрат без записів по дітях показуємо суму по транзакціях */}
                    {category !== 'salary' && categoryStudents.length === 0 && hasDailyTotals && (
                      <tr className="border-b hover:bg-muted/20">
                        <td className="py-2 px-3 sticky left-0 z-10 bg-card">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">Витрати за активностями</p>
                              <p className="text-xs text-muted-foreground truncate">З журналу витрат</p>
                            </div>
                          </div>
                        </td>
                        {days.map((day) => {
                          const dateStr = formatDateString(day);
                          const dayTotal = dailyTotals[category][dateStr] || 0;
                          return (
                            <td key={formatDateString(day)} className={cn("py-1.5 px-0.5 text-center", isWeekend(day) && WEEKEND_BG_COLOR)}>
                              {dayTotal !== 0 && (
                                <span className="text-xs font-medium leading-tight text-destructive">
                                  {formatCurrency(Math.abs(dayTotal))}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 text-right font-semibold sticky right-0 z-10 bg-card text-destructive">
                          {formatCurrency(Math.abs(summaryByCategory[category] || 0))}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td className="py-2 px-3 sticky left-0 z-10 bg-muted/20">Разом за день</td>
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        // Используем только данные из dashboardDataTable (через dailyTotalsByCategory)
                        // dashboardDataTable уже содержит все данные из таблицы, включая Garden Attendance Journal и обычные журналы
                        const dayTotal = dailyTotalsByCategory[category][dateStr] || 0;
                        const isIncome = category === 'income' || category === 'additional_income';
                        return (
                          <td key={formatDateString(day)} className={cn("py-1.5 px-0.5 text-center text-xs leading-tight", isWeekend(day) && WEEKEND_BG_COLOR, isIncome ? "text-success" : "text-destructive")}>
                            {dayTotal > 0 ? formatCurrency(dayTotal) : ''}
                          </td>
                        );
                      })}
                      <td className={cn("py-2 px-3 text-right sticky right-0 z-10 bg-muted/20", (category === 'income' || category === 'additional_income') ? "text-success" : "text-destructive")}>
                        {formatCurrency(summaryByCategory[category] || 0)}
                      </td>
                    </tr>
              </StickyDateTable>
            </div>
          );
        })}

        {/* Загальний рядок "Разом за день" (Доходи - Витрати) */}
        <div className="rounded-xl bg-card border border-border shadow-soft overflow-visible">
          <div className="px-6 py-3 border-b bg-muted/20">
            <h3 className="font-semibold text-foreground">Разом за день (Доходи - Витрати)</h3>
          </div>
          <StickyDateTable
            days={days}
            leftHeader="Розрахунок"
            rightHeader="Разом"
            tableScrollRefs={tableScrollRefs}
          >
                {/* Рядок "Доходи" */}
                <tr className="border-b hover:bg-muted/20">
                  <td className="py-2 px-3 sticky left-0 z-10 bg-card font-medium text-success">Доходи</td>
                  {days.map((day) => {
                    const dateStr = formatDateString(day);
                    const income = dailyDisplayTotals.income[dateStr] || 0;
                    return (
                      <td key={formatDateString(day)} className={cn("py-1.5 px-0.5 text-center text-xs leading-tight text-success", isWeekend(day) && WEEKEND_BG_COLOR)}>
                        {income > 0 ? formatCurrency(income) : ''}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-right font-semibold sticky right-0 z-10 bg-card text-success">
                    {formatCurrency(Object.values(dailyDisplayTotals.income).reduce((sum, val) => sum + val, 0))}
                  </td>
                </tr>
                {/* Рядок "Витрати" */}
                <tr className="border-b hover:bg-muted/20">
                  <td className="py-2 px-3 sticky left-0 z-10 bg-card font-medium text-destructive">Витрати</td>
                  {days.map((day) => {
                    const dateStr = formatDateString(day);
                    const expenses = (dailyDisplayTotals.expense[dateStr] || 0) + (dailyDisplayTotals.salary[dateStr] || 0);
                    return (
                      <td key={formatDateString(day)} className={cn("py-1.5 px-0.5 text-center text-xs leading-tight text-destructive", isWeekend(day) && WEEKEND_BG_COLOR)}>
                        {expenses > 0 ? formatCurrency(expenses) : ''}
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-right font-semibold sticky right-0 z-10 bg-card text-destructive">
                    {formatCurrency(
                      Object.values(dailyDisplayTotals.expense).reduce((sum, val) => sum + val, 0) +
                      Object.values(dailyDisplayTotals.salary).reduce((sum, val) => sum + val, 0)
                    )}
                  </td>
                </tr>
                {/* Рядок "Разом за день" (Доходи - Витрати) */}
                <tr className="border-t-2 bg-muted/20 font-semibold">
                  <td className="py-2 px-4 sticky left-0 bg-muted/20">Разом за день</td>
                  {days.map((day) => {
                    const dateStr = formatDateString(day);
                    const netTotal = dailyDisplayTotals.net[dateStr] || 0;
                    return (
                      <td key={formatDateString(day)} className={cn(
                        "py-1.5 px-0.5 text-center text-xs font-semibold leading-tight",
                        isWeekend(day) && WEEKEND_BG_COLOR,
                        netTotal >= 0 ? "text-success" : "text-destructive"
                      )}>
                        {netTotal !== 0 ? formatCurrency(netTotal) : ''}
                      </td>
                    );
                  })}
                  <td className={cn(
                    "py-2 px-3 text-right sticky right-0 z-10 bg-muted/20 font-semibold",
                    Object.values(dailyDisplayTotals.net).reduce((sum, val) => sum + val, 0) >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {formatCurrency(Object.values(dailyDisplayTotals.net).reduce((sum, val) => sum + val, 0))}
                  </td>
                </tr>
          </StickyDateTable>
        </div>

        {studentsGrouped.length === 0 && (
          <div className="rounded-xl bg-card border border-border p-12 text-center text-muted-foreground">
            <p className="text-lg">Немає даних для відображення</p>
            <p className="text-sm mt-2">Додайте активності та запишіть дітей для відображення зведення</p>
          </div>
        )}
      </div>
    </>
  );
}

function StickyDateTable({
  days,
  leftHeader,
  rightHeader,
  children,
  topOffsetClass = 'top-16',
  colWidths = { left: 180, day: 36, right: 80 },
  tableScrollRefs,
}: {
  days: Date[];
  leftHeader: React.ReactNode;
  rightHeader: React.ReactNode;
  children: React.ReactNode;
  topOffsetClass?: string;
  colWidths?: { left: number; day: number; right: number };
  tableScrollRefs?: React.MutableRefObject<Set<HTMLDivElement>>;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    // Добавляем этот body в набор для синхронизации
    if (tableScrollRefs) {
      tableScrollRefs.current.add(body);
    }

    // Синхронизация header с body
    const syncHeader = () => {
      if (headerRef.current) {
        headerRef.current.scrollLeft = body.scrollLeft;
      }
    };

    // Синхронизация всех таблиц
    const syncAll = (sourceBody: HTMLDivElement) => {
      const scrollLeft = sourceBody.scrollLeft;
      
      // Синхронизируем все таблицы с источником
      tableScrollRefs?.current.forEach((tableBody) => {
        if (tableBody !== sourceBody && tableBody.scrollLeft !== scrollLeft) {
          tableBody.scrollLeft = scrollLeft;
        }
      });
      
      // Обновляем header этой таблицы
      if (headerRef.current) {
        headerRef.current.scrollLeft = scrollLeft;
      }
    };

    // Синхронизация при скролле этой таблицы
    const syncOnScroll = () => {
      syncAll(body);
    };

    body.addEventListener('scroll', syncOnScroll, { passive: true });
    body.addEventListener('scroll', syncHeader, { passive: true });
    

    syncHeader();
    
    return () => {
      body.removeEventListener('scroll', syncOnScroll);
      body.removeEventListener('scroll', syncHeader);
      if (tableScrollRefs) {
        tableScrollRefs.current.delete(body);
      }
    };
  }, [days.length, tableScrollRefs]);

  const tableColGroup = (
    <colgroup>
      <col style={{ width: `${colWidths.left}px`, minWidth: `${colWidths.left}px` }} />
      {days.map((day) => (
        <col key={formatDateString(day)} style={{ width: `${colWidths.day}px`, minWidth: `${colWidths.day}px` }} />
      ))}
      <col style={{ width: `${colWidths.right}px`, minWidth: `${colWidths.right}px` }} />
    </colgroup>
  );

  // Вычисляем общую ширину таблицы
  const totalWidth = colWidths.left + (days.length * colWidths.day) + colWidths.right;

  return (
    <div className="space-y-0">
      <div className={cn("sticky z-20 bg-card", topOffsetClass)}>
        <div ref={headerRef} className="overflow-x-auto">
          <div style={{ width: `${totalWidth}px`, minWidth: `${totalWidth}px` }}>
            <table className="text-sm border-collapse table-fixed" style={{ width: `${totalWidth}px` }}>
              {tableColGroup}
              <thead>
                <tr className="border-b bg-muted/30">
                  <th
                    className="text-left py-2 px-3 font-medium sticky left-0 z-30 bg-muted/30"
                    style={{ width: `${colWidths.left}px` }}
                  >
                    {leftHeader}
                  </th>
                  {days.map((day) => (
                    <th
                      key={formatDateString(day)}
                      className={cn(
                        "py-1.5 px-0.5 text-center font-medium bg-muted/30",
                        isWeekend(day) && WEEKEND_BG_COLOR
                      )}
                      style={{ width: `${colWidths.day}px` }}
                    >
                      <div className="text-[11px] text-muted-foreground leading-tight">{getWeekdayShort(day)}</div>
                      <div className="text-xs leading-tight">{formatShortDate(day)}</div>
                    </th>
                  ))}
                  <th
                    className="py-2 px-3 text-right font-semibold sticky right-0 z-30 bg-muted/30"
                    style={{ width: `${colWidths.right}px` }}
                  >
                    {rightHeader}
                  </th>
                </tr>
              </thead>
            </table>
          </div>
        </div>
      </div>
      <div ref={bodyRef} className="overflow-x-auto">
        <div style={{ width: `${totalWidth}px`, minWidth: `${totalWidth}px` }}>
          <table className="text-sm border-collapse table-fixed" style={{ width: `${totalWidth}px` }}>
            {tableColGroup}
            <tbody>{children}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
