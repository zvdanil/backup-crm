import type { StaffBillingRule } from '@/hooks/useStaffBilling';

export interface AttendanceRecord {
  date: string;
  enrollment_id: string;
  student_id: string;
  student_name?: string | null;
  status: 'present' | 'sick' | 'absent' | 'vacation' | null;
  value?: number | null;
}

export interface DailyAccrual {
  amount: number;
  notes: string[];
}

type RuleForDate = (date: string) => StaffBillingRule | null;

const formatMonthLabel = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('uk-UA', { month: 'long' });
};

const normalizeValue = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return value;
};

const addAccrual = (
  map: Map<string, Map<string, DailyAccrual>>,
  staffId: string,
  date: string,
  amount: number,
  notes: string[]
) => {
  if (!map.has(staffId)) {
    map.set(staffId, new Map());
  }
  const staffMap = map.get(staffId)!;
  const existing = staffMap.get(date);
  if (existing) {
    existing.amount += amount;
    existing.notes.push(...notes);
  } else {
    staffMap.set(date, { amount, notes: [...notes] });
  }
};

export function calculateMonthlyStaffAccruals(params: {
  attendanceRecords: AttendanceRecord[];
  getRuleForDate: RuleForDate;
}): Map<string, Map<string, DailyAccrual>> {
  const { attendanceRecords, getRuleForDate } = params;

  const presentRecords = attendanceRecords.filter((record) => record.status === 'present');
  const recordsByDate = new Map<string, AttendanceRecord[]>();
  presentRecords.forEach((record) => {
    const list = recordsByDate.get(record.date) || [];
    list.push(record);
    recordsByDate.set(record.date, list);
  });

  const sortedDates = Array.from(recordsByDate.keys()).sort();
  const accruals = new Map<string, Map<string, DailyAccrual>>();

  // Fixed: once per month on first present day where rule is fixed
  for (const date of sortedDates) {
    const rule = getRuleForDate(date);
    if (rule && rule.rate_type === 'fixed') {
      addAccrual(
        accruals,
        rule.staff_id,
        date,
        normalizeValue(rule.rate),
        [`Фікс: ${formatMonthLabel(date)}`]
      );
      break;
    }
  }

  // Per-session / Per-student / Percent
  for (const date of sortedDates) {
    const rule = getRuleForDate(date);
    if (!rule) continue;

    const dayRecords = recordsByDate.get(date) || [];
    const count = dayRecords.length;
    if (count === 0) continue;

    if (rule.rate_type === 'per_session') {
      addAccrual(accruals, rule.staff_id, date, normalizeValue(rule.rate), [
        `За заняття: ${count} учн.`,
      ]);
    }

    if (rule.rate_type === 'per_student') {
      addAccrual(accruals, rule.staff_id, date, normalizeValue(rule.rate) * count, [
        `За учня: ${count} відм.`,
      ]);
    }

    if (rule.rate_type === 'percent') {
      const baseSum = dayRecords.reduce((sum, record) => sum + normalizeValue(record.value), 0);
      const amount = (normalizeValue(rule.rate) / 100) * baseSum;
      addAccrual(accruals, rule.staff_id, date, amount, [
        `Відсоток: ${rule.rate}% від ${baseSum.toFixed(2)}`,
      ]);
    }
  }

  // Subscription (per student monthly)
  const subscriptionState = new Map<
    string,
    { count: number; minCharged: boolean; thresholdCharged: boolean }
  >();

  for (const date of sortedDates) {
    const rule = getRuleForDate(date);
    if (!rule || rule.rate_type !== 'subscription') continue;

    const dayRecords = recordsByDate.get(date) || [];
    const lessonLimit = normalizeValue(rule.lesson_limit);
    const penaltyPercent = normalizeValue(rule.penalty_percent);
    const triggerPercent = normalizeValue(rule.penalty_trigger_percent);
    const extraLessonRate = normalizeValue(rule.extra_lesson_rate);

    const threshold = lessonLimit > 0 ? Math.ceil(lessonLimit * (triggerPercent / 100)) : 0;
    const minAmount = Math.max(0, normalizeValue(rule.rate) * (1 - penaltyPercent / 100));
    const remainingAmount = Math.max(0, normalizeValue(rule.rate) - minAmount);

    dayRecords.forEach((record) => {
      const key = `${rule.staff_id}:${rule.id}:${record.student_id}`;
      const state = subscriptionState.get(key) || {
        count: 0,
        minCharged: false,
        thresholdCharged: false,
      };

      state.count += 1;
      const notes: string[] = [];
      let amount = 0;

      if (!state.minCharged) {
        amount += minAmount;
        state.minCharged = true;
        notes.push(`Абонемент (${record.student_name || 'учень'}): 1-ше заняття (мінімум)`);
      }

      if (!state.thresholdCharged && threshold > 0 && state.count >= threshold) {
        amount += remainingAmount;
        state.thresholdCharged = true;
        notes.push(`Донарахування (${record.student_name || 'учень'}): поріг пройдено`);
      }

      if (lessonLimit > 0 && state.count > lessonLimit && extraLessonRate > 0) {
        amount += extraLessonRate;
        notes.push(`Абонемент (${record.student_name || 'учень'}): понад ліміт`);
      }

      if (amount > 0) {
        addAccrual(accruals, rule.staff_id, date, amount, notes);
      }

      subscriptionState.set(key, state);
    });
  }

  return accruals;
}
