/**
 * Attendance Status Types
 * Базовые статусы (фиксированные)
 */
export type BaseAttendanceStatus = 'present' | 'sick' | 'absent' | 'vacation';

/**
 * Расширенный тип статуса: базовые или UUID кастомных статусов
 */
export type AttendanceStatus = BaseAttendanceStatus | string; // string = UUID кастомного статуса

/**
 * Attendance Status Labels (short) - только для базовых статусов
 */
export const ATTENDANCE_LABELS: Record<BaseAttendanceStatus, string> = {
  present: 'П',
  sick: 'Х',
  absent: 'Н',
  vacation: 'О',
};

/**
 * Attendance Status Full Labels - только для базовых статусов
 */
export const ATTENDANCE_FULL_LABELS: Record<BaseAttendanceStatus, string> = {
  present: 'Присутні',
  sick: 'Хворі',
  absent: 'Пропуски',
  vacation: 'Відпустка',
};

/**
 * Attendance Status Colors (Tailwind CSS classes) - только для базовых статусов
 */
export const ATTENDANCE_COLORS: Record<BaseAttendanceStatus, string> = {
  present: 'bg-green-500 hover:bg-green-600',
  sick: 'bg-yellow-500 hover:bg-yellow-600',
  absent: 'bg-red-500 hover:bg-red-600',
  vacation: 'bg-blue-500 hover:bg-blue-600',
};

/**
 * Получить метку статуса (короткую)
 */
export function getAttendanceLabel(
  status: AttendanceStatus | null,
  customStatuses?: Array<{ id: string; name: string }>
): string {
  if (!status) return '';
  
  // Проверяем базовые статусы
  if (status in ATTENDANCE_LABELS) {
    return ATTENDANCE_LABELS[status as BaseAttendanceStatus];
  }
  
  // Ищем кастомный статус
  if (customStatuses) {
    const customStatus = customStatuses.find(cs => cs.id === status);
    if (customStatus) {
      // Возвращаем первые 2 символа названия или первые 3 буквы
      return customStatus.name.length > 2 
        ? customStatus.name.substring(0, 2).toUpperCase()
        : customStatus.name.toUpperCase();
    }
  }
  
  return '';
}

/**
 * Получить полное название статуса
 */
export function getAttendanceFullLabel(
  status: AttendanceStatus | null,
  customStatuses?: Array<{ id: string; name: string }>
): string {
  if (!status) return '';
  
  // Проверяем базовые статусы
  if (status in ATTENDANCE_FULL_LABELS) {
    return ATTENDANCE_FULL_LABELS[status as BaseAttendanceStatus];
  }
  
  // Ищем кастомный статус
  if (customStatuses) {
    const customStatus = customStatuses.find(cs => cs.id === status);
    if (customStatus) {
      return customStatus.name;
    }
  }
  
  return '';
}

/**
 * Получить цвет статуса (CSS класс для базовых, hex для кастомных)
 */
export function getAttendanceColor(
  status: AttendanceStatus | null,
  customStatuses?: Array<{ id: string; color: string }>
): string {
  if (!status) return '';
  
  // Проверяем базовые статусы
  if (status in ATTENDANCE_COLORS) {
    return ATTENDANCE_COLORS[status as BaseAttendanceStatus];
  }
  
  // Ищем кастомный статус
  if (customStatuses) {
    const customStatus = customStatuses.find(cs => cs.id === status);
    if (customStatus) {
      // Возвращаем hex цвет, который будет использоваться как inline style
      return customStatus.color;
    }
  }
  
  return '';
}

/**
 * Проверить, является ли статус базовым
 */
export function isBaseAttendanceStatus(status: AttendanceStatus | null): status is BaseAttendanceStatus {
  if (!status) return false;
  return status in ATTENDANCE_LABELS;
}

/**
 * Вычислить яркость цвета (для определения контрастности)
 * @param hexColor - Hex цвет (например, "#FF5733")
 * @returns Яркость от 0 до 255
 */
export function getColorBrightness(hexColor: string): number {
  // Удаляем # если есть
  const hex = hexColor.replace('#', '');
  
  // Конвертируем в RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Вычисляем яркость по формуле
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Получить контрастный цвет для обводки точки примечания
 * @param backgroundColor - Hex цвет фона
 * @returns Цвет обводки (#FFFFFF для темных, #000000 для светлых)
 */
export function getContrastColor(backgroundColor: string): string {
  const brightness = getColorBrightness(backgroundColor);
  return brightness < 128 ? '#FFFFFF' : '#000000';
}

/**
 * Weekend background color (Tailwind CSS classes)
 * Used for highlighting weekend days in all journals
 */
export const WEEKEND_BG_COLOR = 'bg-yellow-200/70 dark:bg-yellow-700/20';

/**
 * Period filter types for journal views
 */
export type PeriodFilter = 'day' | 'week' | 'month';

/**
 * Filter days array based on selected period
 * @param days - Array of all days in the month
 * @param period - Selected period: 'day' (today), 'week' (current week), 'month' (all days)
 * @param currentDate - Optional current date (defaults to today)
 * @returns Filtered array of days
 */
export function filterDaysByPeriod(
  days: Date[],
  period: PeriodFilter,
  currentDate: Date = new Date()
): Date[] {
  if (period === 'month') {
    return days;
  }

  if (period === 'day') {
    const todayStr = formatDateString(currentDate);
    return days.filter(day => formatDateString(day) === todayStr);
  }

  if (period === 'week') {
    // Get current week: Monday to Sunday
    const currentDay = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay; // Adjust to get Monday
    const monday = new Date(currentDate);
    monday.setDate(currentDate.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return days.filter(day => {
      const dayTime = day.getTime();
      return dayTime >= monday.getTime() && dayTime <= sunday.getTime();
    });
  }

  return days;
}

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

  // Сначала проверяем базовые статусы
  let rule = billingRules[status];
  
  // Если не найден базовый статус, ищем в кастомных статусах
  if (!rule && billingRules.custom_statuses && Array.isArray(billingRules.custom_statuses)) {
    const customStatus = billingRules.custom_statuses.find(
      (cs: any) => cs.id === status && cs.is_active !== false
    );
    if (customStatus) {
      // Преобразуем кастомный статус в формат BillingRule
      rule = {
        rate: customStatus.rate,
        type: customStatus.type,
      };
    }
  }
  
  // Проверяем наличие правила и rate (rate может быть отрицательным для кастомных статусов)
  if (!rule || rule.rate === null || rule.rate === undefined) {
    return null;
  }
  
  // Для базовых статусов проверяем, что rate > 0 (для обратной совместимости)
  // Для кастомных статусов rate может быть отрицательным
  const isBaseStatus = isBaseAttendanceStatus(status);
  if (isBaseStatus && rule.rate <= 0) {
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
