import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { GardenAttendanceCell } from '@/components/attendance/GardenAttendanceCell';
import { useEnrollments } from '@/hooks/useEnrollments';
import { useActivities } from '@/hooks/useActivities';
import { useGroups } from '@/hooks/useGroups';
import { useSetAttendance, useAttendance, useDeleteAttendance } from '@/hooks/useAttendance';
import { useUpsertFinanceTransaction, useDeleteFinanceTransaction } from '@/hooks/useFinanceTransactions';
import { supabase } from '@/integrations/supabase/client';
import { calculateDailyAccrual } from '@/lib/gardenAttendance';
import { 
  getDaysInMonth, 
  formatShortDate, 
  getWeekdayShort, 
  isWeekend,
  WEEKEND_BG_COLOR,
  formatDateString,
  filterDaysByPeriod,
  type PeriodFilter
} from '@/lib/attendance';
import type { AttendanceStatus } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

export default function GardenAttendanceJournal() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('month');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set(['all']));
  const [controllerActivityId, setControllerActivityId] = useState<string>('');
  const [selectedDayIndex, setSelectedDayIndex] = useState(now.getDate() - 1);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const isMobile = useIsMobile();
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const totalsScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { data: activities = [] } = useActivities();
  const { data: groups = [] } = useGroups();
  
  // Find controller activity (Garden Attendance Journal)
  const controllerActivity = useMemo(() => {
    return activities.find(activity => {
      const config = activity.config as any;
      return config && config.base_tariff_ids && Array.isArray(config.base_tariff_ids) && config.base_tariff_ids.length > 0;
    });
  }, [activities]);

  // Auto-select controller activity
  useMemo(() => {
    if (controllerActivity && !controllerActivityId) {
      setControllerActivityId(controllerActivity.id);
    }
  }, [controllerActivity, controllerActivityId]);

  // Get enrollments for controller activity
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useEnrollments({ 
    activityId: controllerActivityId
  });

  // Get attendance data for the month
  const { data: attendanceData = [], isLoading: attendanceLoading } = useAttendance({ 
    activityId: controllerActivityId, 
    month, 
    year 
  });

  // Get all activities as map for quick lookup
  const activitiesMap = useMemo(() => {
    const map = new Map<string, typeof activities[0]>();
    activities.forEach(activity => {
      map.set(activity.id, activity);
    });
    return map;
  }, [activities]);

  // Get all enrollments for students (for calculateDailyAccrual)
  const { data: allEnrollments = [] } = useEnrollments({ activeOnly: true });

  const setAttendance = useSetAttendance();
  const deleteAttendance = useDeleteAttendance();
  const upsertTransaction = useUpsertFinanceTransaction();
  const deleteTransaction = useDeleteFinanceTransaction();

  const allDays = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const days = useMemo(() => filterDaysByPeriod(allDays, periodFilter, now), [allDays, periodFilter, now]);
  const selectedDay = allDays[selectedDayIndex] || allDays[0];
  const selectedDateStr = selectedDay ? formatDateString(selectedDay) : '';

  useEffect(() => {
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth()) {
      setSelectedDayIndex(Math.max(0, Math.min(today.getDate() - 1, days.length - 1)));
    } else {
      setSelectedDayIndex(0);
    }
  }, [year, month, days.length]);

  const enrollmentsWithCharges = useMemo(() => {
    const set = new Set<string>();
    if (!attendanceData || !Array.isArray(attendanceData)) return set;
    attendanceData.forEach((entry: any) => {
      const amount = entry.value ?? entry.charged_amount ?? 0;
      if (amount > 0) {
        set.add(entry.enrollment_id);
      }
    });
    return set;
  }, [attendanceData]);

  const visibleEnrollments = useMemo(() => (
    enrollments.filter(enrollment => enrollment.is_active || enrollmentsWithCharges.has(enrollment.id))
  ), [enrollments, enrollmentsWithCharges]);

  // Filter enrollments by groups
  const filteredEnrollments = useMemo(() => {
    if (selectedGroups.has('all')) {
      return visibleEnrollments;
    }
    
    return visibleEnrollments.filter(enrollment => {
      const groupId = enrollment.students?.group_id;
      if (!groupId) {
        return selectedGroups.has('none');
      }
      return selectedGroups.has(groupId);
    });
  }, [selectedGroups, visibleEnrollments]);

  // Sync scroll between header, totals, and body (only for month view)
  useEffect(() => {
    // Skip sync for day/week filters as they don't need scrolling
    if (periodFilter !== 'month') return;

    // Wait for data to be loaded and DOM to be ready
    let cleanup: (() => void) | null = null;

    const setupSync = () => {
      const header = headerScrollRef.current;
      const totals = totalsScrollRef.current;
      const body = bodyScrollRef.current;
      
      if (!header || !body || !totals) return;

      const syncFromHeader = () => {
        const left = header.scrollLeft;
        if (totals && totals.scrollLeft !== left) totals.scrollLeft = left;
        if (body && body.scrollLeft !== left) body.scrollLeft = left;
      };

      const syncFromBody = () => {
        const left = body.scrollLeft;
        if (header && header.scrollLeft !== left) header.scrollLeft = left;
        if (totals && totals.scrollLeft !== left) totals.scrollLeft = left;
      };

      const syncFromTotals = () => {
        const left = totals.scrollLeft;
        if (header && header.scrollLeft !== left) header.scrollLeft = left;
        if (body && body.scrollLeft !== left) body.scrollLeft = left;
      };

      // Initial sync
      syncFromHeader();

      // Add event listeners
      header.addEventListener('scroll', syncFromHeader, { passive: true });
      body.addEventListener('scroll', syncFromBody, { passive: true });
      totals.addEventListener('scroll', syncFromTotals, { passive: true });
      
      cleanup = () => {
        header.removeEventListener('scroll', syncFromHeader);
        body.removeEventListener('scroll', syncFromBody);
        totals.removeEventListener('scroll', syncFromTotals);
      };
    };

    // Use double requestAnimationFrame to ensure DOM is fully ready
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setupSync();
      });
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [days.length, filteredEnrollments.length, periodFilter, attendanceData, attendanceLoading]);

  // Group and sort enrollments
  const groupedEnrollments = useMemo(() => {
    const groupsMap = new Map<string, typeof enrollments>();
    const noGroupEnrollments: typeof enrollments = [];

    filteredEnrollments.forEach(enrollment => {
      const groupId = enrollment.students?.group_id;
      if (!groupId) {
        noGroupEnrollments.push(enrollment);
      } else {
        if (!groupsMap.has(groupId)) {
          groupsMap.set(groupId, []);
        }
        groupsMap.get(groupId)!.push(enrollment);
      }
    });

    // Sort children alphabetically in each group
    groupsMap.forEach((enrollments, groupId) => {
      enrollments.sort((a, b) => 
        a.students.full_name.localeCompare(b.students.full_name, 'uk-UA')
      );
    });

    noGroupEnrollments.sort((a, b) => 
      a.students.full_name.localeCompare(b.students.full_name, 'uk-UA')
    );

    return { groupsMap, noGroupEnrollments };
  }, [filteredEnrollments]);

  // Get represented groups
  const representedGroups = useMemo(() => {
    const groupIds = new Set<string>();
    visibleEnrollments.forEach(enrollment => {
      if (enrollment.students?.group_id) {
        groupIds.add(enrollment.students.group_id);
      }
    });
    return groups.filter(g => groupIds.has(g.id));
  }, [visibleEnrollments, groups]);

  // Create attendance map
  const attendanceMap = useMemo(() => {
    const map = new Map<string, { status: AttendanceStatus | null; amount: number; value: number | null }>();
    if (!attendanceData || !Array.isArray(attendanceData)) return map;
    attendanceData.forEach((a: any) => {
      const key = `${a.enrollment_id}-${a.date}`;
      map.set(key, { 
        status: a.status, 
        amount: a.charged_amount || 0,
        value: a.value || null
      });
    });
    return map;
  }, [attendanceData]);

  const dailyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    days.forEach((day) => {
      totals[formatDateString(day)] = 0;
    });

    filteredEnrollments.forEach((enrollment) => {
      days.forEach((day) => {
        const dateStr = formatDateString(day);
        const key = `${enrollment.id}-${dateStr}`;
        const attendance = attendanceMap.get(key);
        if (attendance?.status === 'present') {
          totals[dateStr] = (totals[dateStr] || 0) + 1;
        }
      });
    });

    return totals;
  }, [days, filteredEnrollments, attendanceMap]);

  const visibleGroupRows = useMemo(() => {
    const ids = new Set<string>();

    if (selectedGroups.has('all')) {
      Array.from(groupedEnrollments.groupsMap.keys()).forEach((id) => ids.add(id));
      if (groupedEnrollments.noGroupEnrollments.length > 0) ids.add('none');
    } else {
      selectedGroups.forEach((id) => {
        if (id !== 'all') ids.add(id);
      });
    }

    const rows: Array<{ id: string; name: string; color?: string }> = [];
    Array.from(ids.values()).forEach((id) => {
      if (id === 'none') {
        rows.push({ id, name: 'Без групи', color: '#94a3b8' });
        return;
      }
      const group = groups.find((g) => g.id === id);
      if (group) {
        rows.push({ id, name: group.name, color: group.color });
      }
    });

    return rows;
  }, [groups, groupedEnrollments, selectedGroups]);

  const groupDailyTotals = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {};
    const initDates = (groupId: string) => {
      if (!totals[groupId]) totals[groupId] = {};
      days.forEach((day) => {
        totals[groupId][formatDateString(day)] = 0;
      });
    };

    visibleGroupRows.forEach((row) => initDates(row.id));

    filteredEnrollments.forEach((enrollment) => {
      const groupId = enrollment.students?.group_id || 'none';
      if (!totals[groupId]) initDates(groupId);
      days.forEach((day) => {
        const dateStr = formatDateString(day);
        const key = `${enrollment.id}-${dateStr}`;
        const attendance = attendanceMap.get(key);
        if (attendance?.status === 'present') {
          totals[groupId][dateStr] = (totals[groupId][dateStr] || 0) + 1;
        }
      });
    });

    return totals;
  }, [visibleGroupRows, filteredEnrollments, days, attendanceMap]);

  const tableColGroup = useMemo(() => (
    <colgroup>
      <col style={{ width: '200px' }} />
      {days.map((day) => (
        <col key={formatDateString(day)} style={{ width: '70px' }} />
      ))}
    </colgroup>
  ), [days]);

  // Handle status change
  const handleStatusChange = useCallback(async (
    enrollmentId: string,
    studentId: string,
    date: string,
    status: AttendanceStatus | null,
    value: number | null = null
  ) => {
    if (!controllerActivityId || !controllerActivity) {
      console.warn('Controller activity not found');
      return;
    }

    // Get student's all enrollments for calculateDailyAccrual
    const studentEnrollments = allEnrollments.filter(e => e.student_id === studentId);

    // Calculate accrual using calculateDailyAccrual
    let calculatedAmount = 0;
    let calculatedValue: number | null = null;
    let foodTariffAmount = 0;
    let baseActivityEntries: Array<{ activityId: string; amount: number }> = [];
    let foodActivityEntries: Array<{ activityId: string; amount: number }> = [];

    if (status !== null) {
      const accrualResult = calculateDailyAccrual(
        studentId,
        date,
        controllerActivityId,
        studentEnrollments,
        activitiesMap,
        status
      );

      if (accrualResult) {
        calculatedAmount = accrualResult.amount;
        calculatedValue = accrualResult.amount;
        
        if (status === 'absent' && accrualResult.foodTariff !== null && accrualResult.foodTariff > 0) {
          foodTariffAmount = accrualResult.foodTariff;
        }

        baseActivityEntries = (accrualResult.baseTariffs || [])
          .filter((item) => item.dailyTariff > 0)
          .map((item) => ({ activityId: item.activityId, amount: item.dailyTariff }));

        foodActivityEntries = (accrualResult.foodTariffs || [])
          .filter((item) => item.dailyTariff > 0)
          .map((item) => ({ activityId: item.activityId, amount: item.dailyTariff }));
      } else {
        // If config not found or base tariff not found, log warning but continue
        console.warn(`[Garden Attendance] Could not calculate accrual for student ${studentId} on ${date}. Config or base tariff not found.`);
      }
    }

    // Update or create attendance record
    if (status === null) {
      // Delete attendance and all related transactions
      try {
        // First, delete all finance transactions for this student and date
        // This ensures we delete all transactions regardless of activity type
        const { data: allTransactions, error: transactionsError } = await supabase
          .from('finance_transactions')
          .select('id, type, activity_id')
          .eq('student_id', studentId)
          .eq('date', date);
        
        if (transactionsError && transactionsError.code !== 'PGRST116') {
          console.error('Error finding transactions for deletion:', transactionsError);
        } else if (allTransactions && allTransactions.length > 0) {
          // Delete all transactions found for this student and date
          for (const transaction of allTransactions) {
            try {
              await deleteTransaction.mutateAsync(transaction.id);
            } catch (deleteError) {
              console.error(`Error deleting transaction ${transaction.id}:`, deleteError);
            }
          }
        }
        
        // Then delete attendance record
        await deleteAttendance.mutateAsync({ enrollmentId, date });
      } catch (error) {
        console.error('Error deleting attendance and transactions:', error);
      }
    } else {
      // Create or update attendance
      try {
        await setAttendance.mutateAsync({
          enrollment_id: enrollmentId,
          date,
          status: status || null,
          charged_amount: calculatedAmount,
          value: calculatedValue,
          notes: null,
          manual_value_edit: false,
        });

        // Create or update finance transactions for base tariff and food tariff separately
        // Base tariff transactions (always M/D, regardless of presence/absence)
        if (baseActivityEntries.length > 0) {
          for (const entry of baseActivityEntries) {
            await upsertTransaction.mutateAsync({
              type: 'income',
              student_id: studentId,
              activity_id: entry.activityId,
              staff_id: null,
              amount: entry.amount,
              date,
              description: `Нарахування за відвідування (${status === 'present' ? 'присутність' : status === 'absent' ? 'відсутність' : 'відвідування'})`,
              category: 'Навчання',
            });
          }
        }
        
        // Food tariff transaction (only for absent status, as expense/refund to parents)
        // If status is present, delete food transaction if exists
        if (foodActivityEntries.length > 0) {
          if (status === 'absent' && foodTariffAmount > 0) {
            for (const entry of foodActivityEntries) {
              await upsertTransaction.mutateAsync({
                type: 'expense',
                student_id: studentId,
                activity_id: entry.activityId,
                staff_id: null,
                amount: entry.amount,
                date,
                description: `Повернення за харчування (відсутність)`,
                category: 'Навчання',
              });
            }
          } else if (status === 'present') {
            for (const entry of foodActivityEntries) {
              const { data: foodTransaction, error: foodError } = await supabase
                .from('finance_transactions')
                .select('id')
                .eq('student_id', studentId)
                .eq('activity_id', entry.activityId)
                .eq('date', date)
                .eq('type', 'expense')
                .maybeSingle();

              if (foodError && foodError.code !== 'PGRST116') {
                console.error('Error finding food transaction:', foodError);
              } else if (foodTransaction?.id) {
                await deleteTransaction.mutateAsync(foodTransaction.id);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error setting attendance:', error);
        throw error; // Пробрасываем ошибку, чтобы не продолжать выполнение
      }
    }

    // Invalidate queries and force refetch AFTER all mutations complete
    // Ждем немного, чтобы убедиться, что все мутации завершились
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('[Garden Attendance] Invalidating queries after status change...');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['finance_transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false }),
      queryClient.invalidateQueries({ queryKey: ['student_activity_balance'] }),
    ]);
    
    // Принудительно перезапрашиваем ВСЕ запросы дашборда (не только активные)
    console.log('[Garden Attendance] Refetching dashboard queries...');
    const refetchResult = await queryClient.refetchQueries({ 
      queryKey: ['dashboard'], 
      exact: false,
      type: 'all', // Перезапрашиваем все, включая неактивные
    });
    
    // refetchQueries возвращает Promise, который резолвится в массив результатов
    const results = Array.isArray(refetchResult) ? refetchResult : [];
    
    console.log('[Garden Attendance] Dashboard refetch result', {
      refetchedQueries: results.length,
      timestamp: new Date().toISOString(),
    });
  }, [controllerActivityId, controllerActivity, allEnrollments, activitiesMap, setAttendance, deleteAttendance, upsertTransaction, deleteTransaction, queryClient]);


  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const runBatched = useCallback(async (tasks: Array<() => Promise<void>>, batchSize = 10) => {
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      await Promise.all(batch.map((task) => task()));
    }
  }, []);

  const handleFillPresentForDate = useCallback(async (dateStr: string) => {
    setIsBulkUpdating(true);
    const existingKeys = new Set((attendanceData || []).map((entry: any) => `${entry.enrollment_id}-${entry.date}`));

    try {
      const tasks: Array<() => Promise<void>> = [];
      for (const enrollment of filteredEnrollments) {
        const key = `${enrollment.id}-${dateStr}`;
        if (existingKeys.has(key)) continue;
        tasks.push(async () => {
          await handleStatusChange(enrollment.id, enrollment.student_id, dateStr, 'present');
          existingKeys.add(key);
        });
      }
      await runBatched(tasks, 10);
    } finally {
      setIsBulkUpdating(false);
    }
  }, [attendanceData, filteredEnrollments, handleStatusChange, runBatched]);

  const handleGroupToggle = (groupId: string) => {
    const newSelected = new Set(selectedGroups);
    
    if (groupId === 'all') {
      if (newSelected.has('all')) {
        newSelected.clear();
      } else {
        newSelected.clear();
        newSelected.add('all');
      }
    } else {
      newSelected.delete('all');
      if (newSelected.has(groupId)) {
        newSelected.delete(groupId);
      } else {
        newSelected.add(groupId);
      }
      
      if (newSelected.size === representedGroups.length + (groupedEnrollments.noGroupEnrollments.length > 0 ? 1 : 0)) {
        newSelected.clear();
        newSelected.add('all');
      }
    }
    
    setSelectedGroups(newSelected);
  };

  const isLoading = enrollmentsLoading || attendanceLoading;

  if (!controllerActivity) {
    return (
      <>
        <PageHeader title="Журнал відвідування v1" description="Управляюча активність не знайдена" />
        <div className="p-8">
          <div className="rounded-xl bg-card border border-border p-6 text-center text-muted-foreground">
            <p>Не знайдено активності з налаштованим config (base_tariff_ids)</p>
            <p className="text-sm mt-2">Створіть активність та налаштуйте config для журналу відвідування</p>
          </div>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title="Журнал відвідування v1" />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </>
    );
  }

  if (enrollments.length === 0) {
    return (
      <>
        <PageHeader title="Журнал відвідування v1" />
        <div className="p-8">
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Немає записів на цю активність</p>
            <p className="text-sm">Додайте дітей у картці учня</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader 
        title="Журнал відвідування v1" 
        description={`${controllerActivity.name} - ${MONTHS[month]} ${year}`}
      />
      
      <div className="p-4 sm:p-8">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold flex-1 text-center">
            {MONTHS[month]} {year}
          </h2>
          <div className="w-[140px]">
            <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">День</SelectItem>
                <SelectItem value="week">Тиждень</SelectItem>
                <SelectItem value="month">Місяць</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Group filters */}
        <div className="mb-4 p-4 border rounded-lg bg-card">
          <Label className="mb-3 block font-medium">Фільтр по групах:</Label>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="filter-all"
                checked={selectedGroups.has('all')}
                onCheckedChange={() => handleGroupToggle('all')}
              />
              <Label htmlFor="filter-all" className="cursor-pointer font-normal">
                Всі групи
              </Label>
            </div>
            {representedGroups.map((group) => (
              <div key={group.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`filter-${group.id}`}
                  checked={selectedGroups.has(group.id)}
                  onCheckedChange={() => handleGroupToggle(group.id)}
                />
                <Label htmlFor={`filter-${group.id}`} className="cursor-pointer font-normal flex items-center gap-2">
                  <div 
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  {group.name}
                </Label>
              </div>
            ))}
            {groupedEnrollments.noGroupEnrollments.length > 0 && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-none"
                  checked={selectedGroups.has('none')}
                  onCheckedChange={() => handleGroupToggle('none')}
                />
                <Label htmlFor="filter-none" className="cursor-pointer font-normal">
                  Без групи
                </Label>
              </div>
            )}
          </div>
        </div>

        {/* Grid */}
      {isMobile && (
        <div className="mb-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedDayIndex((prev) => Math.max(0, prev - 1))}
              disabled={selectedDayIndex <= 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="text-sm font-semibold">{selectedDay ? formatDateString(selectedDay) : ''}</p>
              <p className="text-xs text-muted-foreground">{selectedDay ? getWeekdayShort(selectedDay) : ''}</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedDayIndex((prev) => Math.min(days.length - 1, prev + 1))}
              disabled={selectedDayIndex >= days.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {filteredEnrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Немає дітей за обраними фільтрами</p>
          </div>
      ) : isMobile ? (
        <div className="space-y-4">
          {Array.from(groupedEnrollments.groupsMap.entries()).map(([groupId, groupEnrollments]) => {
            const group = groups.find(g => g.id === groupId);
            return (
              <div key={groupId} className="rounded-xl border bg-card">
                <div className="border-b px-4 py-2 text-sm font-semibold">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: group?.color || '#gray' }}
                    />
                    Група: {group?.name || 'Невідома група'}
                  </div>
                </div>
                <div className="divide-y">
                  {groupEnrollments.map((enrollment) => {
                    const key = `${enrollment.id}-${selectedDateStr}`;
                    const attendance = attendanceMap.get(key);
                    return (
                      <div
                        key={enrollment.id}
                        className={cn('p-4', !enrollment.is_active && 'bg-muted/40 text-muted-foreground')}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            {enrollment.student_id ? (
                              <Link to={`/students/${enrollment.student_id}`} className="font-medium text-primary hover:underline">
                                {enrollment.students.full_name}
                              </Link>
                            ) : (
                              <p className="font-medium">{enrollment.students.full_name}</p>
                            )}
                            {!enrollment.is_active && (
                              <span className="mt-1 inline-flex rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide">
                                Архів
                              </span>
                            )}
                          </div>
                          <GardenAttendanceCell
                            status={attendance?.status || null}
                            amount={attendance?.amount || null}
                            value={attendance?.value || null}
                            isWeekend={selectedDay ? isWeekend(selectedDay) : false}
                            onChange={(status, value) => handleStatusChange(
                              enrollment.id,
                              enrollment.student_id,
                              selectedDateStr,
                              status,
                              value
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {groupedEnrollments.noGroupEnrollments.length > 0 && (
            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-2 text-sm font-semibold">Без групи</div>
              <div className="divide-y">
                {groupedEnrollments.noGroupEnrollments.map((enrollment) => {
                  const key = `${enrollment.id}-${selectedDateStr}`;
                  const attendance = attendanceMap.get(key);
                  return (
                    <div
                      key={enrollment.id}
                      className={cn('p-4', !enrollment.is_active && 'bg-muted/40 text-muted-foreground')}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          {enrollment.student_id ? (
                            <Link to={`/students/${enrollment.student_id}`} className="font-medium text-primary hover:underline">
                              {enrollment.students.full_name}
                            </Link>
                          ) : (
                            <p className="font-medium">{enrollment.students.full_name}</p>
                          )}
                          {!enrollment.is_active && (
                            <span className="mt-1 inline-flex rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide">
                              Архів
                            </span>
                          )}
                        </div>
                        <GardenAttendanceCell
                          status={attendance?.status || null}
                          amount={attendance?.amount || null}
                          value={attendance?.value || null}
                          isWeekend={selectedDay ? isWeekend(selectedDay) : false}
                          onChange={(status, value) => handleStatusChange(
                            enrollment.id,
                            enrollment.student_id,
                            selectedDateStr,
                            status,
                            value
                          )}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div ref={totalsScrollRef} className={periodFilter === 'month' ? 'overflow-x-auto border rounded-xl bg-card' : 'overflow-hidden border rounded-xl bg-card'}>
            <div className="min-w-max">
              <table className="w-full border-collapse">
                {tableColGroup}
                <tbody>
                  <tr className="bg-muted/30 border-t-2 font-semibold">
                    <td className="sticky left-0 z-10 bg-muted/30 px-4 py-2 text-sm text-left">Всього дітей</td>
                    {days.map((day) => {
                      const dateStr = formatDateString(day);
                      return (
                        <td
                          key={dateStr}
                          className={cn(
                            "px-1 py-1 text-center text-xs font-medium border-l-2 border-border/60",
                            isWeekend(day) && WEEKEND_BG_COLOR
                          )}
                        >
                          {dailyTotals[dateStr] || 0}
                        </td>
                      );
                    })}
                  </tr>
                  {visibleGroupRows.map((groupRow) => (
                    <tr key={groupRow.id} className="bg-muted/30 font-semibold">
                      <td className="sticky left-0 z-10 bg-muted/30 px-4 py-2 text-sm text-left">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: groupRow.color || '#94a3b8' }}
                          />
                          {groupRow.name}
                        </span>
                      </td>
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        const value = groupDailyTotals[groupRow.id]?.[dateStr] || 0;
                        return (
                        <td
                            key={dateStr}
                            className={cn(
                            "px-1 py-1 text-center text-xs font-medium border-l-2 border-border/60",
                              isWeekend(day) && WEEKEND_BG_COLOR
                            )}
                          >
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="sticky top-16 z-30 bg-card">
            <div ref={headerScrollRef} className="overflow-x-auto border rounded-xl border-b-0">
              <div className={periodFilter === 'month' ? 'min-w-max' : ''}>
                <table className={periodFilter === 'month' ? 'w-full border-collapse' : 'border-collapse'} style={periodFilter !== 'month' ? { width: 'auto' } : undefined}>
                  {tableColGroup}
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="sticky left-0 z-30 bg-muted/50 px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Учень
                      </th>
                      {days.map((day) => (
                        <th
                          key={formatDateString(day)}
                        className={cn(
                            "px-1 py-2 text-center text-xs font-medium bg-muted/50 border-l-2 border-border/60",
                            isWeekend(day)
                              ? `text-muted-foreground/50 ${WEEKEND_BG_COLOR}`
                              : 'text-muted-foreground'
                          )}
                        >
                          <div>{getWeekdayShort(day)}</div>
                          <div className="font-semibold">{formatShortDate(day)}</div>
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-muted/50 border-t">
                      <th className="sticky left-0 z-30 bg-muted/50 px-4 py-2 text-left text-xs text-muted-foreground">
                        Заповнити П
                      </th>
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        return (
                          <th
                            key={`${dateStr}-fill`}
                            className={cn(
                              "px-1 py-1 text-center text-xs font-medium bg-muted/50 border-l-2 border-border/60",
                              isWeekend(day)
                                ? `text-muted-foreground/50 ${WEEKEND_BG_COLOR}`
                                : 'text-muted-foreground'
                            )}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => handleFillPresentForDate(dateStr)}
                              disabled={isBulkUpdating}
                            >
                              П
                            </Button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
          </div>

          <div ref={bodyScrollRef} className={periodFilter === 'month' ? 'overflow-x-auto border rounded-xl' : 'overflow-x-hidden border rounded-xl'}>
            <div className={periodFilter === 'month' ? 'min-w-max' : ''}>
              <table className={periodFilter === 'month' ? 'w-full border-collapse' : 'border-collapse'} style={periodFilter !== 'month' ? { width: 'auto' } : undefined}>
                {tableColGroup}
                <tbody>
                  {/* Grouped enrollments */}
                  {Array.from(groupedEnrollments.groupsMap.entries()).map(([groupId, groupEnrollments]) => {
                    const group = groups.find(g => g.id === groupId);
                    return (
                      <React.Fragment key={groupId}>
                        {/* Group header */}
                        <tr className="bg-muted/50 border-t-2 border-b">
                          <td colSpan={days.length + 1} className="px-4 py-2 font-semibold text-sm">
                            <div className="flex items-center gap-2">
                              <div 
                                className="h-4 w-4 rounded-full"
                                style={{ backgroundColor: group?.color || '#gray' }}
                              />
                              Група: {group?.name || 'Невідома група'}
                            </div>
                          </td>
                        </tr>
                        {/* Children in group */}
                        {groupEnrollments.map((enrollment) => (
                          <tr
                            key={enrollment.id}
                            className={cn(
                              'border-t hover:bg-muted/20',
                              !enrollment.is_active && 'bg-muted/40 text-muted-foreground'
                            )}
                          >
                            <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium text-sm">
                              <div className="flex items-center gap-2">
                                {enrollment.student_id ? (
                                  <Link to={`/students/${enrollment.student_id}`} className="text-primary hover:underline">
                                    {enrollment.students.full_name}
                                  </Link>
                                ) : (
                                  <span>{enrollment.students.full_name}</span>
                                )}
                                {!enrollment.is_active && (
                                  <span className="rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide">
                                    Архів
                                  </span>
                                )}
                              </div>
                            </td>
                            {days.map((day) => {
                              const dateStr = formatDateString(day);
                              const key = `${enrollment.id}-${dateStr}`;
                              const attendance = attendanceMap.get(key);
                              
                              return (
                                <td
                                  key={dateStr}
                                  className={cn(
                                    "p-1 text-center border-l-2 border-border/50",
                                    isWeekend(day) && WEEKEND_BG_COLOR
                                  )}
                                >
                                  <GardenAttendanceCell
                                    status={attendance?.status || null}
                                    amount={attendance?.amount || null}
                                    value={attendance?.value || null}
                                    isWeekend={isWeekend(day)}
                                    onChange={(status, value) => handleStatusChange(
                                      enrollment.id,
                                      enrollment.student_id,
                                      dateStr,
                                      status,
                                      value
                                    )}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  
                  {/* Children without group */}
                  {groupedEnrollments.noGroupEnrollments.length > 0 && (
                    <React.Fragment>
                      <tr className="bg-muted/50 border-t-2 border-b">
                        <td colSpan={days.length + 1} className="px-4 py-2 font-semibold text-sm">
                          Без групи
                        </td>
                      </tr>
                      {groupedEnrollments.noGroupEnrollments.map((enrollment) => (
                        <tr
                          key={enrollment.id}
                          className={cn(
                            'border-t hover:bg-muted/20',
                            !enrollment.is_active && 'bg-muted/40 text-muted-foreground'
                          )}
                        >
                          <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium text-sm">
                            <div className="flex items-center gap-2">
                              {enrollment.student_id ? (
                                <Link to={`/students/${enrollment.student_id}`} className="text-primary hover:underline">
                                  {enrollment.students.full_name}
                                </Link>
                              ) : (
                                <span>{enrollment.students.full_name}</span>
                              )}
                              {!enrollment.is_active && (
                                <span className="rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide">
                                  Архів
                                </span>
                              )}
                            </div>
                          </td>
                          {days.map((day) => {
                            const dateStr = formatDateString(day);
                            const key = `${enrollment.id}-${dateStr}`;
                            const attendance = attendanceMap.get(key);
                            
                            return (
                            <td
                                key={dateStr}
                                className={cn(
                                "p-1 text-center border-l-2 border-border/50",
                                  isWeekend(day) && WEEKEND_BG_COLOR
                                )}
                              >
                                <GardenAttendanceCell
                                  status={attendance?.status || null}
                                  amount={attendance?.amount || null}
                                  value={attendance?.value || null}
                                  isWeekend={isWeekend(day)}
                                  onChange={(status, value) => handleStatusChange(
                                    enrollment.id,
                                    enrollment.student_id,
                                    dateStr,
                                    status,
                                    value
                                  )}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
