/**
 * Attendance Status Types
 */
export type AttendanceStatus = 'present' | 'sick' | 'absent' | 'vacation';

/**
 * Attendance Status Labels (short)
 */
export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'П',
  sick: 'Х',
  absent: 'Н',
  vacation: 'О',
};

/**
 * Attendance Status Full Labels
 */
export const ATTENDANCE_FULL_LABELS: Record<AttendanceStatus, string> = {
  present: 'Присутні',
  sick: 'Хворі',
  absent: 'Пропуски',
  vacation: 'Відпустка',
};

/**
 * Attendance Status Colors (Tailwind CSS classes)
 */
export const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-green-500 hover:bg-green-600',
  sick: 'bg-yellow-500 hover:bg-yellow-600',
  absent: 'bg-red-500 hover:bg-red-600',
  vacation: 'bg-blue-500 hover:bg-blue-600',
};

/**
 * Weekend background color (Tailwind CSS classes)
 * Used for highlighting weekend days in all journals
 */
export const WEEKEND_BG_COLOR = 'bg-yellow-200/70 dark:bg-yellow-700/20';

/**
 * Format currency in Ukrainian hryvnia
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' ₴';
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Get days in month
 */
export function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  
  return days;
}

/**
 * Format short date (day only)
 */
export function formatShortDate(date: Date): string {
  return date.getDate().toString();
}

/**
 * Get weekday name short
 */
export function getWeekdayShort(date: Date): string {
  return date.toLocaleDateString('uk-UA', { weekday: 'short' });
}

/**
 * Check if date is weekend
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Format date as YYYY-MM-DD string (local date, not UTC)
 */
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get working days count in a month (Monday-Friday)
 */
export function getWorkingDaysInMonth(year: number, month: number): number {
  const days = getDaysInMonth(year, month);
  return days.filter(day => !isWeekend(day)).length;
}

/**
 * Calculate value based on billing rules
 * Priority: 1. custom_price (fixed) > 2. billing_rules based on status
 */
export function calculateValueFromBillingRules(
  date: string,
  status: AttendanceStatus | null,
  valueInput: number | null,
  customPrice: number | null,
  discountPercent: number,
  billingRules: any | null | undefined
): number | null {
  // Priority 1: If custom_price is set, use it as fixed (allow 0)
  if (customPrice !== null && customPrice !== undefined) {
    const discountMultiplier = 1 - (discountPercent / 100);
    return Math.round(customPrice * discountMultiplier * 100) / 100;
  }

  // Priority 2: Use billing_rules if available
  if (!billingRules || !status) {
    return null;
  }

  const rule = billingRules[status];
  if (!rule || !rule.rate || rule.rate <= 0) {
    return null;
  }

  // Parse date string 'YYYY-MM-DD' as local date to avoid timezone issues
  // Using split to avoid timezone conversion that happens with new Date('YYYY-MM-DD')
  const dateParts = typeof date === 'string' ? date.split('-').map(Number) : null;
  const dateObj = dateParts 
    ? new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
    : new Date(date);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();

  let baseValue: number | null = null;
  switch (rule.type) {
    case 'fixed':
      // Разово: value = rate
      baseValue = rule.rate;
      break;

    case 'subscription':
      // Абонемент: value = rate / [кількість робочих днів у місяці]
      const workingDays = getWorkingDaysInMonth(year, month);
      baseValue = workingDays > 0 ? Math.round((rule.rate / workingDays) * 100) / 100 : 0;
      break;

    case 'hourly':
      // Почасово: value = rate * [число, введене в журналі]
      // Для hourly тип, valueInput повинен бути переданий окремо
      if (valueInput !== null && valueInput > 0) {
        baseValue = Math.round(rule.rate * valueInput * 100) / 100;
      } else {
        baseValue = null;
      }
      break;

    default:
      baseValue = null;
      break;
  }

  if (baseValue === null) return null;

  const discountMultiplier = 1 - (discountPercent / 100);
  return Math.round(baseValue * discountMultiplier * 100) / 100;
}

/**
 * Calculate value for hourly type with value rule
 */
export function calculateHourlyValueFromRule(
  date: string,
  valueInput: number | null,
  customPrice: number | null,
  discountPercent: number,
  billingRules: any | null | undefined
): number | null {
  // Priority 1: If custom_price is set, use it as fixed (allow 0)
  if (customPrice !== null && customPrice !== undefined) {
    const discountMultiplier = 1 - (discountPercent / 100);
    return Math.round(customPrice * discountMultiplier * 100) / 100;
  }

  // Priority 2: Use billing_rules for "value" (hourly/numeric input)
  if (!billingRules || !billingRules.value) {
    return null;
  }

  const rule = billingRules.value;
  if (!rule || !rule.rate || rule.rate <= 0) {
    return null;
  }

  if (rule.type === 'hourly' && valueInput !== null && valueInput > 0) {
    const discountMultiplier = 1 - (discountPercent / 100);
    return Math.round(rule.rate * valueInput * discountMultiplier * 100) / 100;
  }

  if (rule.type === 'fixed') {
    const discountMultiplier = 1 - (discountPercent / 100);
    return Math.round(rule.rate * discountMultiplier * 100) / 100;
  }

  return null;
}
