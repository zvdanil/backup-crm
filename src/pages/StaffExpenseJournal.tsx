import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { useStaff } from '@/hooks/useStaff';
import { Link } from 'react-router-dom';
import { useAllStaffJournalEntries, useUpsertStaffJournalEntry, useDeleteStaffJournalEntry, getStaffManualRateForDate, StaffManualRateHistory } from '@/hooks/useStaffBilling';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAttendance } from '@/hooks/useAttendance';
import { useEnrollments } from '@/hooks/useEnrollments';
import { useActivities } from '@/hooks/useActivities';
import { useFinanceTransactions } from '@/hooks/useFinanceTransactions';
import { 
  getDaysInMonth, 
  formatShortDate, 
  getWeekdayShort, 
  isWeekend,
  formatCurrency,
  formatDateString,
} from '@/lib/attendance';
import { calculateStaffSalary } from '@/lib/staffSalary';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

export default function StaffExpenseJournal() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [editingCell, setEditingCell] = useState<{ staffId: string; activityId: string | null; date: string } | null>(null);
  const [manualValue, setManualValue] = useState('');

  // All hooks must be at the top level - no hooks inside loops or conditionals
  const { data: staff = [] } = useStaff();
  const { data: journalEntries = [] } = useAllStaffJournalEntries(month, year);
  const { data: activities = [] } = useActivities();
  const { data: attendanceData = [] } = useAttendance({ month, year });
  const { data: enrollments = [] } = useEnrollments({ activeOnly: true });
  const { data: salaryTransactions = [] } = useFinanceTransactions({ type: 'salary', month, year });
  const upsertJournalEntry = useUpsertStaffJournalEntry();
  const deleteJournalEntry = useDeleteStaffJournalEntry();

  const expenseActivities = useMemo(() => {
    return activities.filter(
      (activity) =>
        activity.category === 'expense' ||
        activity.category === 'household_expense' ||
        activity.category === 'salary'
    );
  }, [activities]);

  // Load all staff manual rate history
  const { data: allManualRateHistory = [] } = useQuery({
    queryKey: ['staff-manual-rate-history-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_manual_rate_history' as any)
        .select('*')
        .order('effective_from', { ascending: false });
      
      if (error) throw error;
      return ((data as any) || []) as StaffManualRateHistory[];
    },
  });

  const { data: staffPayouts = [] } = useQuery({
    queryKey: ['staff-payouts-all', month, year],
    queryFn: async () => {
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('staff_payouts' as any)
        .select('id, staff_id, payout_date, amount')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .gte('payout_date', startDate)
        .lte('payout_date', endDate);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const payoutMap = useMemo(() => {
    const map = new Map<string, number>();
    salaryTransactions.forEach((t) => {
      if (!t.staff_id) return;
      const key = `${t.staff_id}-${t.date}`;
      map.set(key, (map.get(key) || 0) + (t.amount || 0));
    });
    staffPayouts.forEach((payout) => {
      if (!payout.staff_id) return;
      const key = `${payout.staff_id}-${payout.payout_date}`;
      map.set(key, (map.get(key) || 0) + (payout.amount || 0));
    });
    return map;
  }, [salaryTransactions, staffPayouts]);

  const { data: allBillingRules = [] } = useQuery({
    queryKey: ['staff-billing-rules-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_billing_rules' as any)
        .select('*');
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // DIAGNOSTIC: Log journal entries received from server
  React.useEffect(() => {
    console.log('=== StaffExpenseJournal Diagnostic ===');
    console.log('Month:', month, 'Year:', year);
    console.log('Journal data received:', journalEntries);
    console.log('Total entries:', journalEntries.length);
    if (journalEntries.length > 0) {
      console.log('Sample entry:', journalEntries[0]);
      // Group by staff_id + date to show daily sums
      const dailySums = new Map<string, number>();
      journalEntries.forEach(entry => {
        const key = `${entry.staff_id}-${entry.date}`;
        dailySums.set(key, (dailySums.get(key) || 0) + (entry.amount || 0));
      });
      console.log('Daily sums (staff_id-date: amount):', Array.from(dailySums.entries()).slice(0, 10));
    } else {
      console.log('⚠️ WARNING: No journal entries found for this month/year!');
    }
    console.log('=====================================');
  }, [journalEntries, month, year]);

  // Compute derived data using useMemo
  const eligibleStaffIds = useMemo(() => {
    const ids = new Set<string>();
    allBillingRules.forEach((rule: any) => {
      if (rule?.staff_id) ids.add(rule.staff_id);
    });
    allManualRateHistory.forEach((entry) => {
      if (entry?.staff_id) ids.add(entry.staff_id);
    });
    return ids;
  }, [allBillingRules, allManualRateHistory]);

  const activeStaff = useMemo(
    () => staff.filter(s => s.is_active && eligibleStaffIds.has(s.id)),
    [staff, eligibleStaffIds]
  );
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  
  // Create a map of manual rate history by staff_id
  const manualRateHistoryMap = useMemo(() => {
    const map = new Map<string, StaffManualRateHistory[]>();
    allManualRateHistory.forEach(entry => {
      const existing = map.get(entry.staff_id) || [];
      map.set(entry.staff_id, [...existing, entry]);
    });
    return map;
  }, [allManualRateHistory]);
  
  // Map staff activities once at the top level
  const staffActivitiesMap = useMemo(() => {
    const map = new Map<string, typeof activities>();
    activeStaff.forEach(staffMember => {
      const activityIds = new Set<string>();
      enrollments.forEach(e => {
        if (e.teacher_id === staffMember.id && e.activity_id) {
          activityIds.add(e.activity_id);
        }
      });
      const staffActivities = Array.from(activityIds)
        .map(id => activities.find(a => a.id === id))
        .filter(Boolean) as typeof activities;
      map.set(staffMember.id, staffActivities);
    });
    return map;
  }, [activeStaff, enrollments, activities]);

  // Create a map of journal entries for quick lookup
  // Key format: staff_id-date (for summing all activities per day)
  const journalMap = useMemo(() => {
    const map = new Map<string, typeof journalEntries[0]>();
    // Also create a map for staff_id-date to sum all entries for that day
    const dailySumMap = new Map<string, number>();
    
    journalEntries.forEach(entry => {
      // Store individual entries by full key (for manual overrides lookup)
      const fullKey = `${entry.staff_id}-${entry.activity_id || 'null'}-${entry.date}-${entry.is_manual_override ? 'manual' : 'auto'}`;
      map.set(fullKey, entry);
      
      // Sum all entries for staff_id + date (for display)
      const dailyKey = `${entry.staff_id}-${entry.date}`;
      const currentSum = dailySumMap.get(dailyKey) || 0;
      dailySumMap.set(dailyKey, currentSum + (entry.amount || 0));
    });
    
    // Store daily sums in the map with a special key format
    dailySumMap.forEach((sum, key) => {
      map.set(`${key}-SUM`, { amount: sum } as any);
    });
    
    return map;
  }, [journalEntries]);

  const manualActivitiesByStaff = useMemo(() => {
    const map = new Map<string, { activityId: string | null; name: string }[]>();

    const addActivity = (staffId: string, activityId: string | null) => {
      const list = map.get(staffId) || [];
      if (list.some((item) => item.activityId === activityId)) return;

      const name = activityId
        ? activities.find((activity) => activity.id === activityId)?.name || 'Активність'
        : 'Ручні (без активності)';

      list.push({ activityId, name });
      map.set(staffId, list);
    };

    allManualRateHistory.forEach((entry) => {
      addActivity(entry.staff_id, entry.activity_id ?? null);
    });

    journalEntries.forEach((entry) => {
      if (!entry.is_manual_override) return;
      addActivity(entry.staff_id, entry.activity_id ?? null);
    });

    map.forEach((list, staffId) => {
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, 'uk-UA'));
      map.set(staffId, sorted);
    });

    return map;
  }, [activities, allManualRateHistory, journalEntries]);

  // Create a map of attendance for automatic calculations
  const attendanceMap = useMemo(() => {
    const map = new Map<string, { value: number | null; status: string | null; activityId: string }>();
    attendanceData.forEach(att => {
      const enrollment = enrollments.find(e => e.id === att.enrollment_id);
      if (enrollment && enrollment.teacher_id) {
        const key = `${enrollment.teacher_id}-${enrollment.activity_id}-${att.date}`;
        map.set(key, {
          value: att.value || att.charged_amount || null,
          status: att.status,
          activityId: enrollment.activity_id,
        });
      }
    });
    return map;
  }, [attendanceData, enrollments]);

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

  const handleCellClick = (staffId: string, activityId: string | null, date: string) => {
    const key = `${staffId}-${activityId || 'null'}-${date}-manual`;
    const existing = journalMap.get(key);
    setEditingCell({ staffId, activityId, date });
    setManualValue(existing?.amount.toString() || '');
  };

  const handleSaveManualEntry = () => {
    if (!editingCell) return;

    const staffMember = activeStaff.find(s => s.id === editingCell.staffId);
    if (!staffMember) return;

    // Використовуємо ручні ставки, якщо вони налаштовані для активності
    const history = manualRateHistoryMap.get(editingCell.staffId);
    const currentRate = getStaffManualRateForDate(history, editingCell.date, editingCell.activityId || null);
    const rateType = currentRate?.manual_rate_type || null;
    const rateValue = currentRate?.manual_rate_value || 0;

    if (rateType === 'hourly') {
      // Почасово: вводимо кількість годин, нарахування = години * ставка
      if (!manualValue || manualValue.trim() === '') {
        // Якщо поле порожнє - видаляємо запис
        const key = `${editingCell.staffId}-${editingCell.activityId || 'null'}-${editingCell.date}-manual`;
        const existing = journalMap.get(key);
        if (existing?.id) {
          deleteJournalEntry.mutate({ id: existing.id });
        } else {
          deleteJournalEntry.mutate({
            staff_id: editingCell.staffId,
            activity_id: editingCell.activityId,
            date: editingCell.date,
            is_manual_override: true,
          });
        }
        setEditingCell(null);
        setManualValue('');
        return;
      }
      
      const hours = parseFloat(manualValue);
      if (isNaN(hours) || hours < 0) return;

      // Якщо години = 0, видаляємо запис
      if (hours === 0) {
        const key = `${editingCell.staffId}-${editingCell.activityId || 'null'}-${editingCell.date}-manual`;
        const existing = journalMap.get(key);
        if (existing?.id) {
          deleteJournalEntry.mutate({ id: existing.id });
        } else {
          deleteJournalEntry.mutate({
            staff_id: editingCell.staffId,
            activity_id: editingCell.activityId,
            date: editingCell.date,
            is_manual_override: true,
          });
        }
        setEditingCell(null);
        setManualValue('');
        return;
      }

      const amount = hours * rateValue;

      upsertJournalEntry.mutate({
        staff_id: editingCell.staffId,
        activity_id: editingCell.activityId,
        date: editingCell.date,
        amount,
        base_amount: rateValue,
        deductions_applied: [],
        is_manual_override: true,
        notes: `${hours} год. × ${rateValue} ₴`,
      });

      setEditingCell(null);
      setManualValue('');
    } else if (rateType === 'per_session') {
      // За заняття: вводимо кількість занять, нарахування = кількість * ставка
      if (!manualValue || manualValue.trim() === '') {
        // Якщо поле порожнє - видаляємо запис
        const key = `${editingCell.staffId}-${editingCell.activityId || 'null'}-${editingCell.date}-manual`;
        const existing = journalMap.get(key);
        if (existing?.id) {
          deleteJournalEntry.mutate({ id: existing.id });
        } else {
          deleteJournalEntry.mutate({
            staff_id: editingCell.staffId,
            activity_id: editingCell.activityId,
            date: editingCell.date,
            is_manual_override: true,
          });
        }
        setEditingCell(null);
        setManualValue('');
        return;
      }

      const sessions = parseFloat(manualValue);
      if (isNaN(sessions) || sessions < 0) return;
      if (sessions === 0) {
        const key = `${editingCell.staffId}-${editingCell.activityId || 'null'}-${editingCell.date}-manual`;
        const existing = journalMap.get(key);
        if (existing?.id) {
          deleteJournalEntry.mutate({ id: existing.id });
        } else {
          deleteJournalEntry.mutate({
            staff_id: editingCell.staffId,
            activity_id: editingCell.activityId,
            date: editingCell.date,
            is_manual_override: true,
          });
        }
        setEditingCell(null);
        setManualValue('');
        return;
      }

      const amount = sessions * rateValue;

      upsertJournalEntry.mutate({
        staff_id: editingCell.staffId,
        activity_id: editingCell.activityId,
        date: editingCell.date,
        amount,
        base_amount: rateValue,
        deductions_applied: [],
        is_manual_override: true,
        notes: `${sessions} зан. × ${rateValue} ₴`,
      });

      setEditingCell(null);
      setManualValue('');
    } else {
      // Fallback: зберігаємо значення як є
      if (!manualValue) return;
      const amount = parseFloat(manualValue);
      if (isNaN(amount)) return;

      upsertJournalEntry.mutate({
        staff_id: editingCell.staffId,
        activity_id: editingCell.activityId,
        date: editingCell.date,
        amount,
        base_amount: null,
        deductions_applied: [],
        is_manual_override: true,
        notes: null,
      });

      setEditingCell(null);
      setManualValue('');
    }
  };

  const getAutoCellValue = (staffId: string, date: string): number | null => {
    const entriesForDate = journalEntries.filter(
      entry => entry.staff_id === staffId && entry.date === date && !entry.is_manual_override
    );

    const journalTotal = entriesForDate.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    if (journalTotal > 0) {
      return journalTotal;
    }

    // If no journal entries, try to calculate from attendance
    const staffMember = activeStaff.find(s => s.id === staffId);
    if (!staffMember) return null;

    const relevantActivities = activities.filter(activity => {
      return enrollments.some(e =>
        e.teacher_id === staffId &&
        e.activity_id === activity.id
      );
    });

    let calculatedTotal = 0;
    let hasCalculations = false;

    relevantActivities.forEach(activity => {
      const attendanceKey = `${staffId}-${activity.id}-${date}`;
      const attendance = attendanceMap.get(attendanceKey);

      if (attendance) {
        const activityBillingRules = activity.billing_rules || null;
        const calculation = calculateStaffSalary({
          staff: staffMember,
          activity,
          date,
          attendanceValue: attendance.value,
          attendanceStatus: attendance.status as any,
          staffBillingRule: null, // Would need to fetch from staff_billing_rules
          activityBillingRules,
          deductions: (staffMember.deductions as any) || [],
        });

        if (calculation && calculation.finalAmount > 0) {
          calculatedTotal += calculation.finalAmount;
          hasCalculations = true;
        }
      }
    });

    return hasCalculations ? calculatedTotal : null;
  };

  const getManualCellValue = (staffId: string, activityId: string | null, date: string): number | null => {
    const key = `${staffId}-${activityId || 'null'}-${date}-manual`;
    const journalEntry = journalMap.get(key);
    if (journalEntry && journalEntry.is_manual_override) {
      return journalEntry.amount;
    }
    return null;
  };

  const renderManualCell = (staffId: string, activityId: string | null, dateStr: string, isWeekendDay: boolean) => {
    const cellValue = getManualCellValue(staffId, activityId, dateStr);
    const isEditing = editingCell?.staffId === staffId &&
      editingCell?.activityId === activityId &&
      editingCell?.date === dateStr;

    return (
      <td
        key={dateStr}
        className={cn(
          "p-0.5 text-center",
          isWeekendDay && "bg-amber-50/70 dark:bg-amber-900/20"
        )}
      >
        <Popover open={isEditing} onOpenChange={(open) => !open && setEditingCell(null)}>
          <PopoverTrigger asChild>
            <button
              onClick={() => handleCellClick(staffId, activityId, dateStr)}
              className={cn(
                "w-full h-8 text-xs rounded hover:bg-muted transition-colors",
                cellValue !== null ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
              )}
            >
              {cellValue !== null ? formatCurrency(cellValue) : '—'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="space-y-3">
              {(() => {
                const history = manualRateHistoryMap.get(staffId);
                const currentRate = editingCell
                  ? getStaffManualRateForDate(history, editingCell.date, editingCell.activityId || null)
                  : null;
                const rateType = currentRate?.manual_rate_type || null;
                const rateValue = currentRate?.manual_rate_value || 0;

                if (rateType === 'hourly') {
                  return (
                    <>
                      <div>
                        <label className="text-sm font-medium">Кількість годин</label>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          value={manualValue}
                          onChange={(e) => setManualValue(e.target.value)}
                          placeholder="0"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Ставка: {rateValue} ₴/год
                        </p>
                        {manualValue && !isNaN(parseFloat(manualValue)) && (
                          <p className="text-xs font-medium text-primary mt-1">
                            Нарахування: {formatCurrency(parseFloat(manualValue) * rateValue)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveManualEntry}
                          className="flex-1"
                          disabled={!manualValue || isNaN(parseFloat(manualValue)) || parseFloat(manualValue) < 0}
                        >
                          Зберегти
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingCell(null);
                            setManualValue('');
                          }}
                        >
                          Скасувати
                        </Button>
                      </div>
                    </>
                  );
                }

                if (rateType === 'per_session') {
                  return (
                    <>
                      <div>
                        <label className="text-sm font-medium">Кількість занять</label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={manualValue}
                          onChange={(e) => setManualValue(e.target.value)}
                          placeholder="0"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Ставка: {formatCurrency(rateValue)} / заняття
                        </p>
                        {manualValue && !isNaN(parseFloat(manualValue)) && (
                          <p className="text-xs font-medium text-primary mt-1">
                            Нарахування: {formatCurrency(parseFloat(manualValue) * rateValue)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveManualEntry}
                          className="flex-1"
                          disabled={!manualValue || isNaN(parseFloat(manualValue)) || parseFloat(manualValue) < 0}
                        >
                          Зберегти
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingCell(null);
                            setManualValue('');
                          }}
                        >
                          Скасувати
                        </Button>
                      </div>
                    </>
                  );
                }

                return (
                  <>
                    <div>
                      <label className="text-sm font-medium">Сума (₴)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={manualValue}
                        onChange={(e) => setManualValue(e.target.value)}
                        placeholder="0"
                        className="mt-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveManualEntry}
                        className="flex-1"
                        disabled={!manualValue || isNaN(parseFloat(manualValue)) || parseFloat(manualValue) < 0}
                      >
                        Зберегти
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingCell(null);
                          setManualValue('');
                        }}
                      >
                        Скасувати
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          </PopoverContent>
        </Popover>
      </td>
    );
  };

  return (
    <>
      <PageHeader
        title="Журнал витрат на персонал"
        description="Управління витратами на зарплату персоналу"
      />

      <div className="p-8">
        {expenseActivities.length > 0 && (
          <div className="mb-4 rounded-xl border bg-card p-4">
            <div className="text-sm font-medium mb-3">Журнали витрат по активностях</div>
            <div className="flex flex-wrap gap-2">
              {expenseActivities.map((activity) => (
                <Button key={activity.id} variant="outline" size="sm" asChild>
                  <Link to={`/activities/${activity.id}/expenses`}>{activity.name}</Link>
                </Button>
              ))}
            </div>
          </div>
        )}
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

        {/* Grid */}
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left text-sm font-medium text-muted-foreground min-w-[200px]">
                  Персонал
                </th>
                {days.map((day) => (
                  <th
                    key={formatDateString(day)}
                    className={cn(
                      "px-1 py-2 text-center text-xs font-medium min-w-[60px]",
                      isWeekend(day)
                        ? 'text-muted-foreground/50 bg-amber-50/70 dark:bg-amber-900/20'
                        : 'text-muted-foreground'
                    )}
                  >
                    <div>{getWeekdayShort(day)}</div>
                    <div className="font-semibold">{formatShortDate(day)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeStaff.map((staffMember) => {
                // Get activities from pre-computed map (no hooks here!)
                const staffActivities = staffActivitiesMap.get(staffMember.id) || [];

                return (
                  <React.Fragment key={staffMember.id}>
                    {/* Staff row with all activities combined */}
                  <tr className="border-t hover:bg-muted/20">
                      <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium text-sm">
                        <Link to={`/staff/${staffMember.id}`} className="text-primary hover:underline">
                          {staffMember.full_name}
                        </Link>
                        <div className="text-xs text-muted-foreground mt-1">
                          {staffMember.position}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Авто нарахування
                        </div>
                      </td>
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        const cellValue = getAutoCellValue(staffMember.id, dateStr);

                        return (
                          <td
                            key={dateStr}
                            className={cn(
                              "p-0.5 text-center",
                              isWeekend(day) && "bg-amber-50/70 dark:bg-amber-900/20"
                            )}
                          >
                            <div className={cn(
                              "w-full h-8 text-xs rounded flex items-center justify-center",
                              cellValue !== null ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                            )}>
                              {cellValue !== null ? formatCurrency(cellValue) : '—'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    {(manualActivitiesByStaff.get(staffMember.id) || []).map((manualActivity) => (
                      <tr key={`${staffMember.id}-${manualActivity.activityId || 'null'}`} className="border-t bg-muted/10">
                        <td className="sticky left-0 z-10 bg-card/95 px-4 py-2 text-sm text-muted-foreground">
                          {staffMember.full_name} — {manualActivity.name}
                        </td>
                        {days.map((day) =>
                          renderManualCell(
                            staffMember.id,
                            manualActivity.activityId,
                            formatDateString(day),
                            isWeekend(day)
                          )
                        )}
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/20">
                      <td className="sticky left-0 z-10 bg-card/95 px-4 py-2 text-sm text-muted-foreground">
                        {staffMember.full_name} — Виплати
                      </td>
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        const amount = payoutMap.get(`${staffMember.id}-${dateStr}`) || 0;
                        return (
                          <td
                            key={dateStr}
                            className={cn(
                              "p-0.5 text-center text-red-600 font-medium",
                              isWeekend(day) && "bg-amber-50/70 dark:bg-amber-900/20"
                            )}
                          >
                            {amount > 0 ? formatCurrency(amount) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          <p>• Натисніть на клітинку для введення суми вручну</p>
          <p>• Автоматичні нарахування з основного журналу відображаються автоматично</p>
          <p>• Вручну введені суми мають пріоритет над автоматичними</p>
        </div>
      </div>
    </>
  );
}
