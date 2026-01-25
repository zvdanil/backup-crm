import { useState, useEffect, useRef } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { 
  formatCurrency,
  calculateValueFromBillingRules,
  getWorkingDaysInMonth,
  WEEKEND_BG_COLOR,
  getAttendanceLabel,
  getAttendanceFullLabel,
  getAttendanceColor,
  isBaseAttendanceStatus,
  getColorBrightness,
  getContrastColor,
  type AttendanceStatus,
  type BaseAttendanceStatus
} from '@/lib/attendance';
import { X } from 'lucide-react';
import type { Activity, ActivityPriceHistory, BillingRules, CustomAttendanceStatus } from '@/hooks/useActivities';
import { getBillingRulesForDate } from '@/hooks/useActivities';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface EnhancedAttendanceCellProps {
  status: AttendanceStatus | null;
  amount: number;
  value: number | null;
  notes: string | null; // Примечание
  isWeekend: boolean;
  onChange: (status: AttendanceStatus | null, value: number | null, notes?: string | null) => void;
  activityPrice: number; // Deprecated: не використовується, залишено для сумісності типів
  customPrice: number | null;
  discountPercent: number;
  date: string; // Дата для розрахунку абонементу
  activity: Activity | null | undefined; // Активність з billing_rules
  priceHistory: ActivityPriceHistory[] | undefined; // Історія цін
  manualValueEdit?: boolean;
}

const baseStatuses: BaseAttendanceStatus[] = ['present', 'sick', 'absent', 'vacation'];

export function EnhancedAttendanceCell({ 
  status, 
  amount, 
  value,
  notes: notesProp,
  isWeekend, 
  onChange,
  activityPrice: _activityPrice, // Deprecated: не використовується
  customPrice,
  discountPercent,
  date,
  activity,
  priceHistory,
  manualValueEdit = false
}: EnhancedAttendanceCellProps) {
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [wasClicked, setWasClicked] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<AttendanceStatus | null>(null);
  const [optimisticValue, setOptimisticValue] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>(notesProp || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const justAutoSetRef = useRef(false);

  // Синхронізуємо inputValue та notes з пропсами
  useEffect(() => {
    if (value !== null && value !== undefined && value !== 0) {
      setInputValue(value.toString());
      // Не встановлюємо isEditing в true при завантаженні, щоб підсвітка працювала
      // isEditing встановлюється тільки коли користувач активно редагує поле
    } else if (status) {
      setInputValue('');
      setIsEditing(false);
    } else {
      setInputValue('');
    }
    if (status || value !== null || value !== undefined) {
      setOptimisticStatus(null);
      setOptimisticValue(null);
    }
    // Синхронизируем notes
    setNotes(notesProp || '');
  }, [value, status, notesProp]);

  const handleSelect = (newStatus: AttendanceStatus | null) => {
    setOptimisticStatus(null);
    setOptimisticValue(null);
    justAutoSetRef.current = false;
    if (newStatus === null) {
      // Якщо видаляємо статус - очищаємо все
      onChange(null, null, notes || null);
      setInputValue('');
      setIsEditing(false);
      setOpen(false);
      setWasClicked(false);
      return;
    }

    // Отримуємо billing_rules для дати (з урахуванням історії)
    const billingRulesForDate = activity && priceHistory 
      ? getBillingRulesForDate(activity, priceHistory, date)
      : activity?.billing_rules;

    // Розраховуємо value на основі billing_rules для статусу
    const calculatedValue = calculateValueFromBillingRules(
      date,
      newStatus,
      null, // Для статусу valueInput не потрібен
      customPrice,
      discountPercent,
      billingRulesForDate || null
    );

    // Передаємо статус, розраховане value та notes
    onChange(newStatus, calculatedValue, notes || null);
    setInputValue('');
    setIsEditing(false);
    setOpen(false);
    setWasClicked(false);
  };

  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes);
    // Обновляем notes при изменении (но не закрываем попап)
    if (status || value !== null) {
      onChange(status, value, newNotes || null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setWasClicked(false);
    setOptimisticStatus(null);
    setOptimisticValue(null);
    justAutoSetRef.current = false;
    
    // Якщо вводимо число - видаляємо статус
    if (newValue !== '') {
      const numValue = parseFloat(newValue);
      if (!isNaN(numValue)) {
        onChange(null, numValue);
        setIsEditing(true);
      } else {
        // Якщо не число - очищаємо
        onChange(null, null);
      }
    } else {
      // Якщо поле порожнє - очищаємо все
      onChange(null, null);
      setIsEditing(true);
    }
  };

  const handleInputBlur = () => {
    if (justAutoSetRef.current) {
      justAutoSetRef.current = false;
      setIsEditing(false);
      setWasClicked(false);
      return;
    }
    if (inputValue === '' && !status) {
      onChange(null, null);
    }
    setIsEditing(false);
    setWasClicked(false);
  };

  const handleInputFocus = () => {
    setIsEditing(true);
    // Якщо поле зі статусом - очищаємо його для вводу числа (якщо користувач починає вводити)
    if (status) {
      // Не очищаємо одразу - чекаємо на введення
      setInputValue('');
    } else if (!value) {
      setInputValue('');
    }
  };

  const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
    // Якщо клікаємо по порожній клітинці - одразу ставимо "Присутній" без поповера
    if (!status && (value === null || value === undefined || value === 0) && inputValue === '') {
      const billingRulesForDate = activity && priceHistory
        ? getBillingRulesForDate(activity, priceHistory, date)
        : activity?.billing_rules;
      const calculatedValue = calculateValueFromBillingRules(
        date,
        'present',
        null,
        customPrice,
        discountPercent,
        billingRulesForDate || null
      );
      justAutoSetRef.current = true;
      setOptimisticStatus('present');
      setOptimisticValue(calculatedValue);
      onChange('present', calculatedValue);
      setWasClicked(false);
      setIsEditing(false);
      return;
    }

    // Якщо клікаємо по клітинці з відміткою - відкриваємо поповер для зміни
    if (status) {
      setOpen(true);
      setWasClicked(false);
      setIsEditing(false);
      return;
    }

    // Для числового вводу залишаємо можливість редагування
    if (!isEditing) {
      setIsEditing(true);
      setWasClicked(true);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
      return;
    }
    // Якщо починаємо вводити - це не клік, зберігаємо як число
    if (e.key !== 'Tab' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Escape') {
      setWasClicked(false);
      setIsEditing(true);
      // Якщо був статус і починаємо вводити - очищаємо статус
      if (status) {
        onChange(null, null);
        setInputValue('');
        // Видаляємо текст статусу для вводу
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
    }
  };

  // Получаем billing_rules для определения кастомных статусов
  const billingRulesForDate = activity && priceHistory 
    ? getBillingRulesForDate(activity, priceHistory, date)
    : activity?.billing_rules;
  const customStatuses = billingRulesForDate?.custom_statuses || [];
  
  // Debug logging для отладки кастомных статусов
  useEffect(() => {
    if (activity) {
      console.log('[EnhancedAttendanceCell] Activity:', {
        id: activity.id,
        name: activity.name,
        billing_rules: activity.billing_rules,
        billing_rules_type: typeof activity.billing_rules,
        billing_rules_stringified: JSON.stringify(activity.billing_rules),
        billing_rules_keys: activity.billing_rules ? Object.keys(activity.billing_rules) : [],
        has_custom_statuses_key: activity.billing_rules && 'custom_statuses' in activity.billing_rules,
        custom_statuses_from_activity: activity.billing_rules?.custom_statuses,
        custom_statuses_from_activity_type: typeof activity.billing_rules?.custom_statuses,
        custom_statuses_from_activity_is_array: Array.isArray(activity.billing_rules?.custom_statuses),
      });
      console.log('[EnhancedAttendanceCell] billingRulesForDate:', billingRulesForDate);
      console.log('[EnhancedAttendanceCell] billingRulesForDate stringified:', JSON.stringify(billingRulesForDate));
      console.log('[EnhancedAttendanceCell] billingRulesForDate keys:', billingRulesForDate ? Object.keys(billingRulesForDate) : []);
      console.log('[EnhancedAttendanceCell] billingRulesForDate has custom_statuses:', billingRulesForDate && 'custom_statuses' in billingRulesForDate);
      console.log('[EnhancedAttendanceCell] customStatuses:', customStatuses);
      console.log('[EnhancedAttendanceCell] customStatuses type:', typeof customStatuses);
      console.log('[EnhancedAttendanceCell] customStatuses is array:', Array.isArray(customStatuses));
      console.log('[EnhancedAttendanceCell] customStatuses length:', customStatuses.length);
      if (billingRulesForDate?.custom_statuses) {
        console.log('[EnhancedAttendanceCell] custom_statuses from billingRulesForDate:', billingRulesForDate.custom_statuses);
        console.log('[EnhancedAttendanceCell] custom_statuses from billingRulesForDate type:', typeof billingRulesForDate.custom_statuses);
        console.log('[EnhancedAttendanceCell] custom_statuses from billingRulesForDate is array:', Array.isArray(billingRulesForDate.custom_statuses));
      } else {
        console.warn('[EnhancedAttendanceCell] billingRulesForDate.custom_statuses is MISSING or undefined');
      }
    }
  }, [activity, billingRulesForDate, customStatuses]);

  // Визначаємо що показувати в полі
  const displayStatus = status || optimisticStatus;
  const displayValue = isEditing 
    ? inputValue 
    : (displayStatus 
      ? getAttendanceLabel(displayStatus, customStatuses)
      : (value !== null && value !== undefined && value !== 0) 
        ? value.toString() 
        : '');

  // Получаем цвет статуса (для базовых - CSS класс, для кастомных - inline style)
  const statusColor = displayStatus ? getAttendanceColor(displayStatus, customStatuses) : '';
  const isBaseStatus = displayStatus ? isBaseAttendanceStatus(displayStatus) : false;
  const hasNotes = notes && notes.trim().length > 0;

  // Функція для отримання підказки ціни для статусу
  const getPriceHint = (statusKey: AttendanceStatus | string): string => {
    // Отримуємо billing_rules для дати (з урахуванням історії)
    const billingRulesForDate = activity && priceHistory 
      ? getBillingRulesForDate(activity, priceHistory, date)
      : activity?.billing_rules;

    // Пріоритет 1: Якщо є custom_price - показуємо його як fixed
    if (customPrice !== null && customPrice !== undefined) {
      const discountMultiplier = 1 - (discountPercent / 100);
      const finalPrice = Math.round(customPrice * discountMultiplier * 100) / 100;
      return formatCurrency(finalPrice);
    }

    // Пріоритет 2: Використовуємо billing_rules
    if (!billingRulesForDate) {
      return '—';
    }

    // Проверяем базовые статусы
    let rule = billingRulesForDate[statusKey as keyof BillingRules] as BillingRule | undefined;
    
    // Если не найден базовый статус, ищем в кастомных
    if (!rule && billingRulesForDate.custom_statuses) {
      const customStatus = billingRulesForDate.custom_statuses.find(
        (cs: CustomAttendanceStatus) => cs.id === statusKey && cs.is_active !== false
      );
      if (customStatus) {
        rule = {
          rate: customStatus.rate,
          type: customStatus.type,
        };
      }
    }

    if (!rule || rule.rate === null || rule.rate === undefined) {
      return '—';
    }

    // Для базовых статусов проверяем rate > 0, для кастомных может быть отрицательным
    const isBase = isBaseAttendanceStatus(statusKey as AttendanceStatus);
    if (isBase && rule.rate <= 0) {
      return '—';
    }

    const discountMultiplier = 1 - (discountPercent / 100);

    // Parse date string 'YYYY-MM-DD' as local date to avoid timezone issues
    const dateParts = date.split('-').map(Number);
    const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();

    switch (rule.type) {
      case 'fixed': {
        // Разово: показуємо повну ставку з урахуванням знижки
        const discounted = Math.round(rule.rate * discountMultiplier * 100) / 100;
        return formatCurrency(discounted);
      }

      case 'subscription': {
        // Абонемент: показуємо ціну за день (ставка / робочі дні)
        const workingDays = getWorkingDaysInMonth(year, month);
        const dailyPrice = workingDays > 0 ? Math.round((rule.rate / workingDays) * 100) / 100 : 0;
        const discounted = Math.round(dailyPrice * discountMultiplier * 100) / 100;
        return `${formatCurrency(discounted)}/день`;
      }

      case 'hourly': {
        // Почасово: показуємо ставку за одиницю (годину) з урахуванням знижки
        const discounted = Math.round(rule.rate * discountMultiplier * 100) / 100;
        return `${formatCurrency(discounted)}/од`;
      }

      default:
        return '—';
    }
  };

  // Функція для отримання розрахованого value для статусу (для передачі в onChange)
  const getCalculatedValueForStatus = (statusKey: AttendanceStatus): number | null => {
    // Отримуємо billing_rules для дати (з урахуванням історії)
    const billingRulesForDate = activity && priceHistory 
      ? getBillingRulesForDate(activity, priceHistory, date)
      : activity?.billing_rules;

    // Розраховуємо value на основі billing_rules
    return calculateValueFromBillingRules(
      date,
      statusKey,
      null,
      customPrice,
      discountPercent,
      billingRulesForDate || null
    );
  };

  const handlePopoverOpenChange = (nextOpen: boolean) => {
    const isEmptyCell = !status && (value === null || value === undefined || value === 0) && inputValue === '';
    if (nextOpen && isEmptyCell) {
      return;
    }
    setOpen(nextOpen);
  };

  // Определяем стили для ячейки
  const cellStyle: React.CSSProperties = {};
  const cellClassName = cn(
    'h-9 w-9 text-center text-xs font-semibold px-1 relative',
    isWeekend && !status && (value === null || value === undefined || value === 0) && WEEKEND_BG_COLOR,
    !status && (value === null || value === undefined || value === 0) && !isWeekend && 'bg-muted hover:bg-muted/80',
    // Для базовых статусов используем CSS классы
    isBaseStatus && statusColor && statusColor,
    // Для кастомных статусов используем inline style
    !isBaseStatus && statusColor && 'text-white shadow-sm',
    status && 'cursor-pointer',
    (value !== null && value !== undefined && value !== 0) && !status && !isEditing && 'bg-primary/10 text-primary border border-primary/20',
    isEditing && !status && (value === null || value === undefined || value === 0) && 'bg-background border-primary',
    !status && (value === null || value === undefined || value === 0) && !isEditing && 'cursor-pointer'
  );

  // Если кастомный статус, применяем цвет через inline style
  if (!isBaseStatus && statusColor) {
    cellStyle.backgroundColor = statusColor;
    cellStyle.color = getColorBrightness(statusColor) < 128 ? '#FFFFFF' : '#000000';
  }

  return (
      <Popover open={open} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            inputMode={isEditing || (value !== null && value !== undefined && value !== 0) ? 'numeric' : 'text'}
            value={displayValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onClick={handleInputClick}
            onKeyDown={handleInputKeyDown}
            placeholder=""
            readOnly={false}
            style={cellStyle}
            className={cellClassName}
          />
          {/* Индикатор примечания */}
          {hasNotes && (
            <div
              className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-black border border-white shadow-sm"
              style={{
                borderColor: statusColor && !isBaseStatus 
                  ? getContrastColor(statusColor)
                  : '#FFFFFF',
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.3)',
              }}
              title={notes}
            />
          )}
        </div>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="center">
          <div className="space-y-3">
            <p className="text-sm font-medium text-center">Виберіть статус</p>
            
          <div className="grid grid-cols-2 gap-2">
            {/* Базовые статусы */}
            {baseStatuses.map((s) => {
              const priceHint = getPriceHint(s);
              const calculatedValue = getCalculatedValueForStatus(s);
              const statusColor = getAttendanceColor(s, customStatuses);
              const isBase = isBaseAttendanceStatus(s);
              
              return (
                <Button
                  key={s}
                  variant={status === s ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSelect(s)}
                  className={cn(
                    'flex flex-col h-auto py-2',
                    isBase && status === s && statusColor,
                    isBase && status === s && 'text-white border-transparent'
                  )}
                  style={
                    !isBase && status === s && statusColor
                      ? {
                          backgroundColor: statusColor,
                          color: getColorBrightness(statusColor) < 128 ? '#FFFFFF' : '#000000',
                          borderColor: 'transparent',
                        }
                      : undefined
                  }
                >
                  <span className="font-semibold">{getAttendanceLabel(s, customStatuses)}</span>
                  <span className="text-xs opacity-80">{getAttendanceFullLabel(s, customStatuses)}</span>
                  <span className="text-xs mt-1 font-medium">
                    {priceHint}
                  </span>
                </Button>
              );
            })}
          </div>

          {/* Кастомные статусы */}
          {customStatuses.filter((cs: CustomAttendanceStatus) => cs.is_active !== false).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">Кастомні статуси</p>
              <div className="grid grid-cols-1 gap-2">
                {customStatuses
                  .filter((cs: CustomAttendanceStatus) => cs.is_active !== false)
                  .map((cs: CustomAttendanceStatus) => {
                    const priceHint = getPriceHint(cs.id);
                    const calculatedValue = getCalculatedValueForStatus(cs.id);
                    const brightness = getColorBrightness(cs.color);
                    
                    return (
                      <Button
                        key={cs.id}
                        variant={status === cs.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleSelect(cs.id)}
                        className={cn(
                          'flex flex-col h-auto py-2',
                          status === cs.id && 'border-transparent'
                        )}
                        style={{
                          backgroundColor: status === cs.id ? cs.color : undefined,
                          color: status === cs.id && brightness < 128 ? '#FFFFFF' : undefined,
                          borderColor: status === cs.id ? 'transparent' : undefined,
                        }}
                      >
                        <span className="font-semibold">{cs.name}</span>
                        <span className="text-xs mt-1 font-medium">
                          {priceHint}
                        </span>
                      </Button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Кнопка "Число" */}
          <Button
            variant={!status && value !== null && value !== undefined && value !== 0 ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              // Якщо вибираємо "Число" - очищаємо статус і дозволяємо ввести число
              onChange(null, null);
              setInputValue('');
              setIsEditing(true);
              setOpen(false);
              // Фокусуємо інпут для введення числа
              setTimeout(() => {
                inputRef.current?.focus();
              }, 100);
            }}
            className={cn(
              'w-full flex flex-col h-auto py-2',
              !status && value !== null && value !== undefined && value !== 0 && 'bg-primary/10 text-primary border-primary/20'
            )}
          >
            <span className="font-semibold">Число</span>
            <span className="text-xs opacity-80">Ввести числове значення</span>
          </Button>

            {(status || (value !== null && value !== undefined && value !== 0)) && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => handleSelect(null)}
              >
                <X className="h-4 w-4 mr-2" />
                Видалити відмітку
              </Button>
            )}

            {status && value !== null && value !== undefined && (
              <div className="pt-2 border-t text-center">
                <p className="text-xs text-muted-foreground">Значення:</p>
                <p className="font-semibold text-foreground">{formatCurrency(value)}</p>
              </div>
            )}

            {/* Поле примечания */}
            <div className="pt-2 border-t space-y-2">
              <Label htmlFor="notes" className="text-xs">Примітка</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => {
                  const newNotes = e.target.value;
                  if (newNotes.length <= 200) {
                    handleNotesChange(newNotes);
                  }
                }}
                placeholder="Додайте примітку до цієї відмітки..."
                rows={3}
                className="text-xs resize-none"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground text-right">
                {notes.length}/200
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
  );
}
