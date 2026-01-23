import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  ATTENDANCE_LABELS, 
  ATTENDANCE_FULL_LABELS, 
  ATTENDANCE_COLORS,
  ATTENDANCE_COEFFICIENTS,
  calculateChargedAmount,
  formatCurrency,
  WEEKEND_BG_COLOR,
  type AttendanceStatus 
} from '@/lib/attendance';
import { X } from 'lucide-react';

interface AttendanceCellProps {
  status: AttendanceStatus | null;
  amount: number;
  isWeekend: boolean;
  onChange: (status: AttendanceStatus | null) => void;
  activityPrice: number;
  customPrice: number | null;
  discountPercent: number;
}

const statuses: AttendanceStatus[] = ['present', 'sick', 'absent', 'vacation'];

export function AttendanceCell({ 
  status, 
  amount, 
  isWeekend, 
  onChange,
  activityPrice,
  customPrice,
  discountPercent
}: AttendanceCellProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (newStatus: AttendanceStatus | null) => {
    onChange(newStatus);
    setOpen(false);
  };

  const basePrice = customPrice ?? activityPrice;
  const priceWithDiscount = basePrice * (1 - discountPercent / 100);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'w-9 h-9 rounded-md text-xs font-semibold transition-all hover:scale-105',
            isWeekend && !status && WEEKEND_BG_COLOR,
            !status && !isWeekend && 'bg-muted hover:bg-muted/80',
            status && ATTENDANCE_COLORS[status],
            status && 'text-white shadow-sm'
          )}
        >
          {status ? ATTENDANCE_LABELS[status] : ''}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="center">
        <div className="space-y-3">
          <p className="text-sm font-medium text-center">Виберіть статус</p>
          
          <div className="grid grid-cols-2 gap-2">
            {statuses.map((s) => {
              const coefficient = ATTENDANCE_COEFFICIENTS[s];
              const calculatedAmount = calculateChargedAmount(activityPrice, customPrice, discountPercent, s);
              
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
                  <span className="text-xs mt-1">
                    {coefficient * 100}% = {formatCurrency(calculatedAmount)}
                  </span>
                </Button>
              );
            })}
          </div>

          {status && (
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

          {status && (
            <div className="pt-2 border-t text-center">
              <p className="text-xs text-muted-foreground">Нараховано:</p>
              <p className="font-semibold text-foreground">{formatCurrency(amount)}</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
