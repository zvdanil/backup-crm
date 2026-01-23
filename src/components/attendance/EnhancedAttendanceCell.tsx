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
  ATTENDANCE_LABELS, 
  ATTENDANCE_FULL_LABELS, 
  ATTENDANCE_COLORS,
  formatCurrency,
  calculateValueFromBillingRules,
  getWorkingDaysInMonth,
  WEEKEND_BG_COLOR,
  type AttendanceStatus 
} from '@/lib/attendance';
import { X } from 'lucide-react';
import type { Activity, ActivityPriceHistory, BillingRules } from '@/hooks/useActivities';
import { getBillingRulesForDate } from '@/hooks/useActivities';

interface EnhancedAttendanceCellProps {
  status: AttendanceStatus | null;
  amount: number;
  value: number | null;
  isWeekend: boolean;
  onChange: (status: AttendanceStatus | null, value: number | null) => void;
  activityPrice: number; // Deprecated: не використовується, залишено для сумісності типів
  customPrice: number | null;
  discountPercent: number;
  date: string; // Дата для розрахунку абонементу
  activity: Activity | null | undefined; // Активність з billing_rules
  priceHistory: ActivityPriceHistory[] | undefined; // Історія цін
  manualValueEdit?: boolean;
}

const statuses: AttendanceStatus[] = ['present', 'sick', 'absent', 'vacation'];

export function EnhancedAttendanceCell({ 
  status, 
  amount, 
  value,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const justAutoSetRef = useRef(false);

  // Синхронізуємо inputValue з пропсами
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
  }, [value, status]);

  const handleSelect = (newStatus: AttendanceStatus | null) => {
    setOptimisticStatus(null);
    setOptimisticValue(null);
    justAutoSetRef.current = false;
    if (newStatus === null) {
      // Якщо видаляємо статус - очищаємо все
      onChange(null, null);
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

    // Передаємо статус та розраховане value
    onChange(newStatus, calculatedValue);
    setInputValue('');
    setIsEditing(false);
    setOpen(false);
    setWasClicked(false);
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

  // Визначаємо що показувати в полі
  const displayStatus = status || optimisticStatus;
  const displayValue = isEditing 
    ? inputValue 
    : (displayStatus 
      ? ATTENDANCE_LABELS[displayStatus] 
      : (value !== null && value !== undefined && value !== 0) 
        ? value.toString() 
        : '');

  // Функція для отримання підказки ціни для статусу
  const getPriceHint = (statusKey: AttendanceStatus): string => {
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
    if (!billingRulesForDate || !billingRulesForDate[statusKey]) {
      return '—';
    }

    const rule = billingRulesForDate[statusKey];
    if (!rule || !rule.rate || rule.rate <= 0) {
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

  return (
      <Popover open={open} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger asChild>
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
            className={cn(
            'h-9 w-9 text-center text-xs font-semibold px-1',
            isWeekend && !status && (value === null || value === undefined || value === 0) && WEEKEND_BG_COLOR,
            !status && (value === null || value === undefined || value === 0) && !isWeekend && 'bg-muted hover:bg-muted/80',
              status && ATTENDANCE_COLORS[status],
            status && 'text-white shadow-sm cursor-pointer',
            (value !== null && value !== undefined && value !== 0) && !status && !isEditing && 'bg-primary/10 text-primary border border-primary/20',
            isEditing && !status && (value === null || value === undefined || value === 0) && 'bg-background border-primary',
            !status && (value === null || value === undefined || value === 0) && !isEditing && 'cursor-pointer'
            )}
        />
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="center">
          <div className="space-y-3">
            <p className="text-sm font-medium text-center">Виберіть статус</p>
            
          <div className="grid grid-cols-2 gap-2">
            {statuses.map((s) => {
              const priceHint = getPriceHint(s);
              const calculatedValue = getCalculatedValueForStatus(s);
              
              return (
                <Button
                  key={s}
                  variant={status === s ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSelect(s)}
                  className={cn(
                    'flex flex-col h-auto py-2',
                    status === s && ATTENDANCE_COLORS[s],
                    status === s && 'text-white border-transparent'
                  )}
                >
                  <span className="font-semibold">{ATTENDANCE_LABELS[s]}</span>
                  <span className="text-xs opacity-80">{ATTENDANCE_FULL_LABELS[s]}</span>
                  <span className="text-xs mt-1 font-medium">
                    {priceHint}
                  </span>
                </Button>
              );
            })}
          </div>

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
          </div>
        </PopoverContent>
      </Popover>
  );
}
