import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { useDashboardData, useCategorySummary } from '@/hooks/useDashboardData';
import { useActivities } from '@/hooks/useActivities';
import { ACTIVITY_CATEGORY_LABELS, type ActivityCategory } from '@/hooks/useActivities';
import { formatCurrency, getDaysInMonth, formatShortDate, getWeekdayShort, isWeekend, formatDateString } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { isGardenAttendanceController, type GardenAttendanceConfig } from '@/lib/gardenAttendance';
import { useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();

  const { data, isLoading, refetch: refetchDashboard, dataUpdatedAt } = useDashboardData(year, month);
  const { data: summary, refetch: refetchSummary } = useCategorySummary(year, month);
  const { data: allActivities = [] } = useActivities();

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

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

  // Групування по дітях (исключаем управляющие активности, но добавляем базовые тарифы и питание)
  const studentsGrouped = useMemo(() => {
    if (!data?.enrollments) return [] as StudentGroup[];

    const studentMap = new Map<string, StudentGroup>();
    const processedEnrollmentIds = new Set<string>();

    // Сначала обрабатываем обычные enrollments (исключаем управляющие активности)
    data.enrollments.forEach((enrollment) => {
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
                 e.is_active &&
                 !processedEnrollmentIds.has(e.id)
          );

          if (tariffEnrollment) {
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
  }, [data?.enrollments, allActivities, dataUpdatedAt]);

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
        } else if (trans.type === 'expense') {
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
    
    // Суммируем значения из промежуточной таблицы по категориям
    dashboardDataTable.forEach((row) => {
      Object.entries(row.amountsByDate).forEach(([dateStr, amount]) => {
        if (row.category === 'expense' || row.category === 'household_expense') {
          // Для расходов берем абсолютное значение
          totals[row.category][dateStr] = (totals[row.category][dateStr] || 0) + Math.abs(amount);
        } else {
          totals[row.category][dateStr] = (totals[row.category][dateStr] || 0) + amount;
        }
      });
    });
    
    return totals;
  }, [dashboardDataTable, days]);
  
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
    
    // Суммируем значения из промежуточной таблицы
    dashboardDataTable.forEach((row) => {
      const isIncome = row.category === 'income' || row.category === 'additional_income';
      const isExpense = row.category === 'expense' || row.category === 'household_expense';
      const isSalary = row.category === 'salary';
      
      Object.entries(row.amountsByDate).forEach(([dateStr, amount]) => {
        if (isIncome) {
          incomeTotals[dateStr] = (incomeTotals[dateStr] || 0) + amount;
        } else if (isExpense) {
          expenseTotals[dateStr] = (expenseTotals[dateStr] || 0) + Math.abs(amount);
        } else if (isSalary) {
          salaryTotals[dateStr] = (salaryTotals[dateStr] || 0) + amount;
        }
      });
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
  }, [dashboardDataTable, days]);

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

  const totalIncome = (summary?.income || 0) + (summary?.additional_income || 0);
  const totalExpense = (summary?.expense || 0) + (summary?.household_expense || 0) + (summary?.salary || 0);
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

        {/* Групування по дітях */}
        {CATEGORY_ORDER.map((category) => {
          const categoryStudents = studentsGrouped.filter(student =>
            student.activities.some(act => act.category === category)
          );

          // Для категорії "salary" показуємо навіть якщо немає enrollments, бо витрати беруться з staff_journal_entries
          const hasData = categoryStudents.length > 0 || (category === 'salary' && (summary?.[category] || 0) > 0);
          if (!hasData) return null;

          const styles = CATEGORY_STYLES[category];

          return (
            <div key={category} className="rounded-xl bg-card border border-border shadow-soft overflow-hidden">
              <div className={cn("px-6 py-3 border-b flex items-center justify-between", styles.bg, styles.border)}>
                <h3 className={cn("font-semibold", styles.text)}>{ACTIVITY_CATEGORY_LABELS[category]}</h3>
                <span className={cn("text-lg font-bold", styles.text)}>{formatCurrency(summary?.[category] || 0)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-2 px-4 font-medium sticky left-0 bg-muted/30 min-w-[200px]">Дитина / Активність</th>
                      {days.map((day) => (
                        <th key={formatDateString(day)} className={cn("py-2 px-1 text-center min-w-[40px] font-medium", isWeekend(day) && "bg-muted/50")}>
                          <div className="text-xs text-muted-foreground">{getWeekdayShort(day)}</div>
                          <div>{formatShortDate(day)}</div>
                        </th>
                      ))}
                      <th className="py-2 px-4 text-right font-semibold sticky right-0 bg-muted/30 min-w-[100px]">Разом</th>
                    </tr>
                  </thead>
                  <tbody>
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
                        const rowBgClass = isStripedGroup ? 'bg-amber-50/60' : 'bg-card';

                        return (
                          <tr
                            key={activity.enrollmentId}
                            className={cn(
                              "border-b hover:bg-muted/20",
                              isStripedGroup && "bg-amber-50/60",
                              isLastInGroup && "border-b-2"
                            )}
                          >
                            <td className={cn("py-2 px-4 sticky left-0", rowBgClass)}>
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: activity.activityColor }} />
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{student.studentName}</p>
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
                                  className={cn("py-2 px-1 text-center", rowBgClass, isWeekend(day) && "bg-muted/30")}
                                >
                                  {amount !== undefined && amount !== 0 && (
                                    <span className={cn("text-xs font-medium", amount > 0 ? "text-success" : "text-destructive")}>
                                      {formatCurrency(amount)}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className={cn("py-2 px-4 text-right font-semibold sticky right-0", rowBgClass, rowTotal > 0 ? "text-success" : rowTotal < 0 ? "text-destructive" : "")}>
                              {rowTotal !== 0 ? formatCurrency(rowTotal) : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                    {/* Для категорії "salary" відображаємо витрати на зарплату з staff_journal_entries */}
                    {category === 'salary' && categoryStudents.length === 0 && data?.staffExpenses && data.staffExpenses.length > 0 && (
                      <tr className="border-b hover:bg-muted/20">
                        <td className="py-2 px-4 sticky left-0 bg-card">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">Витрати на зарплату</p>
                              <p className="text-xs text-muted-foreground truncate">З журналу витрат</p>
                            </div>
                          </div>
                        </td>
                        {days.map((day) => {
                          const dateStr = formatDateString(day);
                          const dayTotal = dailyTotals.salary[dateStr] || 0;
                          return (
                            <td key={formatDateString(day)} className={cn("py-2 px-1 text-center", isWeekend(day) && "bg-muted/30")}>
                              {dayTotal > 0 && (
                                <span className="text-xs font-medium text-destructive">
                                  {formatCurrency(dayTotal)}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-4 text-right font-semibold sticky right-0 bg-card text-destructive">
                          {formatCurrency(summary?.salary || 0)}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td className="py-2 px-4 sticky left-0 bg-muted/20">Разом за день</td>
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        // Используем только данные из dashboardDataTable (через dailyTotalsByCategory)
                        // dashboardDataTable уже содержит все данные из таблицы, включая Garden Attendance Journal и обычные журналы
                        const dayTotal = dailyTotalsByCategory[category][dateStr] || 0;
                        const isIncome = category === 'income' || category === 'additional_income';
                        return (
                          <td key={formatDateString(day)} className={cn("py-2 px-1 text-center text-xs", isWeekend(day) && "bg-muted/30", isIncome ? "text-success" : "text-destructive")}>
                            {dayTotal > 0 ? formatCurrency(dayTotal) : ''}
                          </td>
                        );
                      })}
                      <td className={cn("py-2 px-4 text-right sticky right-0 bg-muted/20", (category === 'income' || category === 'additional_income') ? "text-success" : "text-destructive")}>
                        {formatCurrency(summary?.[category] || 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* Загальний рядок "Разом за день" (Доходи - Витрати) */}
        <div className="rounded-xl bg-card border border-border shadow-soft overflow-hidden">
          <div className="px-6 py-3 border-b bg-muted/20">
            <h3 className="font-semibold text-foreground">Разом за день (Доходи - Витрати)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-2 px-4 font-medium sticky left-0 bg-muted/30 min-w-[200px]">Розрахунок</th>
                  {days.map((day) => (
                    <th key={formatDateString(day)} className={cn("py-2 px-1 text-center min-w-[40px] font-medium", isWeekend(day) && "bg-muted/50")}>
                      <div className="text-xs text-muted-foreground">{getWeekdayShort(day)}</div>
                      <div>{formatShortDate(day)}</div>
                    </th>
                  ))}
                  <th className="py-2 px-4 text-right font-semibold sticky right-0 bg-muted/30 min-w-[100px]">Разом</th>
                </tr>
              </thead>
              <tbody>
                {/* Рядок "Доходи" */}
                <tr className="border-b hover:bg-muted/20">
                  <td className="py-2 px-4 sticky left-0 bg-card font-medium text-success">Доходи</td>
                  {days.map((day) => {
                    const dateStr = formatDateString(day);
                    const income = dailyDisplayTotals.income[dateStr] || 0;
                    return (
                      <td key={formatDateString(day)} className={cn("py-2 px-1 text-center text-xs text-success", isWeekend(day) && "bg-muted/30")}>
                        {income > 0 ? formatCurrency(income) : ''}
                      </td>
                    );
                  })}
                  <td className="py-2 px-4 text-right font-semibold sticky right-0 bg-card text-success">
                    {formatCurrency(Object.values(dailyDisplayTotals.income).reduce((sum, val) => sum + val, 0))}
                  </td>
                </tr>
                {/* Рядок "Витрати" */}
                <tr className="border-b hover:bg-muted/20">
                  <td className="py-2 px-4 sticky left-0 bg-card font-medium text-destructive">Витрати</td>
                  {days.map((day) => {
                    const dateStr = formatDateString(day);
                    const expenses = (dailyDisplayTotals.expense[dateStr] || 0) + (dailyDisplayTotals.salary[dateStr] || 0);
                    return (
                      <td key={formatDateString(day)} className={cn("py-2 px-1 text-center text-xs text-destructive", isWeekend(day) && "bg-muted/30")}>
                        {expenses > 0 ? formatCurrency(expenses) : ''}
                      </td>
                    );
                  })}
                  <td className="py-2 px-4 text-right font-semibold sticky right-0 bg-card text-destructive">
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
                        "py-2 px-1 text-center text-xs font-semibold",
                        isWeekend(day) && "bg-muted/30",
                        netTotal >= 0 ? "text-success" : "text-destructive"
                      )}>
                        {netTotal !== 0 ? formatCurrency(netTotal) : ''}
                      </td>
                    );
                  })}
                  <td className={cn(
                    "py-2 px-4 text-right sticky right-0 bg-muted/20 font-semibold",
                    Object.values(dailyDisplayTotals.net).reduce((sum, val) => sum + val, 0) >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {formatCurrency(Object.values(dailyDisplayTotals.net).reduce((sum, val) => sum + val, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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
