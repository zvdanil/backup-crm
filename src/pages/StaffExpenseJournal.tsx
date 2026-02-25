import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { useStaff } from '@/hooks/useStaff';
import { Link } from 'react-router-dom';
import { useAllStaffJournalEntries, useUpsertStaffJournalEntry, useDeleteStaffJournalEntry, getStaffManualRateForDate, StaffManualRateHistory, useCreateStaffPayout, useUpdateStaffPayout, useDeleteStaffPayout } from '@/hooks/useStaffBilling';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAttendance } from '@/hooks/useAttendance';
import { useEnrollments } from '@/hooks/useEnrollments';
import { useActivities } from '@/hooks/useActivities';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import { useCommissionEntry, useCommissionsForSalaryTransactions } from '@/hooks/useCommissionEntry';
import { 
  getDaysInMonth, 
  formatShortDate, 
  getWeekdayShort, 
  isWeekend,
  WEEKEND_BG_COLOR,
  formatCurrency,
  formatDateString,
  formatDate,
  filterDaysByPeriod,
  type PeriodFilter,
  calculateManualRateAmount,
  getMonthStartDate,
  getMonthEndDate
} from '@/lib/attendance';
import { getWorkingDaysInMonthWithHolidays } from '@/hooks/useHolidays';
import { calculateStaffSalary } from '@/lib/staffSalary';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { AddExpenseJournalDialog } from '@/components/expense/AddExpenseJournalDialog';
import { PayrollPayoutDialog } from '@/components/staff/PayrollPayoutDialog';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];
const STAFF_EXPENSE_QUERY_KEYS = {
  staffPayoutsAll: 'staff-payouts-all',
  salaryTxForPayouts: 'salary-tx-for-payouts',
  salaryTxMetaForPayouts: 'salary-tx-meta-for-payouts',
} as const;

export default function StaffExpenseJournal() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('month');
  const [editingCell, setEditingCell] = useState<{ staffId: string; activityId: string | null; date: string } | null>(null);
  const [manualValue, setManualValue] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  // Состояние для ручного режима per_working_day
  const [perWorkingDayState, setPerWorkingDayState] = useState({
    attendanceStatus: null,
    manualAmount: '',
    bonus: '',
    bonusNotes: '',
  });
  // Фільтр для відображення типів рядків
  const [rowTypeFilter, setRowTypeFilter] = useState<string[]>(['auto', 'manual', 'payouts']);
  const [addExpenseJournalDialogOpen, setAddExpenseJournalDialogOpen] = useState(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [selectedPayoutStaffId, setSelectedPayoutStaffId] = useState<string>('');
  const [selectedPayoutDate, setSelectedPayoutDate] = useState<string>('');
  const [editingPayoutId, setEditingPayoutId] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutDate, setPayoutDate] = useState(formatDateString(now));
  const [payoutNotes, setPayoutNotes] = useState('');
  const [payoutAccountId, setPayoutAccountId] = useState('');
  const [payoutCommission, setPayoutCommission] = useState('');
  const [payoutCategoryId, setPayoutCategoryId] = useState<string>('none');
  const [payoutErrors, setPayoutErrors] = useState<Record<string, { message: string }>>({});
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  // All hooks must be at the top level - no hooks inside loops or conditionals
  const { data: staff = [] } = useStaff();
  const { data: journalEntries = [] } = useAllStaffJournalEntries(month, year);
  const { data: activities = [] } = useActivities();
  const { data: attendanceData = [] } = useAttendance({ month, year });
  const { data: enrollments = [] } = useEnrollments({ activeOnly: true });
  const upsertJournalEntry = useUpsertStaffJournalEntry();
  const deleteJournalEntry = useDeleteStaffJournalEntry();
  const { data: accounts = [] } = usePaymentAccounts();
  const createPayout = useCreateStaffPayout();
  const updatePayout = useUpdateStaffPayout();
  const deletePayout = useDeleteStaffPayout();
  const syncCommission = useCommissionEntry();

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
    queryKey: [STAFF_EXPENSE_QUERY_KEYS.staffPayoutsAll, month, year],
    queryFn: async () => {
      const startDate = getMonthStartDate(year, month);
      const endDate = getMonthEndDate(year, month);
      const { data, error } = await supabase
        .from('staff_payouts' as any)
        .select('id, staff_id, payout_date, amount, notes, account_id')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .gte('payout_date', startDate)
        .lte('payout_date', endDate);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
  const payoutIds = useMemo(() => staffPayouts.map((p) => p.id), [staffPayouts]);
  const payoutIdsKey = useMemo(() => [...payoutIds].sort().join(','), [payoutIds]);
  const { data: salaryTxByPayoutId = new Map<string, string>() } = useQuery({
    queryKey: [STAFF_EXPENSE_QUERY_KEYS.salaryTxForPayouts, payoutIdsKey],
    queryFn: async () => {
      if (payoutIds.length === 0) return new Map<string, string>();
      const { data, error } = await supabase
        .from('finance_transactions')
        .select('id, staff_payout_id')
        .in('staff_payout_id', payoutIds);
      if (error) return new Map<string, string>();
      const map = new Map<string, string>();
      (data || []).forEach((row: any) => {
        if (row.staff_payout_id) map.set(row.staff_payout_id, row.id);
      });
      return map;
    },
    enabled: payoutIds.length > 0,
  });
  const salaryTxIds = useMemo(() => Array.from(salaryTxByPayoutId.values()), [salaryTxByPayoutId]);
  const { data: commissionsMap = new Map<string, { amount: number; id: string }>() } =
    useCommissionsForSalaryTransactions(salaryTxIds);
  const { data: salaryTxMeta = [] } = useQuery({
    queryKey: [STAFF_EXPENSE_QUERY_KEYS.salaryTxMetaForPayouts, payoutIdsKey],
    queryFn: async () => {
      if (payoutIds.length === 0) return [];
      const { data, error } = await supabase
        .from('finance_transactions' as any)
        .select('staff_payout_id, expense_category_id')
        .eq('type', 'salary')
        .in('staff_payout_id', payoutIds);
      if (error) return [];
      return (data as any[]) || [];
    },
    enabled: payoutIds.length > 0,
  });
  const salaryTxMetaByPayoutId = useMemo(() => {
    const map = new Map<string, { expense_category_id: string | null }>();
    salaryTxMeta.forEach((row: any) => {
      if (row.staff_payout_id) {
        map.set(row.staff_payout_id, {
          expense_category_id: row.expense_category_id || null,
        });
      }
    });
    return map;
  }, [salaryTxMeta]);

  const payoutMap = useMemo(() => {
    const map = new Map<string, number>();
    staffPayouts.forEach((payout) => {
      if (!payout.staff_id) return;
      const key = `${payout.staff_id}-${payout.payout_date}`;
      map.set(key, (map.get(key) || 0) + (payout.amount || 0));
    });
    return map;
  }, [staffPayouts]);
  const salaryActivity = useMemo(
    () => activities.find((activity) => activity.category === 'salary') || null,
    [activities]
  );
  const { data: salaryExpenseCategories = [] } = useExpenseCategories(salaryActivity?.id);
  const payoutDialogRows = useMemo(
    () =>
      staffPayouts.filter(
        (p) => p.staff_id === selectedPayoutStaffId && p.payout_date === selectedPayoutDate
      ),
    [staffPayouts, selectedPayoutStaffId, selectedPayoutDate]
  );

  const resetPayoutForm = (nextDate?: string) => {
    setEditingPayoutId(null);
    setPayoutAmount('');
    setPayoutDate(nextDate || formatDateString(new Date()));
    setPayoutNotes('');
    setPayoutAccountId('');
    setPayoutCommission('');
    setPayoutCategoryId('none');
    setPayoutErrors({});
  };

  const openPayoutDialogForCell = (staffId: string, dateStr: string) => {
    resetPayoutForm(dateStr);
    setSelectedPayoutStaffId(staffId);
    setSelectedPayoutDate(dateStr);
    setPayoutDialogOpen(true);
  };

  const closePayoutDialog = () => {
    setPayoutDialogOpen(false);
    setSelectedPayoutStaffId('');
    setSelectedPayoutDate('');
    resetPayoutForm(formatDateString(new Date()));
  };

  const handlePayoutSubmit = async () => {
    const nextErrors: Record<string, { message: string }> = {};
    const amountNum = parseFloat(payoutAmount);
    if (!selectedPayoutStaffId) nextErrors.staff_id = { message: 'Оберіть співробітника' };
    if (!payoutDate) nextErrors.payout_date = { message: 'Оберіть дату' };
    if (!payoutAmount || Number.isNaN(amountNum) || amountNum <= 0) {
      nextErrors.amount = { message: 'Сума має бути більше 0' };
    }
    if (!payoutAccountId) nextErrors.account_id = { message: 'Оберіть рахунок' };
    if (Object.keys(nextErrors).length > 0) {
      setPayoutErrors(nextErrors);
      return;
    }
    setPayoutErrors({});

    const selectedCategoryId =
      payoutCategoryId && payoutCategoryId !== 'none' ? payoutCategoryId : null;
    let salaryTransactionId = '';
    if (editingPayoutId) {
      await updatePayout.mutateAsync({
        id: editingPayoutId,
        staff_id: selectedPayoutStaffId,
        amount: amountNum,
        payout_date: payoutDate,
        notes: payoutNotes || null,
        account_id: payoutAccountId || null,
        expense_category_id: selectedCategoryId,
      } as any);
      salaryTransactionId = salaryTxByPayoutId.get(editingPayoutId) || '';
    } else {
      const created = await createPayout.mutateAsync({
        staff_id: selectedPayoutStaffId,
        amount: amountNum,
        payout_date: payoutDate,
        notes: payoutNotes || null,
        account_id: payoutAccountId || null,
        expense_category_id: selectedCategoryId,
      } as any);
      salaryTransactionId = (created as any).salaryTransactionId || '';
    }
    const commissionAmount = Number(payoutCommission || 0);
    if (salaryTransactionId) {
      const staffName = staff.find((s) => s.id === selectedPayoutStaffId)?.full_name || 'невідомий';
      await syncCommission.mutateAsync({
        salaryTransactionId,
        amount: commissionAmount,
        date: payoutDate,
        accountId: payoutAccountId || null,
        staffName,
      });
    }
    closePayoutDialog();
  };

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

  // Filter staff by selected filter
  const filteredStaff = useMemo(() => {
    if (selectedStaffId === 'all') {
      return activeStaff;
    }
    return activeStaff.filter(s => s.id === selectedStaffId);
  }, [activeStaff, selectedStaffId]);
  const allDays = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const days = useMemo(() => filterDaysByPeriod(allDays, periodFilter, now), [allDays, periodFilter, now]);

  // Sync scroll between header and body
  useEffect(() => {
    const header = headerScrollRef.current;
    if (!header) return;
    const sync = () => {
      const left = header.scrollLeft;
      if (bodyScrollRef.current) bodyScrollRef.current.scrollLeft = left;
    };
    header.addEventListener('scroll', sync, { passive: true });
    sync();
    return () => header.removeEventListener('scroll', sync);
  }, [days.length, filteredStaff.length]);

  const tableColGroup = useMemo(() => (
    <colgroup>
      <col style={{ width: '200px', minWidth: '200px' }} />
      {days.map((day) => (
        <col key={formatDateString(day)} style={{ width: '60px', minWidth: '60px' }} />
      ))}
    </colgroup>
  ), [days]);
  
  // Create a map of manual rate history by staff_id
  const manualRateHistoryMap = useMemo(() => {
    const map = new Map<string, StaffManualRateHistory[]>();
    allManualRateHistory.forEach(entry => {
      const existing = map.get(entry.staff_id) || [];
      map.set(entry.staff_id, [...existing, entry]);
    });
    return map;
  }, [allManualRateHistory]);
  
  // Map staff activities based on billing rules (not enrollments)
  // Only staff with automatic billing rules should have activities
  const staffActivitiesMap = useMemo(() => {
    const map = new Map<string, typeof activities>();
    activeStaff.forEach(staffMember => {
      const activityIds = new Set<string>();
      // Get activities from billing rules (automatic rates)
      allBillingRules.forEach((rule: any) => {
        if (rule.staff_id === staffMember.id && rule.activity_id) {
          activityIds.add(rule.activity_id);
        }
      });
      const staffActivities = Array.from(activityIds)
        .map(id => activities.find(a => a.id === id))
        .filter(Boolean) as typeof activities;
      map.set(staffMember.id, staffActivities);
    });
    return map;
  }, [activeStaff, allBillingRules, activities]);
  
  // Check if staff has automatic billing rules
  const staffHasAutoRates = useMemo(() => {
    const set = new Set<string>();
    allBillingRules.forEach((rule: any) => {
      if (rule.staff_id) {
        set.add(rule.staff_id);
      }
    });
    return set;
  }, [allBillingRules]);

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
    if (!attendanceData || !Array.isArray(attendanceData)) return map;
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
    
    // Для почасовых ставок показываем часы, для остальных - сумму
    const history = manualRateHistoryMap.get(staffId);
    const currentRate = getStaffManualRateForDate(history, date, activityId || null);
    const rateType = currentRate?.manual_rate_type || null;
    
    if (rateType === 'hourly' && existing?.hours_worked !== null && existing?.hours_worked !== undefined) {
      setManualValue(existing.hours_worked.toString());
    } else if (rateType === 'per_session') {
      // Для per_session вычисляем количество занятий из суммы и ставки
      const rateValue = currentRate?.manual_rate_value || 0;
      if (existing && rateValue > 0) {
        const sessions = existing.amount / rateValue;
        setManualValue(sessions.toString());
      } else {
        setManualValue(existing?.amount.toString() || '');
      }
    } else {
      setManualValue(existing?.amount.toString() || '');
    }
  };

  const handleSaveManualEntry = async () => {
    if (!editingCell) return;

    const staffMember = activeStaff.find(s => s.id === editingCell.staffId);
    if (!staffMember) return;

    // Використовуємо ручні ставки, якщо вони налаштовані для активності
    const history = manualRateHistoryMap.get(editingCell.staffId);
    const currentRate = getStaffManualRateForDate(history, editingCell.date, editingCell.activityId || null);
    const rateType = currentRate?.manual_rate_type || null;
    const rateValue = currentRate?.manual_rate_value || 0;

    // Проверка: если ставки на дату нет — показываем ошибку и не сохраняем запись
    if (!rateType || rateValue === 0) {
      alert('Для цієї дати не налаштована ставка для ручного режиму. Додайте ставку в картці педагога.');
      return;
    }

    if (rateType === 'per_working_day') {
      // Обработка ручного режима по рабочим дням
      const { attendanceStatus, manualAmount, bonus, bonusNotes } = perWorkingDayState;
      if (!attendanceStatus) return;

      const dateObj = new Date(editingCell.date);
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth() + 1;
      let amount = 0;
      let notes = '';
      if (attendanceStatus === 'present') {
        amount = await calculateManualRateAmount({
          rateValue,
          year,
          month,
          getWorkingDaysInMonthWithHolidaysFn: getWorkingDaysInMonthWithHolidays
        });
        notes = 'Присутній (робочий день)';
      } else if (attendanceStatus === 'manual') {
        if (!manualAmount || isNaN(parseFloat(manualAmount))) return;
        amount = parseFloat(manualAmount);
        notes = 'Ручне введення';
      } else if (attendanceStatus === 'absent') {
        amount = 0;
        notes = 'Відсутній (робочий день)';
      }

      upsertJournalEntry.mutate({
        staff_id: editingCell.staffId,
        activity_id: editingCell.activityId,
        date: editingCell.date,
        amount,
        base_amount: rateValue,
        hours_worked: null,
        deductions_applied: [],
        is_manual_override: true,
        notes,
        bonus: bonus ? parseFloat(bonus) : null,
        bonus_notes: bonusNotes || null,
      });

      setEditingCell(null);
      setManualValue('');
      setPerWorkingDayState({
        attendanceStatus: null,
        manualAmount: '',
        bonus: '',
        bonusNotes: '',
      });
    } else if (rateType === 'hourly') {
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

      // Якщо години = 0, зберігаємо запис з 0 годин (явна відмітка про відсутність)
      const amount = hours * rateValue; // Буде 0, якщо hours = 0

      upsertJournalEntry.mutate({
        staff_id: editingCell.staffId,
        activity_id: editingCell.activityId,
        date: editingCell.date,
        amount,
        base_amount: rateValue,
        hours_worked: hours,
        deductions_applied: [],
        is_manual_override: true,
        notes: `${hours} год. × ${rateValue} ₴`,
        bonus: null,
        bonus_notes: null,
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
      
      // Якщо занять = 0, зберігаємо запис з 0 занять (явна відмітка про відсутність)
      const amount = sessions * rateValue; // Буде 0, якщо sessions = 0

      upsertJournalEntry.mutate({
        staff_id: editingCell.staffId,
        activity_id: editingCell.activityId,
        date: editingCell.date,
        amount,
        base_amount: rateValue,
        hours_worked: null,
        deductions_applied: [],
        is_manual_override: true,
        notes: sessions === 0 ? '0 зан. (відмітка про відсутність)' : `${sessions} зан. × ${rateValue} ₴`,
        bonus: null,
        bonus_notes: null,
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
        hours_worked: null,
        deductions_applied: [],
        is_manual_override: true,
        notes: null,
        bonus: null,
        bonus_notes: null,
      });

      setEditingCell(null);
      setManualValue('');
    }
  };

  const getAutoCellValue = (staffId: string, date: string): { amount: number; hours: number | null } | null => {
    const entriesForDate = journalEntries.filter(
      entry => entry.staff_id === staffId && entry.date === date && !entry.is_manual_override
    );

    const journalTotal = entriesForDate.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    if (journalTotal > 0) {
      // Суммируем часы из записей, если они есть
      const totalHours = entriesForDate.reduce((sum, entry) => {
        if (entry.hours_worked !== null && entry.hours_worked !== undefined) {
          return sum + entry.hours_worked;
        }
        return sum;
      }, 0);
      
      // Если часы не сохранены, пытаемся вычислить из суммы и ставки
      let calculatedHours: number | null = null;
      if (totalHours === 0) {
        const staffMember = activeStaff.find(s => s.id === staffId);
        if (staffMember) {
          // Пытаемся найти ставку для вычисления часов
          const history = manualRateHistoryMap.get(staffId);
          const currentRate = getStaffManualRateForDate(history, date, null);
          if (currentRate?.manual_rate_type === 'hourly' && currentRate.manual_rate_value > 0) {
            calculatedHours = journalTotal / currentRate.manual_rate_value;
          }
        }
      }
      
      return {
        amount: journalTotal,
        hours: totalHours > 0 ? totalHours : calculatedHours
      };
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

    if (hasCalculations) {
      // Для автоматических записей вычисляем часы из суммы и ставки
      const staffMember = activeStaff.find(s => s.id === staffId);
      let calculatedHours: number | null = null;
      if (staffMember) {
        const history = manualRateHistoryMap.get(staffId);
        const currentRate = getStaffManualRateForDate(history, date, null);
        if (currentRate?.manual_rate_type === 'hourly' && currentRate.manual_rate_value > 0) {
          calculatedHours = calculatedTotal / currentRate.manual_rate_value;
        }
      }
      return {
        amount: calculatedTotal,
        hours: calculatedHours
      };
    }
    return null;
  };

  const getManualCellValue = (staffId: string, activityId: string | null, date: string): { amount: number; hours: number | null } | null => {
    const key = `${staffId}-${activityId || 'null'}-${date}-manual`;
    const journalEntry = journalMap.get(key);
    if (journalEntry && journalEntry.is_manual_override) {
      return {
        amount: journalEntry.amount,
        hours: journalEntry.hours_worked ?? null
      };
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
          isWeekendDay && WEEKEND_BG_COLOR
        )}
      >
        <Popover open={isEditing} onOpenChange={(open) => !open && setEditingCell(null)}>
          <PopoverTrigger asChild>
            <button
              onClick={() => handleCellClick(staffId, activityId, dateStr)}
              className={cn(
                "w-full h-8 text-xs rounded hover:bg-muted transition-colors flex flex-col items-center justify-center",
                cellValue !== null ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
              )}
            >
              {cellValue !== null ? (
                <>
                  <div>{formatCurrency(cellValue.amount, false)}</div>
                  {cellValue.hours !== null && (
                    <div className="text-[10px] text-muted-foreground/80">
                      {cellValue.hours.toFixed(1)} год.
                    </div>
                  )}
                </>
              ) : '—'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="space-y-3">
              {/* Заголовок с ФИО и датой */}
              {(() => {
                const staffMember = activeStaff.find(s => s.id === staffId);
                const staffName = staffMember?.full_name || 'Невідомий співробітник';
                const formattedDate = formatDate(dateStr);
                
                return (
                  <div className="pb-2 border-b">
                    <h3 className="text-sm font-semibold">Нарахування для {staffName}</h3>
                    <p className="text-xs text-muted-foreground mt-1">на {formattedDate}</p>
                  </div>
                );
              })()}
              
              {(() => {
                const history = manualRateHistoryMap.get(staffId);
                const currentRate = editingCell
                  ? getStaffManualRateForDate(history, editingCell.date, editingCell.activityId || null)
                  : null;
                const rateType = currentRate?.manual_rate_type || null;
                const rateValue = currentRate?.manual_rate_value || 0;

                let manualPopupContent = null;
                if (rateType === 'per_working_day') {
                  manualPopupContent = (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id={`present-${editingCell?.date}`}
                            name={`attendance-${editingCell?.date}`}
                            checked={perWorkingDayState.attendanceStatus === 'present'}
                            onChange={() => setPerWorkingDayState({
                              ...perWorkingDayState,
                              attendanceStatus: 'present',
                              manualAmount: '',
                            })}
                            className="h-4 w-4"
                          />
                          <label htmlFor={`present-${editingCell?.date}`} className="text-sm">
                            Присутній
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id={`absent-${editingCell?.date}`}
                            name={`attendance-${editingCell?.date}`}
                            checked={perWorkingDayState.attendanceStatus === 'absent'}
                            onChange={() => setPerWorkingDayState({
                              ...perWorkingDayState,
                              attendanceStatus: 'absent',
                              manualAmount: '',
                            })}
                            className="h-4 w-4"
                          />
                          <label htmlFor={`absent-${editingCell?.date}`} className="text-sm">
                            Відсутній
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id={`manual-${editingCell?.date}`}
                            name={`attendance-${editingCell?.date}`}
                            checked={perWorkingDayState.attendanceStatus === 'manual'}
                            onChange={() => setPerWorkingDayState({
                              ...perWorkingDayState,
                              attendanceStatus: 'manual',
                            })}
                            className="h-4 w-4"
                          />
                          <label htmlFor={`manual-${editingCell?.date}`} className="text-sm">
                            Ручне введення
                          </label>
                        </div>
                      </div>
                      {perWorkingDayState.attendanceStatus === 'manual' && (
                        <div>
                          <label className="text-sm font-medium">Сума (₴)</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={perWorkingDayState.manualAmount}
                            onChange={(e) => setPerWorkingDayState({
                              ...perWorkingDayState,
                              manualAmount: e.target.value,
                            })}
                            placeholder="0"
                            className="mt-1"
                          />
                        </div>
                      )}
                      <div>
                        <label className="text-sm font-medium">Бонус (₴)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={perWorkingDayState.bonus}
                          onChange={(e) => setPerWorkingDayState({
                            ...perWorkingDayState,
                            bonus: e.target.value,
                          })}
                          placeholder="0"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Примітка для бонусу</label>
                        <Textarea
                          value={perWorkingDayState.bonusNotes}
                          onChange={(e) => setPerWorkingDayState({
                            ...perWorkingDayState,
                            bonusNotes: e.target.value,
                          })}
                          placeholder="Примітка..."
                          rows={2}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            // Логика сохранения аналогична StaffDetail
                            // Здесь можно вызвать отдельную функцию сохранения
                            handleSaveManualEntry();
                          }}
                          className="flex-1"
                          disabled={perWorkingDayState.attendanceStatus === null || (perWorkingDayState.attendanceStatus === 'manual' && (!perWorkingDayState.manualAmount || isNaN(parseFloat(perWorkingDayState.manualAmount))))}
                        >
                          Зберегти
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingCell(null);
                            setManualValue('');
                            setPerWorkingDayState({
                              attendanceStatus: null,
                              manualAmount: '',
                              bonus: '',
                              bonusNotes: '',
                            });
                          }}
                        >
                          Скасувати
                        </Button>
                      </div>
                    </>
                  );
                } else if (rateType === 'hourly') {
                  manualPopupContent = (
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
                            Нарахування: {formatCurrency(parseFloat(manualValue) * rateValue, false)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveManualEntry}
                          className="flex-1"
                          disabled={manualValue === '' || manualValue === null || isNaN(parseFloat(manualValue)) || parseFloat(manualValue) < 0}
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
                } else if (rateType === 'per_session') {
                  manualPopupContent = (
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
                          Ставка: {formatCurrency(rateValue, false)} / заняття
                        </p>
                        {manualValue && !isNaN(parseFloat(manualValue)) && (
                          <p className="text-xs font-medium text-primary mt-1">
                            Нарахування: {formatCurrency(parseFloat(manualValue) * rateValue, false)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveManualEntry}
                          className="flex-1"
                          disabled={manualValue === '' || manualValue === null || isNaN(parseFloat(manualValue)) || parseFloat(manualValue) < 0}
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
                  manualPopupContent = (
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
                return manualPopupContent;
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
        <div className="mb-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Журнали витрат по активностях</div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setAddExpenseJournalDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              журнал витрат
            </Button>
          </div>
          {expenseActivities.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {expenseActivities.map((activity) => (
                <Button key={activity.id} variant="outline" size="sm" asChild>
                  <Link to={`/activities/${activity.id}/expenses`}>{activity.name}</Link>
                </Button>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Немає журналів витрат</div>
          )}
        </div>
        <AddExpenseJournalDialog
          open={addExpenseJournalDialogOpen}
          onOpenChange={setAddExpenseJournalDialogOpen}
        />
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

        {/* Staff filter */}
        <div className="mb-4">
          <Combobox
            options={[
              { value: 'all', label: 'Всі співробітники' },
              ...activeStaff.map((staffMember) => ({
                value: staffMember.id,
                label: staffMember.full_name,
              })),
            ]}
            value={selectedStaffId}
            onValueChange={setSelectedStaffId}
            placeholder="Фільтр по персоналу"
            searchPlaceholder="Пошук співробітника..."
            emptyText="Співробітників не знайдено"
            className="w-full md:w-[250px]"
          />
        </div>

        {/* Row type filter */}
        <div className="mb-4 flex flex-wrap gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium">Фільтр рядків:</span>
            <div className="flex gap-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={rowTypeFilter.includes('auto')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setRowTypeFilter(prev => [...prev, 'auto']);
                    } else {
                      setRowTypeFilter(prev => prev.filter(type => type !== 'auto'));
                    }
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">Авто нарахування</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={rowTypeFilter.includes('manual')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setRowTypeFilter(prev => [...prev, 'manual']);
                    } else {
                      setRowTypeFilter(prev => prev.filter(type => type !== 'manual'));
                    }
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">Ручні нарахування</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={rowTypeFilter.includes('payouts')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setRowTypeFilter(prev => [...prev, 'payouts']);
                    } else {
                      setRowTypeFilter(prev => prev.filter(type => type !== 'payouts'));
                    }
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">Виплати</span>
              </label>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="sticky top-16 z-30 bg-card">
          <div ref={headerScrollRef} className="overflow-x-auto border rounded-xl border-b-0">
            <table className={periodFilter === 'month' ? 'w-full border-collapse' : 'border-collapse'} style={periodFilter !== 'month' ? { width: 'auto' } : undefined}>
              {tableColGroup}
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 z-20 bg-muted/50 px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Персонал
                  </th>
                  {days.map((day) => (
                    <th
                      key={formatDateString(day)}
                      className={cn(
                        "px-1 py-2 text-center text-xs font-medium",
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
              </thead>
            </table>
          </div>
        </div>
        <div ref={bodyScrollRef} className="overflow-x-auto border rounded-xl border-t-0">
          <table className={periodFilter === 'month' ? 'w-full border-collapse' : 'border-collapse'} style={periodFilter !== 'month' ? { width: 'auto' } : undefined}>
            {tableColGroup}
            <tbody>
              {filteredStaff.map((staffMember) => {
                // Get activities from pre-computed map (no hooks here!)
                const staffActivities = staffActivitiesMap.get(staffMember.id) || [];
                // Only show "Авто нарахування" row if staff has automatic billing rules
                const hasAutoRates = staffHasAutoRates.has(staffMember.id);

                return (
                  <React.Fragment key={staffMember.id}>
                    {/* Staff row with all activities combined - only if has automatic rates */}
                    {hasAutoRates && rowTypeFilter.includes('auto') && (
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
                        
                        // Проверяем, является ли ставка почасовой
                        const history = manualRateHistoryMap.get(staffMember.id);
                        const currentRate = getStaffManualRateForDate(history, dateStr, null);
                        const isHourly = currentRate?.manual_rate_type === 'hourly';

                        return (
                          <td
                            key={dateStr}
                            className={cn(
                              "p-0.5 text-center",
                              isWeekend(day) && WEEKEND_BG_COLOR
                            )}
                          >
                            <div className={cn(
                              "w-full h-8 text-xs rounded flex flex-col items-center justify-center",
                              cellValue !== null ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                            )}>
                              {cellValue !== null ? (
                                <>
                                  <div>{formatCurrency(cellValue.amount, false)}</div>
                                  {isHourly && cellValue.hours !== null && (
                                    <div className="text-[10px] text-muted-foreground/80">
                                      {cellValue.hours.toFixed(1)} год.
                                    </div>
                                  )}
                                </>
                              ) : '—'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    )}
                    {rowTypeFilter.includes('manual') && (manualActivitiesByStaff.get(staffMember.id) || []).map((manualActivity) => (
                      <tr key={`${staffMember.id}-${manualActivity.activityId || 'null'}`} className="border-t bg-muted/10">
                        <td className="sticky left-0 z-10 bg-card/95 px-4 py-2 text-sm text-muted-foreground">
                          <Link to={`/staff/${staffMember.id}`} className="text-primary hover:underline">
                            {staffMember.full_name}
                          </Link>
                          {' — '}
                          {manualActivity.name}
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
                    {rowTypeFilter.includes('payouts') && (
                      <tr className="border-t bg-muted/20">
                        <td className="sticky left-0 z-10 bg-card/95 px-4 py-2 text-sm text-muted-foreground">
                          <Link to={`/staff/${staffMember.id}`} className="text-primary hover:underline">
                            {staffMember.full_name}
                          </Link>
                          {' — Виплати'}
                        </td>
                        {days.map((day) => {
                          const dateStr = formatDateString(day);
                          const amount = payoutMap.get(`${staffMember.id}-${dateStr}`) || 0;
                          return (
                            <td
                              key={dateStr}
                              className={cn(
                                "p-0.5 text-center text-red-600 font-medium",
                                isWeekend(day) && WEEKEND_BG_COLOR
                              )}
                            >
                              <button
                                type="button"
                                className={cn(
                                  "w-full h-8 rounded transition-colors",
                                  amount > 0
                                    ? "underline decoration-dotted underline-offset-2 hover:text-red-700"
                                    : "text-muted-foreground hover:bg-muted"
                                )}
                                title={amount > 0 ? "Редагувати виплати за дату" : "Додати виплату за дату"}
                                onClick={() => openPayoutDialogForCell(staffMember.id, dateStr)}
                              >
                                {amount > 0 ? formatCurrency(amount, false) : '—'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    )}
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
      <PayrollPayoutDialog
        open={payoutDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setPayoutDialogOpen(true);
          } else {
            closePayoutDialog();
          }
        }}
        onSubmit={(event?: any) => {
          event?.preventDefault?.();
          void handlePayoutSubmit();
        }}
        register={(field: string) => {
          if (field === 'amount') return { value: payoutAmount, onChange: (e: any) => setPayoutAmount(e.target.value) };
          if (field === 'payout_date') return { value: payoutDate, onChange: (e: any) => setPayoutDate(e.target.value) };
          if (field === 'notes') return { value: payoutNotes, onChange: (e: any) => setPayoutNotes(e.target.value) };
          if (field === 'commission') return { value: payoutCommission, onChange: (e: any) => setPayoutCommission(e.target.value) };
          return {};
        }}
        errors={payoutErrors}
        watch={(field: string) => {
          if (field === 'account_id') return payoutAccountId;
          return '';
        }}
        setValue={(field: string, value: string) => {
          if (field === 'account_id') setPayoutAccountId(value);
        }}
        accounts={accounts}
        onCancel={closePayoutDialog}
        isSaving={createPayout.isPending || updatePayout.isPending || syncCommission.isPending}
        payoutsForSelectedDate={payoutDialogRows}
        salaryTxByPayoutId={salaryTxByPayoutId}
        commissionsMap={commissionsMap}
        formatCurrency={formatCurrency}
        onEditPayout={(payout, commissionAmount) => {
          setEditingPayoutId(payout.id);
          setPayoutAmount((payout.amount || 0).toString());
          setPayoutDate(payout.payout_date);
          setPayoutNotes(payout.notes || '');
          setPayoutAccountId(payout.account_id || '');
          setPayoutCommission((commissionAmount || 0).toString());
          const meta = salaryTxMetaByPayoutId.get(payout.id);
          setPayoutCategoryId(meta?.expense_category_id || 'none');
        }}
        onDeletePayout={async (payout) => {
          const note = window.prompt('Причина видалення (обовʼязково):', '');
          if (!note || !note.trim()) return;
          await deletePayout.mutateAsync({
            id: payout.id,
            staffId: payout.staff_id || '',
            deleteNote: note.trim(),
          });
        }}
        staffOptions={activeStaff.map((s) => ({ id: s.id, name: s.full_name }))}
        staffFieldValue={selectedPayoutStaffId}
        onStaffFieldChange={setSelectedPayoutStaffId}
        staffFieldDisabled={false}
        subcategoryOptions={salaryExpenseCategories.map((c) => ({ id: c.id, name: c.name }))}
        subcategoryFieldValue={payoutCategoryId}
        onSubcategoryFieldChange={setPayoutCategoryId}
      />
    </>
  );
}
