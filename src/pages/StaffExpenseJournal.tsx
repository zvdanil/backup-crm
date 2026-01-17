import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { useStaff } from '@/hooks/useStaff';
import { useAllStaffJournalEntries, useUpsertStaffJournalEntry, useDeleteStaffJournalEntry, getStaffManualRateForDate, StaffManualRateHistory } from '@/hooks/useStaffBilling';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAttendance } from '@/hooks/useAttendance';
import { useEnrollments } from '@/hooks/useEnrollments';
import { useActivities } from '@/hooks/useActivities';
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
  const upsertJournalEntry = useUpsertStaffJournalEntry();
  const deleteJournalEntry = useDeleteStaffJournalEntry();
  
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
  const activeStaff = useMemo(() => staff.filter(s => s.is_active), [staff]);
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
      const fullKey = `${entry.staff_id}-${entry.activity_id || 'null'}-${entry.date}`;
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
    const key = `${staffId}-${activityId || 'null'}-${date}`;
    const existing = journalMap.get(key);
    setEditingCell({ staffId, activityId, date });
    setManualValue(existing?.amount.toString() || '');
  };

  const handleSaveManualEntry = () => {
    if (!editingCell) return;

    const staffMember = activeStaff.find(s => s.id === editingCell.staffId);
    if (!staffMember || staffMember.accrual_mode !== 'manual') {
      // Якщо не manual режим, просто зберігаємо значення як є
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
      return;
    }

    // Для manual режиму використовуємо логіку типу ставки з історії
    const history = manualRateHistoryMap.get(editingCell.staffId);
    const currentRate = getStaffManualRateForDate(history, editingCell.date);
    const rateType = currentRate?.manual_rate_type || null;
    const rateValue = currentRate?.manual_rate_value || 0;

    if (rateType === 'hourly') {
      // Почасово: вводимо кількість годин, нарахування = години * ставка
      if (!manualValue || manualValue.trim() === '') {
        // Якщо поле порожнє - видаляємо запис
        const key = `${editingCell.staffId}-${editingCell.activityId || 'null'}-${editingCell.date}`;
        const existing = journalMap.get(key);
        if (existing?.id) {
          deleteJournalEntry.mutate({ id: existing.id });
        } else {
          deleteJournalEntry.mutate({
            staff_id: editingCell.staffId,
            activity_id: editingCell.activityId,
            date: editingCell.date,
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
        const key = `${editingCell.staffId}-${editingCell.activityId || 'null'}-${editingCell.date}`;
        const existing = journalMap.get(key);
        if (existing?.id) {
          deleteJournalEntry.mutate({ id: existing.id });
        } else {
          deleteJournalEntry.mutate({
            staff_id: editingCell.staffId,
            activity_id: editingCell.activityId,
            date: editingCell.date,
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
      // За заняття: можна ввести число вручну або залишити порожнім для використання ставки за замовчуванням
      let amount: number;
      if (manualValue && manualValue.trim() !== '') {
        amount = parseFloat(manualValue);
        if (isNaN(amount) || amount < 0) return;
      } else {
        // Якщо порожньо, використовуємо ставку за замовчуванням
        amount = rateValue;
      }

      upsertJournalEntry.mutate({
        staff_id: editingCell.staffId,
        activity_id: editingCell.activityId,
        date: editingCell.date,
        amount,
        base_amount: rateValue,
        deductions_applied: [],
        is_manual_override: true,
        notes: manualValue && manualValue.trim() !== '' ? 'Введено вручну' : 'За замовчуванням',
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

  // Component to fetch billing rules for a staff member (used in getCellValue)
  // FIXED: Now sums all entries for staff_id + date, regardless of activity_id
  const getCellValue = (staffId: string, activityId: string | null, date: string): number | null => {
    // When activityId is null, we want to sum ALL entries for this staff member on this date
    if (activityId === null) {
      // Sum all journal entries for this staff_id + date
      const entriesForDate = journalEntries.filter(
        entry => entry.staff_id === staffId && entry.date === date
      );
      
      if (entriesForDate.length > 0) {
        const totalAmount = entriesForDate.reduce((sum, entry) => sum + (entry.amount || 0), 0);
        console.log(`[getCellValue] Summed ${entriesForDate.length} entries for ${staffId} on ${date}: ${totalAmount}`);
        return totalAmount;
      }
      
      // If no journal entries, try to calculate from attendance
      // Sum all attendance-based calculations for this staff member on this date
      const staffMember = activeStaff.find(s => s.id === staffId);
      if (!staffMember) return null;
      
      // Find all activities where this staff member is the teacher
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
    }
    
    // If activityId is provided, look for specific entry (for manual overrides)
    const key = `${staffId}-${activityId}-${date}`;
    const journalEntry = journalMap.get(key);
    if (journalEntry) {
      return journalEntry.amount;
    }

    return null;
  };

  return (
    <>
      <PageHeader
        title="Журнал витрат на персонал"
        description="Управління витратами на зарплату персоналу"
      />

      <div className="p-8">
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
                      isWeekend(day) ? 'text-muted-foreground/50' : 'text-muted-foreground'
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
                      </td>
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        const cellValue = getCellValue(staffMember.id, null, dateStr);
                        const isEditing = editingCell?.staffId === staffMember.id && 
                                         editingCell?.activityId === null && 
                                         editingCell?.date === dateStr;

                        return (
                          <td key={dateStr} className="p-0.5 text-center">
                            <Popover open={isEditing} onOpenChange={(open) => !open && setEditingCell(null)}>
                              <PopoverTrigger asChild>
                                <button
                                  onClick={() => handleCellClick(staffMember.id, null, dateStr)}
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
                                    const isManualMode = staffMember.accrual_mode === 'manual';
                                    const history = manualRateHistoryMap.get(staffMember.id);
                                    const currentRate = editingCell ? getStaffManualRateForDate(history, editingCell.date) : null;
                                    const rateType = currentRate?.manual_rate_type || null;
                                    const rateValue = currentRate?.manual_rate_value || 0;

                                    if (isManualMode && rateType === 'hourly') {
                                      // Почасово: вводимо кількість годин
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
                                    } else if (isManualMode && rateType === 'per_session') {
                                      // За заняття: можна ввести число або залишити порожнім для ставки за замовчуванням
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
                                              placeholder={rateValue > 0 ? rateValue.toString() : "0"}
                                              className="mt-1"
                                            />
                                            <p className="text-xs text-muted-foreground mt-1">
                                              Ставка за замовчуванням: {formatCurrency(rateValue)}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                              Залиште порожнім, щоб використати ставку за замовчуванням
                                            </p>
                                          </div>
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              onClick={handleSaveManualEntry}
                                              className="flex-1"
                                              disabled={manualValue !== '' && (isNaN(parseFloat(manualValue)) || parseFloat(manualValue) < 0)}
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
                                    } else {
                                      // Звичайний режим: вводимо суму
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
                                    }
                                  })()}
                                </div>
                              </PopoverContent>
                            </Popover>
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
