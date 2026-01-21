import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { EnhancedAttendanceCell } from './EnhancedAttendanceCell';
import { useEnrollments } from '@/hooks/useEnrollments';
import { useAttendance, useSetAttendance, useDeleteAttendance } from '@/hooks/useAttendance';
import { useActivity } from '@/hooks/useActivities';
import { useGroups } from '@/hooks/useGroups';
import { useStaff } from '@/hooks/useStaff';
import { useUpsertStaffJournalEntry, useDeleteStaffJournalEntry, useAllStaffBillingRulesForActivity, getStaffBillingRuleForDate } from '@/hooks/useStaffBilling';
import { calculateMonthlyStaffAccruals, type AttendanceRecord } from '@/lib/salaryCalculator';
import { applyDeductionsToAmount } from '@/lib/staffSalary';
import { 
  getDaysInMonth, 
  formatShortDate, 
  getWeekdayShort, 
  isWeekend, 
  calculateChargedAmount, 
  formatCurrency,
  calculateValueFromBillingRules,
  calculateHourlyValueFromRule,
  formatDateString
} from '@/lib/attendance';
import type { AttendanceStatus } from '@/lib/attendance';
import { useActivityPriceHistory, getBillingRulesForDate } from '@/hooks/useActivities';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

interface AttendanceGridProps {
  activityId: string;
}

export function EnhancedAttendanceGrid({ activityId }: AttendanceGridProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set(['all']));
  const [selectedDayIndex, setSelectedDayIndex] = useState(now.getDate() - 1);
  const isMobile = useIsMobile();

  const { data: activity } = useActivity(activityId);
  const { data: priceHistory } = useActivityPriceHistory(activityId);
  const { data: allStaffBillingRules = [] } = useAllStaffBillingRulesForActivity(activityId);
  const { data: groups = [] } = useGroups();
  const { data: staff = [] } = useStaff();
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useEnrollments({ 
    activityId
  });
  const { data: attendanceData = [], isLoading: attendanceLoading } = useAttendance({ 
    activityId, 
    month, 
    year 
  });
  const setAttendance = useSetAttendance();
  const deleteAttendance = useDeleteAttendance();
  const upsertStaffJournalEntry = useUpsertStaffJournalEntry();
  const deleteStaffJournalEntry = useDeleteStaffJournalEntry();

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

  const enrollmentsWithCharges = useMemo(() => {
    const set = new Set<string>();
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

  // Фільтрація записів по групах
  const filteredEnrollments = useMemo(() => {
    if (selectedGroups.has('all')) {
      return visibleEnrollments;
    }
    
    return visibleEnrollments.filter(enrollment => {
      const groupId = enrollment.students?.group_id;
      if (!groupId) {
        // Діти без групи показуються, якщо вибрано "Без групи"
        return selectedGroups.has('none');
      }
      return selectedGroups.has(groupId);
    });
  }, [selectedGroups, visibleEnrollments]);

  // Групування та сортування записів
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

    // Сортуємо дітей в алфавітному порядку в кожній групі
    groupsMap.forEach((enrollments, groupId) => {
      enrollments.sort((a, b) => 
        a.students.full_name.localeCompare(b.students.full_name, 'uk-UA')
      );
    });

    // Сортуємо дітей без групи
    noGroupEnrollments.sort((a, b) => 
      a.students.full_name.localeCompare(b.students.full_name, 'uk-UA')
    );

    return { groupsMap, noGroupEnrollments };
  }, [filteredEnrollments]);

  // Отримуємо список всіх груп, представлених у записах
  const representedGroups = useMemo(() => {
    const groupIds = new Set<string>();
    visibleEnrollments.forEach(enrollment => {
      if (enrollment.students?.group_id) {
        groupIds.add(enrollment.students.group_id);
      }
    });
    return groups.filter(g => groupIds.has(g.id));
  }, [visibleEnrollments, groups]);

  const attendanceMap = useMemo(() => {
    const map = new Map<string, { status: AttendanceStatus | null; amount: number; value: number | null; manual_value_edit: boolean }>();
    attendanceData.forEach((a: any) => {
      const key = `${a.enrollment_id}-${a.date}`;
      map.set(key, { 
        status: a.status, 
        amount: a.charged_amount || 0,
        value: a.value || null,
        manual_value_edit: a.manual_value_edit || false
      });
    });
    return map;
  }, [attendanceData]);

  // Створюємо мапу staff_billing_rules для швидкого доступу (по staff_id)
  const staffBillingRulesMap = useMemo(() => {
    const map = new Map<string, typeof allStaffBillingRules>();
    allStaffBillingRules.forEach(rule => {
      const existing = map.get(rule.staff_id) || [];
      existing.push(rule);
      map.set(rule.staff_id, existing);
    });
    return map;
  }, [allStaffBillingRules]);

  const staffMap = useMemo(() => {
    const map = new Map<string, (typeof staff)[number]>();
    staff.forEach((member) => {
      map.set(member.id, member);
    });
    return map;
  }, [staff]);

  const buildAttendanceRecordsFromMap = useCallback((mapOverride?: Map<string, { status: AttendanceStatus | null; amount: number; value: number | null; manual_value_edit: boolean }>) => {
    const map = mapOverride ?? attendanceMap;
    const records: AttendanceRecord[] = [];

    filteredEnrollments.forEach((enrollment) => {
      const studentId = enrollment.students?.id || enrollment.student_id;
      const studentName = enrollment.students?.full_name || '';

      days.forEach((day) => {
        const dateStr = formatDateString(day);
        const key = `${enrollment.id}-${dateStr}`;
        const attendance = map.get(key);

        if (attendance?.status === 'present' && studentId) {
          records.push({
            date: dateStr,
            enrollment_id: enrollment.id,
            student_id: studentId,
            student_name: studentName,
            status: 'present',
            value: attendance.value ?? attendance.amount ?? 0,
          });
        }
      });
    });

    return records;
  }, [attendanceMap, days, filteredEnrollments]);

  // Створюємо мапу activity_id -> staff_id для швидкого пошуку вчителя за активністю
  // Функція для пошуку teacher_id через staff_billing_rules для конкретної активності та дати
  const getTeacherIdForActivity = useCallback((activityId: string, date: string): string | null => {
    // Знаходимо всі правила для цієї активності (де activity_id співпадає або null для глобальних)
    const relevantRules = allStaffBillingRules.filter(rule => {
      // Перевіряємо, чи правило відповідає активності (конкретна активність або глобальна)
      if (rule.activity_id !== null && rule.activity_id !== activityId) {
        return false;
      }
      
      // Перевіряємо, чи правило активне на цю дату
      const dateObj = new Date(date);
      const fromDate = new Date(rule.effective_from);
      const toDate = rule.effective_to ? new Date(rule.effective_to) : null;
      
      return dateObj >= fromDate && (!toDate || dateObj < toDate);
    });

    if (relevantRules.length === 0) return null;

    // Пріоритет: спочатку шукаємо конкретні правила для активності, потім глобальні
    const specificRule = relevantRules.find(r => r.activity_id === activityId);
    if (specificRule) {
      return specificRule.staff_id;
    }

    // Якщо немає конкретного правила, беремо перше глобальне (activity_id === null)
    const globalRule = relevantRules.find(r => r.activity_id === null);
    return globalRule ? globalRule.staff_id : null;
  }, [allStaffBillingRules]);

  const getBillingRuleForDate = useCallback((date: string) => {
    const teacherId = getTeacherIdForActivity(activityId, date);
    if (!teacherId) return null;
    const staffRules = staffBillingRulesMap.get(teacherId) || [];
    return getStaffBillingRuleForDate(staffRules, date, activityId);
  }, [activityId, getTeacherIdForActivity, staffBillingRulesMap]);

  const syncStaffJournalEntriesForMonth = useCallback(async (recordsOverride?: AttendanceRecord[]) => {
    const records = recordsOverride ?? buildAttendanceRecordsFromMap();
    const accruals = calculateMonthlyStaffAccruals({
      attendanceRecords: records,
      getRuleForDate: getBillingRuleForDate,
    });

    const dateStrings = days.map((day) => formatDateString(day));
    const staffIds = new Set<string>();

    allStaffBillingRules.forEach((rule) => {
      if (rule.activity_id === null || rule.activity_id === activityId) {
        staffIds.add(rule.staff_id);
      }
    });

    accruals.forEach((_, staffId) => staffIds.add(staffId));

    const promises: Promise<any>[] = [];
    staffIds.forEach((staffId) => {
      dateStrings.forEach((date) => {
        const dayAccrual = accruals.get(staffId)?.get(date);
        if (dayAccrual && dayAccrual.amount > 0) {
          const staffMember = staffMap.get(staffId);
          const { finalAmount, deductionsApplied } = applyDeductionsToAmount(
            dayAccrual.amount,
            (staffMember?.deductions as any) || []
          );

          promises.push(
            upsertStaffJournalEntry.mutateAsync({
              staff_id: staffId,
              activity_id: activityId,
              date,
              amount: finalAmount,
              base_amount: dayAccrual.amount,
              deductions_applied: deductionsApplied,
              is_manual_override: false,
              notes: dayAccrual.notes.join('; ') || null,
            })
          );
        } else {
          promises.push(
            deleteStaffJournalEntry.mutateAsync({
              staff_id: staffId,
              activity_id: activityId,
              date,
              is_manual_override: false,
            })
          );
        }
      });
    });

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }, [activityId, allStaffBillingRules, buildAttendanceRecordsFromMap, days, deleteStaffJournalEntry, getBillingRuleForDate, staffMap, upsertStaffJournalEntry]);

  // Отримуємо billing rules для активності на дату
  const getActivityBillingRulesForDate = useCallback((date: string) => {
    if (!activity) return null;
    return priceHistory 
      ? getBillingRulesForDate(activity, priceHistory, date)
      : activity.billing_rules;
  }, [activity, priceHistory]);

  // Auto-journal: автоматично проставляти "П" у робочі дні
  useEffect(() => {
    console.log('[Auto-journal] useEffect triggered', {
      activityId,
      auto_journal: activity?.auto_journal,
      enrollmentsLoading,
      attendanceLoading,
      filteredEnrollmentsCount: filteredEnrollments.length,
      attendanceMapSize: attendanceMap.size,
      daysCount: days.length,
      activity: activity ? { id: activity.id, name: activity.name, auto_journal: activity.auto_journal } : null,
    });

    if (!activity?.auto_journal) {
      console.log('[Auto-journal] SKIP: auto_journal is false or activity is undefined');
      return;
    }

    if (enrollmentsLoading) {
      console.log('[Auto-journal] SKIP: enrollmentsLoading is true');
      return;
    }

    if (attendanceLoading) {
      console.log('[Auto-journal] SKIP: attendanceLoading is true');
      return;
    }

    console.log('[Auto-journal] Starting auto-fill process');

    const autoFillPromises: Promise<any>[] = [];
    const optimisticMap = new Map(attendanceMap);

    let processedCells = 0;
    let skippedWeekends = 0;
    let skippedExisting = 0;
    let skippedExistingWithStatus = 0;
    let skippedExistingWithValue = 0;
    let addedToPromises = 0;

    filteredEnrollments.forEach((enrollment) => {
      days.forEach((day) => {
        processedCells++;
        if (isWeekend(day)) {
          skippedWeekends++;
          return;
        }
        
        const dateStr = formatDateString(day);
        const key = `${enrollment.id}-${dateStr}`;
        const existing = attendanceMap.get(key);
        
        // Не перезаписуємо ручні відмітки (ні статус, ні значення)
        // Якщо є статус або значення - пропускаємо
        if (existing) {
          if (existing.status) {
            skippedExistingWithStatus++;
            return;
          }
          if (existing.value !== null && existing.value !== undefined && existing.value !== 0) {
            skippedExistingWithValue++;
            console.log('[Auto-journal] SKIP cell (existing value):', {
              key,
              enrollmentId: enrollment.id,
              date: dateStr,
              existingStatus: existing.status,
              existingValue: existing.value,
            });
            return;
          }
          skippedExisting++;
        }

        if (!existing || (!existing.status && (existing.value === null || existing.value === undefined || existing.value === 0))) {
          addedToPromises++;
          // Отримуємо billing_rules для дати (з урахуванням історії)
          const billingRulesForDate = activity && priceHistory 
            ? getBillingRulesForDate(activity, priceHistory, dateStr)
            : activity?.billing_rules;
          
          // Розраховуємо value на основі billing_rules для статусу 'present'
          const calculatedValue = calculateValueFromBillingRules(
            dateStr,
            'present',
            null,
            enrollment.custom_price,
            enrollment.discount_percent || 0,
            billingRulesForDate || null
          );
          
          // Використовуємо calculatedValue для charged_amount
          const chargedAmount = calculatedValue !== null ? calculatedValue : 0;
          
          console.log('[Auto-journal] Adding attendance mutation:', {
            key,
            enrollmentId: enrollment.id,
            date: dateStr,
            calculatedValue,
            chargedAmount,
            billingRulesForDate: billingRulesForDate ? 'present' : null,
            customPrice: enrollment.custom_price,
          });
          
          autoFillPromises.push(
            setAttendance.mutateAsync({
              enrollment_id: enrollment.id,
              date: dateStr,
              status: 'present',
              charged_amount: chargedAmount,
              value: calculatedValue,
              notes: null,
              manual_value_edit: false,
            }).then(() => {
              console.log('[Auto-journal] Successfully created attendance:', { key, enrollmentId: enrollment.id, date: dateStr });
            }).catch((error) => {
              console.error('[Auto-journal] Failed to create attendance:', { key, enrollmentId: enrollment.id, date: dateStr, error });
            })
          );

          optimisticMap.set(key, {
            status: 'present',
            amount: chargedAmount,
            value: calculatedValue,
            manual_value_edit: false,
          });
        }
      });
    });

    // Виконуємо всі запити одночасно
    console.log('[Auto-journal] Processing summary:', {
      processedCells,
      skippedWeekends,
      skippedExisting,
      skippedExistingWithStatus,
      skippedExistingWithValue,
      addedToPromises,
      autoFillPromisesCount: autoFillPromises.length,
    });

    if (autoFillPromises.length > 0) {
      console.log('[Auto-journal] Executing', autoFillPromises.length, 'attendance mutations');
      Promise.allSettled(autoFillPromises).then((results) => {
        const fulfilled = results.filter(r => r.status === 'fulfilled').length;
        const rejected = results.filter(r => r.status === 'rejected').length;
        console.log('[Auto-journal] Attendance mutations completed:', {
          fulfilled,
          rejected,
          total: results.length,
        });
        if (rejected > 0) {
          console.error('[Auto-journal] Some attendance mutations failed:', results.filter(r => r.status === 'rejected'));
        }
        const optimisticRecords = buildAttendanceRecordsFromMap(optimisticMap);
        syncStaffJournalEntriesForMonth(optimisticRecords).catch((error) => {
          console.error('[Auto-journal] Failed to sync staff journal entries:', error);
        });
      });
    } else {
      console.log('[Auto-journal] No attendance mutations to execute');
    }
  }, [activity?.auto_journal, days, filteredEnrollments, attendanceMap, setAttendance, enrollmentsLoading, attendanceLoading, activity, getActivityBillingRulesForDate, activityId, buildAttendanceRecordsFromMap, syncStaffJournalEntriesForMonth]);

  // Підсумки для кожного учня
  const studentTotals = useMemo(() => {
    const totals: Record<string, { present: number; sick: number; absent: number; values: number }> = {};
    
    filteredEnrollments.forEach((enrollment) => {
      totals[enrollment.id] = { present: 0, sick: 0, absent: 0, values: 0 };
      
      days.forEach((day) => {
        const dateStr = formatDateString(day);
        const key = `${enrollment.id}-${dateStr}`;
        const attendance = attendanceMap.get(key);
        
        // Якщо є статус - рахуємо статус
        if (attendance?.status) {
          if (attendance.status === 'present') totals[enrollment.id].present++;
          else if (attendance.status === 'sick') totals[enrollment.id].sick++;
          else if (attendance.status === 'absent') totals[enrollment.id].absent++;
        }
        // Якщо немає статусу, але є значення - рахуємо значення
        else if (attendance?.value !== null && attendance?.value !== undefined && attendance.value !== 0) {
          totals[enrollment.id].values += attendance.value;
        }
      });
    });
    
    return totals;
  }, [filteredEnrollments, days, attendanceMap]);

  // Ітоги за день
  const dailyTotals = useMemo(() => {
    const totals: Record<string, { present: number; sick: number; absent: number; values: number }> = {};
    
    days.forEach((day) => {
      const dateStr = formatDateString(day);
      totals[dateStr] = { present: 0, sick: 0, absent: 0, values: 0 };
      
      filteredEnrollments.forEach((enrollment) => {
        const key = `${enrollment.id}-${dateStr}`;
        const attendance = attendanceMap.get(key);
        
        // Якщо є статус - рахуємо статус
        if (attendance?.status) {
          if (attendance.status === 'present') totals[dateStr].present++;
          else if (attendance.status === 'sick') totals[dateStr].sick++;
          else if (attendance.status === 'absent') totals[dateStr].absent++;
        }
        // Якщо немає статусу, але є значення - рахуємо значення
        else if (attendance?.value !== null && attendance?.value !== undefined && attendance.value !== 0) {
          totals[dateStr].values += attendance.value;
        }
      });
    });
    
    return totals;
  }, [filteredEnrollments, days, attendanceMap]);

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

  const monthlyAccruals = useMemo(() => {
    const records = buildAttendanceRecordsFromMap();
    return calculateMonthlyStaffAccruals({
      attendanceRecords: records,
      getRuleForDate: getBillingRuleForDate,
    });
  }, [buildAttendanceRecordsFromMap, getBillingRuleForDate]);

  // Оплата педагогу за день - сума нарахувань за правилами
  const teacherPayments = useMemo(() => {
    const payments: Record<string, number> = {};

    days.forEach((day) => {
      const dateStr = formatDateString(day);
      payments[dateStr] = 0;
    });

    monthlyAccruals.forEach((staffMapForDay, staffId) => {
      const staffMember = staffMap.get(staffId);
      const deductions = (staffMember?.deductions as any) || [];

      staffMapForDay.forEach((accrual, date) => {
        const { finalAmount } = applyDeductionsToAmount(accrual.amount, deductions);
        payments[date] = (payments[date] || 0) + finalAmount;
      });
    });

    return payments;
  }, [days, monthlyAccruals, staffMap]);

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

  const handleStatusChange = async (
    enrollmentId: string, 
    date: string, 
    status: AttendanceStatus | null,
    value: number | null,
    _activityPrice: number, // Deprecated: не використовується, залишено для сумісності
    customPrice: number | null,
    discountPercent: number,
    enrollment?: any
  ) => {
    // Якщо обидва null - видаляємо запис
    if (status === null && (value === null || value === undefined || value === 0)) {
      try {
        await deleteAttendance.mutateAsync({ enrollmentId, date });
      } catch (error) {
        console.error('Failed to delete attendance:', error);
      }

      const updatedMap = new Map(attendanceMap);
      updatedMap.delete(`${enrollmentId}-${date}`);
      const optimisticRecords = buildAttendanceRecordsFromMap(updatedMap);
      await syncStaffJournalEntriesForMonth(optimisticRecords);
      return;
    }

    // Якщо є значення, але немає статусу - зберігаємо тільки значення
    if ((status === null) && value !== null && value !== undefined && value !== 0) {
      // Отримуємо існуючу відмітку для перевірки manual_value_edit
      const existing = attendanceMap.get(`${enrollmentId}-${date}`);
      
      // Отримуємо billing_rules для дати (з урахуванням історії)
      const billingRulesForDate = activity && priceHistory 
        ? getBillingRulesForDate(activity, priceHistory, date)
        : activity?.billing_rules;
      
      // Розраховуємо value на основі billing_rules для "value" (hourly)
      const calculatedValue = calculateHourlyValueFromRule(
        date,
        value,
        customPrice,
        discountPercent,
        billingRulesForDate || null
      );
      
      // Перевіряємо чи був це ручний ввід (value не співпадає з розрахованим)
      const isManualEdit = existing?.manual_value_edit || (calculatedValue !== null && Math.abs((calculatedValue || 0) - value) > 0.01);
      
      try {
        await setAttendance.mutateAsync({
          enrollment_id: enrollmentId,
          date,
          status: null,
          charged_amount: 0,
          value: calculatedValue !== null ? calculatedValue : value,
          notes: null,
          manual_value_edit: isManualEdit,
        });
        const updatedMap = new Map(attendanceMap);
        updatedMap.set(`${enrollmentId}-${date}`, {
          status: null,
          amount: 0,
          value: calculatedValue !== null ? calculatedValue : value,
          manual_value_edit: isManualEdit,
        });
        const optimisticRecords = buildAttendanceRecordsFromMap(updatedMap);
        await syncStaffJournalEntriesForMonth(optimisticRecords);
      } catch (error) {
        // Помилка вже обробляється в useSetAttendance
      }
      return;
    }

    // Якщо є статус - використовуємо передане value (якщо є) або розраховуємо його
    if (status !== null) {
      // Якщо value вже передано з компонента - використовуємо його
      // Інакше розраховуємо value на основі billing_rules
      let finalValue = value;
      
      if (finalValue === null || finalValue === undefined) {
        // Отримуємо billing_rules для дати (з урахуванням історії)
        const billingRulesForDate = activity && priceHistory 
          ? getBillingRulesForDate(activity, priceHistory, date)
          : activity?.billing_rules;
        
        // Розраховуємо value на основі billing_rules для статусу
        finalValue = calculateValueFromBillingRules(
          date,
          status,
          null, // Для статусу valueInput не потрібен
          customPrice,
          discountPercent,
          billingRulesForDate || null
        );
      }
      
      // Використовуємо finalValue для charged_amount (завжди з billing_rules)
      // Якщо finalValue є null - використовуємо 0 (не має бути fallback на стару логіку)
      const chargedAmount = finalValue !== null ? finalValue : 0;
      
      // Перевіряємо чи була це ручна зміна (якщо раніше було manual_value_edit)
      // І перевіряємо попередній статус ДО збереження
      const existing = attendanceMap.get(`${enrollmentId}-${date}`);
      const isManualEdit = existing?.manual_value_edit || false;
      const wasPresent = existing?.status === 'present';
      
      try {
        await setAttendance.mutateAsync({
          enrollment_id: enrollmentId,
          date,
          status,
          charged_amount: chargedAmount,
          value: finalValue, // Використовуємо передане або розраховане value
          notes: null,
          manual_value_edit: isManualEdit,
        });
        
        const updatedMap = new Map(attendanceMap);
        updatedMap.set(`${enrollmentId}-${date}`, {
          status,
          amount: chargedAmount,
          value: finalValue,
          manual_value_edit: isManualEdit,
        });
        const optimisticRecords = buildAttendanceRecordsFromMap(updatedMap);
        await syncStaffJournalEntriesForMonth(optimisticRecords);
      } catch (error) {
        // Помилка вже обробляється в useSetAttendance
      }
    }
  };

  const isLoading = enrollmentsLoading || attendanceLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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
      
      // Якщо всі групи вибрані окрім 'all', автоматично додаємо 'all'
      if (newSelected.size === representedGroups.length + (groupedEnrollments.noGroupEnrollments.length > 0 ? 1 : 0)) {
        newSelected.clear();
        newSelected.add('all');
      }
    }
    
    setSelectedGroups(newSelected);
  };

  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>Немає записів на цю активність</p>
        <p className="text-sm">Додайте дітей у картці учня</p>
      </div>
    );
  }

  if (filteredEnrollments.length === 0) {
    return (
      <div className="animate-fade-in">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">
            {MONTHS[month]} {year}
          </h2>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters */}
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


        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <p>Немає дітей за обраними фільтрами</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="outline" size="icon" onClick={handlePrevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {MONTHS[month]} {year}
        </h2>
        <Button variant="outline" size="icon" onClick={handleNextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
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
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>П: {dailyTotals[selectedDateStr]?.present || 0}</div>
            <div>Х: {dailyTotals[selectedDateStr]?.sick || 0}</div>
            <div>Н: {dailyTotals[selectedDateStr]?.absent || 0}</div>
            <div>Σ: {dailyTotals[selectedDateStr]?.values || 0}</div>
          </div>
          <div className="mt-2 text-sm font-medium">
            Оплата педагогу: {teacherPayments[selectedDateStr] ? formatCurrency(teacherPayments[selectedDateStr]) : '—'}
          </div>
        </div>
      )}

      {isMobile ? (
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
                    const studentId = enrollment.students?.id || enrollment.student_id;
                    const key = `${enrollment.id}-${selectedDateStr}`;
                    const attendance = attendanceMap.get(key);
                    const totals = studentTotals[enrollment.id] || { present: 0, sick: 0, absent: 0, values: 0 };
                    return (
                      <div
                        key={enrollment.id}
                        className={cn('p-4', !enrollment.is_active && 'bg-muted/40 text-muted-foreground')}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            {studentId ? (
                              <Link to={`/students/${studentId}`} className="font-medium text-primary hover:underline">
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
                            <p className="text-xs text-muted-foreground">
                              П: {totals.present} · Х: {totals.sick} · Н: {totals.absent} · Σ: {totals.values}
                            </p>
                          </div>
                          <EnhancedAttendanceCell
                            status={attendance?.status || null}
                            amount={attendance?.amount || 0}
                            value={attendance?.value || null}
                            manualValueEdit={attendance?.manual_value_edit || false}
                            isWeekend={selectedDay ? isWeekend(selectedDay) : false}
                            onChange={(status, value) => handleStatusChange(
                              enrollment.id,
                              selectedDateStr,
                              status,
                              value,
                              0,
                              enrollment.custom_price,
                              enrollment.discount_percent,
                              enrollment
                            )}
                            activityPrice={0}
                            customPrice={enrollment.custom_price}
                            discountPercent={enrollment.discount_percent}
                            date={selectedDateStr}
                            activity={activity}
                            priceHistory={priceHistory}
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
                  const studentId = enrollment.students?.id || enrollment.student_id;
                  const key = `${enrollment.id}-${selectedDateStr}`;
                  const attendance = attendanceMap.get(key);
                  const totals = studentTotals[enrollment.id] || { present: 0, sick: 0, absent: 0, values: 0 };
                  return (
                    <div
                      key={enrollment.id}
                      className={cn('p-4', !enrollment.is_active && 'bg-muted/40 text-muted-foreground')}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          {studentId ? (
                            <Link to={`/students/${studentId}`} className="font-medium text-primary hover:underline">
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
                          <p className="text-xs text-muted-foreground">
                            П: {totals.present} · Х: {totals.sick} · Н: {totals.absent} · Σ: {totals.values}
                          </p>
                        </div>
                        <EnhancedAttendanceCell
                          status={attendance?.status || null}
                          amount={attendance?.amount || 0}
                          value={attendance?.value || null}
                          manualValueEdit={attendance?.manual_value_edit || false}
                          isWeekend={selectedDay ? isWeekend(selectedDay) : false}
                          onChange={(status, value) => handleStatusChange(
                            enrollment.id,
                            selectedDateStr,
                            status,
                            value,
                            0,
                            enrollment.custom_price,
                            enrollment.discount_percent,
                            enrollment
                          )}
                          activityPrice={0}
                          customPrice={enrollment.custom_price}
                          discountPercent={enrollment.discount_percent}
                          date={selectedDateStr}
                          activity={activity}
                          priceHistory={priceHistory}
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
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full border-collapse">
          <thead>
            {/* Рядки підсумків під датами */}
            <tr className="bg-muted/30 border-t-2 font-semibold">
              <th className="sticky left-0 z-10 bg-muted/30 px-4 py-2 text-sm text-left">Всього дітей</th>
              {days.map((day) => {
                const dateStr = formatDateString(day);
                const totals = dailyTotals[dateStr] || { present: 0, sick: 0, absent: 0, values: 0 };
                return (
                  <th
                    key={dateStr}
                    className={cn(
                      "px-1 py-1 text-center text-xs font-medium min-w-[40px]",
                      isWeekend(day) && "bg-amber-50/70 dark:bg-amber-900/20"
                    )}
                  >
                    {totals.present}
                  </th>
                );
              })}
              <th className="sticky right-0 z-10 bg-muted/30 px-2 py-1 text-center text-xs font-medium min-w-[120px]">
                {Object.values(studentTotals).reduce((sum, t) => sum + t.present, 0)}
              </th>
            </tr>
            {visibleGroupRows.map((groupRow) => (
              <tr key={groupRow.id} className="bg-muted/30 font-semibold">
                <th className="sticky left-0 z-10 bg-muted/30 px-4 py-2 text-sm text-left">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: groupRow.color || '#94a3b8' }}
                    />
                    {groupRow.name}
                  </span>
                </th>
                {days.map((day) => {
                  const dateStr = formatDateString(day);
                  const value = groupDailyTotals[groupRow.id]?.[dateStr] || 0;
                  return (
                    <th
                      key={dateStr}
                      className={cn(
                        "px-1 py-1 text-center text-xs font-medium min-w-[40px]",
                        isWeekend(day) && "bg-amber-50/70 dark:bg-amber-900/20"
                      )}
                    >
                      {value}
                    </th>
                  );
                })}
                <th className="sticky right-0 z-10 bg-muted/30 px-2 py-1 text-center text-xs font-medium min-w-[120px]">
                  {Object.values(groupDailyTotals[groupRow.id] || {}).reduce((sum, v) => sum + v, 0)}
                </th>
              </tr>
            ))}
            
            {/* Рядок оплати педагогу */}
            <tr className="bg-primary/10 border-t-2 border-b-2 font-semibold">
              <th className="sticky left-0 z-10 bg-primary/10 px-4 py-2 text-sm text-left">Оплата педагогу</th>
              {days.map((day) => {
                const dateStr = formatDateString(day);
                const payment = teacherPayments[dateStr] || 0;
                return (
                  <th
                    key={dateStr}
                    className={cn(
                      "px-1 py-1 text-center text-xs font-medium min-w-[40px]",
                      isWeekend(day) && "bg-amber-50/70 dark:bg-amber-900/20"
                    )}
                  >
                    {payment > 0 ? formatCurrency(payment) : ''}
                  </th>
                );
              })}
              <th className="sticky right-0 z-10 bg-primary/10 px-2 py-1 text-center text-xs font-medium min-w-[120px]">
                {formatCurrency(Object.values(teacherPayments).reduce((sum, p) => sum + p, 0))}
              </th>
            </tr>

            {/* Основний заголовок таблиці */}
            <tr className="bg-muted/50">
              <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left text-sm font-medium text-muted-foreground min-w-[200px]">
                Учень
              </th>
              {days.map((day) => (
                <th
                  key={formatDateString(day)}
                  className={cn(
                    "px-1 py-2 text-center text-xs font-medium min-w-[40px]",
                    isWeekend(day)
                      ? "text-muted-foreground/50 bg-amber-50/70 dark:bg-amber-900/20"
                      : "text-muted-foreground"
                  )}
                >
                  <div>{getWeekdayShort(day)}</div>
                  <div className="font-semibold">{formatShortDate(day)}</div>
                </th>
              ))}
              <th className="sticky right-0 z-10 bg-muted/50 px-4 py-2 text-center text-xs font-medium min-w-[120px]">
                Підсумки
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Рядки учнів з групуванням */}
            {Array.from(groupedEnrollments.groupsMap.entries()).map(([groupId, groupEnrollments]) => {
              const group = groups.find(g => g.id === groupId);
              return (
                <React.Fragment key={groupId}>
                  {/* Заголовок групи */}
                  <tr className="bg-muted/50 border-t-2 border-b">
                    <td colSpan={days.length + 2} className="px-4 py-2 font-semibold text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: group?.color || '#gray' }}
                        />
                        Група: {group?.name || 'Невідома група'}
                      </div>
                    </td>
                  </tr>
                  {/* Діти в групі */}
                  {groupEnrollments.map((enrollment) => {
                    const totals = studentTotals[enrollment.id] || { present: 0, sick: 0, absent: 0, values: 0 };
                    
                    const studentId = enrollment.students?.id || enrollment.student_id;
                    return (
                      <tr
                        key={enrollment.id}
                        className={cn(
                          'border-t hover:bg-muted/20',
                          !enrollment.is_active && 'bg-muted/40 text-muted-foreground'
                        )}
                      >
                        <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium text-sm">
                          <div className="flex items-center gap-2">
                            {studentId ? (
                              <Link to={`/students/${studentId}`} className="text-primary hover:underline">
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
                          {(enrollment.custom_price || enrollment.discount_percent > 0) && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {enrollment.custom_price && `${enrollment.custom_price} ₴`}
                              {enrollment.discount_percent > 0 && ` -${enrollment.discount_percent}%`}
                            </span>
                          )}
                        </td>
                        {days.map((day) => {
                          const dateStr = formatDateString(day);
                          const key = `${enrollment.id}-${dateStr}`;
                          const attendance = attendanceMap.get(key);
                          
                          return (
                            <td
                              key={dateStr}
                              className={cn(
                                "p-0.5 text-center",
                                isWeekend(day) && "bg-amber-50/70 dark:bg-amber-900/20"
                              )}
                            >
                              <EnhancedAttendanceCell
                                status={attendance?.status || null}
                                amount={attendance?.amount || 0}
                                value={attendance?.value || null}
                                manualValueEdit={attendance?.manual_value_edit || false}
                                isWeekend={isWeekend(day)}
                                onChange={(status, value) => handleStatusChange(
                                  enrollment.id,
                                  dateStr,
                                  status,
                                  value,
                                  0, // activityPrice не використовується - залишаємо для сумісності
                                  enrollment.custom_price,
                                  enrollment.discount_percent,
                                  enrollment
                                )}
                                activityPrice={0} // Не використовується - залишаємо для сумісності типів
                                customPrice={enrollment.custom_price}
                                discountPercent={enrollment.discount_percent}
                                date={dateStr}
                                activity={activity}
                                priceHistory={priceHistory}
                              />
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-10 bg-card px-2 py-2 text-xs text-center">
                          <div>П: {totals.present}</div>
                          <div>Х: {totals.sick}</div>
                          <div>Н: {totals.absent}</div>
                          <div className="mt-1 font-semibold">Σ: {totals.values}</div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            
            {/* Діти без групи */}
            {groupedEnrollments.noGroupEnrollments.length > 0 && (
              <React.Fragment>
                <tr className="bg-muted/50 border-t-2 border-b">
                  <td colSpan={days.length + 2} className="px-4 py-2 font-semibold text-sm">
                    Без групи
                  </td>
                </tr>
                {groupedEnrollments.noGroupEnrollments.map((enrollment) => {
                  const totals = studentTotals[enrollment.id] || { present: 0, sick: 0, absent: 0, values: 0 };
                  
                  const studentId = enrollment.students?.id || enrollment.student_id;
                  return (
                    <tr
                      key={enrollment.id}
                      className={cn(
                        'border-t hover:bg-muted/20',
                        !enrollment.is_active && 'bg-muted/40 text-muted-foreground'
                      )}
                    >
                      <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium text-sm">
                        <div className="flex items-center gap-2">
                          {studentId ? (
                            <Link to={`/students/${studentId}`} className="text-primary hover:underline">
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
                        {(enrollment.custom_price || enrollment.discount_percent > 0) && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {enrollment.custom_price && `${enrollment.custom_price} ₴`}
                            {enrollment.discount_percent > 0 && ` -${enrollment.discount_percent}%`}
                          </span>
                        )}
                      </td>
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        const key = `${enrollment.id}-${dateStr}`;
                        const attendance = attendanceMap.get(key);
                        
                        return (
                          <td
                            key={dateStr}
                            className={cn(
                              "p-0.5 text-center",
                              isWeekend(day) && "bg-amber-50/70 dark:bg-amber-900/20"
                            )}
                          >
                            <EnhancedAttendanceCell
                              status={attendance?.status || null}
                              amount={attendance?.amount || 0}
                              value={attendance?.value || null}
                              manualValueEdit={attendance?.manual_value_edit || false}
                              isWeekend={isWeekend(day)}
                              onChange={(status, value) => handleStatusChange(
                                enrollment.id,
                                dateStr,
                                status,
                                value,
                                0, // activityPrice не використовується - залишаємо для сумісності
                                enrollment.custom_price,
                                enrollment.discount_percent,
                                enrollment
                              )}
                              activityPrice={0} // Не використовується - залишаємо для сумісності типів
                              customPrice={enrollment.custom_price}
                              discountPercent={enrollment.discount_percent}
                              date={dateStr}
                              activity={activity}
                              priceHistory={priceHistory}
                            />
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-card px-2 py-2 text-xs text-center">
                        <div>П: {totals.present}</div>
                        <div>Х: {totals.sick}</div>
                        <div>Н: {totals.absent}</div>
                        <div className="mt-1 font-semibold">Σ: {totals.values}</div>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
