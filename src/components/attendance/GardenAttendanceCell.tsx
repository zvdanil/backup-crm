import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/attendance';
import type { AttendanceStatus } from '@/lib/attendance';

interface GardenAttendanceCellProps {
  status: AttendanceStatus | null;
  amount: number | null;
  value: number | null;
  isWeekend: boolean;
  onChange: (status: AttendanceStatus | null, value: number | null) => void;
  isReadOnly?: boolean;
}

export function GardenAttendanceCell({
  status,
  amount,
  value: _value,
  isWeekend,
  onChange,
  isReadOnly = false,
}: GardenAttendanceCellProps) {
  const handleStatusClick = (newStatus: 'present' | 'absent' | null) => {
    if (isReadOnly) return;
    if (newStatus === null) {
      onChange(null, null);
    } else {
      onChange(newStatus, null);
    }
  };

  const hasValue = status !== null;

  return (
    <div className="relative group">
      <div className="flex gap-0.5">
        {/* Кнопки статусов */}
        <Button
          type="button"
          variant={status === 'present' ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-6 w-6 p-0 text-[10px] font-semibold',
            status === 'present' && 'bg-green-500 hover:bg-green-600 text-white',
            !status && 'hover:bg-green-100',
            isWeekend && !status && 'bg-muted/50',
            isReadOnly && 'opacity-50 cursor-not-allowed'
          )}
          onClick={() => handleStatusClick(status === 'present' ? null : 'present')}
          disabled={isReadOnly}
        >
          П
        </Button>
        <Button
          type="button"
          variant={status === 'absent' ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-6 w-6 p-0 text-[10px] font-semibold',
            status === 'absent' && 'bg-red-500 hover:bg-red-600 text-white',
            !status && 'hover:bg-red-100',
            isWeekend && !status && 'bg-muted/50',
            isReadOnly && 'opacity-50 cursor-not-allowed'
          )}
          onClick={() => handleStatusClick(status === 'absent' ? null : 'absent')}
          disabled={isReadOnly}
        >
          О
        </Button>
      </div>
      {/* Показываем сумму при наведении */}
      {hasValue && amount !== null && amount !== undefined && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover border rounded shadow-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          {formatCurrency(amount)}
        </div>
      )}
    </div>
  );
}
