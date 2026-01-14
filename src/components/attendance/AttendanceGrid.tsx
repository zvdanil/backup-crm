import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AttendanceCell } from './AttendanceCell';
import { useEnrollments } from '@/hooks/useEnrollments';
import { useAttendance, useSetAttendance, useDeleteAttendance } from '@/hooks/useAttendance';
import { getDaysInMonth, formatShortDate, getWeekdayShort, isWeekend, calculateChargedAmount, formatDateString } from '@/lib/attendance';
import type { AttendanceStatus } from '@/lib/attendance';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

interface AttendanceGridProps {
  activityId: string;
}

export function AttendanceGrid({ activityId }: AttendanceGridProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data: enrollments = [], isLoading: enrollmentsLoading } = useEnrollments({ 
    activityId, 
    activeOnly: true 
  });
  const { data: attendanceData = [], isLoading: attendanceLoading } = useAttendance({ 
    activityId, 
    month, 
    year 
  });
  const setAttendance = useSetAttendance();
  const deleteAttendance = useDeleteAttendance();

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const attendanceMap = useMemo(() => {
    const map = new Map<string, { status: AttendanceStatus; amount: number }>();
    attendanceData.forEach((a: any) => {
      const key = `${a.enrollment_id}-${a.date}`;
      map.set(key, { status: a.status, amount: a.charged_amount });
    });
    return map;
  }, [attendanceData]);

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

  const handleStatusChange = (
    enrollmentId: string, 
    date: string, 
    status: AttendanceStatus | null,
    activityPrice: number,
    customPrice: number | null,
    discountPercent: number
  ) => {
    if (status === null) {
      deleteAttendance.mutate({ enrollmentId, date });
    } else {
      const chargedAmount = calculateChargedAmount(
        activityPrice,
        customPrice,
        discountPercent,
        status
      );
      
      setAttendance.mutate({
        enrollment_id: enrollmentId,
        date,
        status,
        charged_amount: chargedAmount,
        notes: null,
      });
    }
  };

  const isLoading = enrollmentsLoading || attendanceLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>Немає записів на цю активність</p>
        <p className="text-sm">Додайте дітей у картці учня</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
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
                Учень
              </th>
              {days.map((day) => (
                <th
                  key={formatDateString(day)}
                  className={`px-1 py-2 text-center text-xs font-medium min-w-[40px] ${
                    isWeekend(day) ? 'text-muted-foreground/50' : 'text-muted-foreground'
                  }`}
                >
                  <div>{getWeekdayShort(day)}</div>
                  <div className="font-semibold">{formatShortDate(day)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enrollments.map((enrollment) => (
              <tr key={enrollment.id} className="border-t hover:bg-muted/20">
                <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium text-sm">
                  {enrollment.students.full_name}
                  {(enrollment.custom_price || enrollment.discount_percent > 0) && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {enrollment.custom_price && `${enrollment.custom_price} ₴`}
                      {enrollment.discount_percent > 0 && ` -${enrollment.discount_percent}%`}
                    </span>
                  )}
                </td>
                {days.map((day) => {
                  const dateStr = formatDateString(day);
                  const key = `${enrollment.id}-${dateStr}`;
                  const attendance = attendanceMap.get(key);
                  
                  return (
                    <td key={dateStr} className="p-0.5 text-center">
                      <AttendanceCell
                        status={attendance?.status || null}
                        amount={attendance?.amount || 0}
                        isWeekend={isWeekend(day)}
                        onChange={(status) => handleStatusChange(
                          enrollment.id,
                          dateStr,
                          status,
                          enrollment.activities.default_price,
                          enrollment.custom_price,
                          enrollment.discount_percent
                        )}
                        activityPrice={enrollment.activities.default_price}
                        customPrice={enrollment.custom_price}
                        discountPercent={enrollment.discount_percent}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
