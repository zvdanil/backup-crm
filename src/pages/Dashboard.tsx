import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { useDashboardData, useCategorySummary } from '@/hooks/useDashboardData';
import { ACTIVITY_CATEGORY_LABELS, type ActivityCategory } from '@/hooks/useActivities';
import { formatCurrency, getDaysInMonth, formatShortDate, getWeekdayShort, isWeekend, formatDateString } from '@/lib/attendance';
import { cn } from '@/lib/utils';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

const CATEGORY_ORDER: ActivityCategory[] = ['income', 'additional_income', 'expense', 'household_expense'];

const CATEGORY_STYLES: Record<ActivityCategory, { bg: string; text: string; border: string }> = {
  income: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  additional_income: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  expense: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
  household_expense: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
};

interface GroupedActivity {
  activityName: string;
  activityColor: string;
  enrollments: Array<{
    id: string;
    students: { id: string; full_name: string };
  }>;
}

export default function Dashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data, isLoading } = useDashboardData(year, month);
  const { data: summary } = useCategorySummary(year, month);

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const groupedData = useMemo(() => {
    if (!data?.enrollments) return {} as Record<ActivityCategory, Record<string, GroupedActivity>>;

    const groups: Record<ActivityCategory, Record<string, GroupedActivity>> = {
      income: {},
      additional_income: {},
      expense: {},
      household_expense: {},
    };

    data.enrollments.forEach((enrollment) => {
      const category = enrollment.activities.category;
      const activityId = enrollment.activity_id;

      if (!groups[category][activityId]) {
        groups[category][activityId] = {
          activityName: enrollment.activities.name,
          activityColor: enrollment.activities.color,
          enrollments: [],
        };
      }
      groups[category][activityId].enrollments.push({
        id: enrollment.id,
        students: enrollment.students,
      });
    });

    return groups;
  }, [data?.enrollments]);

  const attendanceMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    data?.attendance?.forEach((att) => {
      if (!map[att.enrollment_id]) map[att.enrollment_id] = {};
      map[att.enrollment_id][att.date] = att.charged_amount;
    });
    return map;
  }, [data?.attendance]);

  const dailyTotals = useMemo(() => {
    const totals: Record<ActivityCategory, Record<string, number>> = {
      income: {}, additional_income: {}, expense: {}, household_expense: {},
    };
    data?.attendance?.forEach((att) => {
      const enrollment = data.enrollments.find(e => e.id === att.enrollment_id);
      if (enrollment) {
        const category = enrollment.activities.category;
        totals[category][att.date] = (totals[category][att.date] || 0) + att.charged_amount;
      }
    });
    return totals;
  }, [data]);

  const handlePrevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else { setMonth(month - 1); }
  };

  const handleNextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else { setMonth(month + 1); }
  };

  const totalIncome = (summary?.income || 0) + (summary?.additional_income || 0);
  const totalExpense = (summary?.expense || 0) + (summary?.household_expense || 0);
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

        {CATEGORY_ORDER.map((category) => {
          const categoryData = groupedData[category];
          if (!categoryData || Object.keys(categoryData).length === 0) return null;
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
                    {Object.entries(categoryData).map(([activityId, group]) => 
                      group.enrollments.map((enrollment) => {
                        const enrollmentAttendance = attendanceMap[enrollment.id] || {};
                        const rowTotal = Object.values(enrollmentAttendance).reduce((sum, val) => sum + val, 0);
                        const isIncome = category === 'income' || category === 'additional_income';
                        return (
                          <tr key={enrollment.id} className="border-b hover:bg-muted/20">
                            <td className="py-2 px-4 sticky left-0 bg-card">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.activityColor }} />
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{enrollment.students.full_name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{group.activityName}</p>
                                </div>
                              </div>
                            </td>
                            {days.map((day) => {
                              const dateStr = formatDateString(day);
                              const amount = enrollmentAttendance[dateStr];
                              return (
                                <td key={formatDateString(day)} className={cn("py-2 px-1 text-center", isWeekend(day) && "bg-muted/30")}>
                                  {amount !== undefined && amount > 0 && (
                                    <span className={cn("text-xs font-medium", isIncome ? "text-success" : "text-destructive")}>{amount}</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className={cn("py-2 px-4 text-right font-semibold sticky right-0 bg-card", isIncome ? "text-success" : "text-destructive")}>
                              {rowTotal > 0 ? formatCurrency(rowTotal) : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                    <tr className="border-t-2 bg-muted/20 font-semibold">
                      <td className="py-2 px-4 sticky left-0 bg-muted/20">Разом за день</td>
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        const dayTotal = dailyTotals[category][dateStr] || 0;
                        const isIncome = category === 'income' || category === 'additional_income';
                        return (
                          <td key={formatDateString(day)} className={cn("py-2 px-1 text-center text-xs", isWeekend(day) && "bg-muted/30", isIncome ? "text-success" : "text-destructive")}>
                            {dayTotal > 0 ? dayTotal : ''}
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

        {Object.values(groupedData).every(cat => Object.keys(cat).length === 0) && (
          <div className="rounded-xl bg-card border border-border p-12 text-center text-muted-foreground">
            <p className="text-lg">Немає даних для відображення</p>
            <p className="text-sm mt-2">Додайте активності та запишіть дітей для відображення зведення</p>
          </div>
        )}
      </div>
    </>
  );
}
