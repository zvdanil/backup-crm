import { useStudentActivityBalance } from '@/hooks/useFinanceTransactions';
import { formatCurrency } from '@/lib/attendance';
import type { EnrollmentWithRelations } from '@/hooks/useEnrollments';
import { cn } from '@/lib/utils';
import { useActivities } from '@/hooks/useActivities';
import { useMemo } from 'react';
import { isGardenAttendanceController, type GardenAttendanceConfig } from '@/lib/gardenAttendance';

interface StudentActivityBalanceRowProps {
  studentId: string;
  enrollment: EnrollmentWithRelations;
  month: number;
  year: number;
}

export function StudentActivityBalanceRow({ 
  studentId, 
  enrollment, 
  month, 
  year 
}: StudentActivityBalanceRowProps) {
  const { data: balanceData, isLoading } = useStudentActivityBalance(
    studentId,
    enrollment.activity_id,
    month,
    year
  );
  const { data: allActivities = [] } = useActivities();

  // Check if this is a food activity
  const isFoodActivity = useMemo(() => {
    const foodTariffIds = new Set<string>();
    allActivities.forEach(activity => {
      if (isGardenAttendanceController(activity)) {
        const config = (activity.config as GardenAttendanceConfig) || {};
        (config.food_tariff_ids || []).forEach(id => foodTariffIds.add(id));
      }
    });
    return foodTariffIds.has(enrollment.activity_id);
  }, [allActivities, enrollment.activity_id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <span className="text-sm text-muted-foreground">Завантаження...</span>
      </div>
    );
  }

  const balance = balanceData?.balance || 0;
  const payments = balanceData?.payments || 0;
  const charges = balanceData?.charges || 0;
  const refunds = balanceData?.refunds || 0;

  // For food activity: expense transactions are refunds (positive for client)
  // Balance calculation: payments - charges + refunds (refunds increase balance)
  // For food: if there are refunds, balance should be positive (green)
  // For food: balance = payments (0) - charges (0) + refunds (200) = 200 (positive, green)
  // For food: refunds are always positive for client, so balance should always be positive if refunds > 0
  const displayBalance = balance;
  
  // For food: charges = 0 (no charges), refunds shown separately
  const displayCharges = isFoodActivity ? 0 : charges;
  const displayRefunds = isFoodActivity ? refunds : 0;
  
  // For food activity: if there are refunds, balance is always positive (green) for client
  // For other activities: balance can be positive or negative
  const isPositive = isFoodActivity ? (refunds > 0 ? true : balance >= 0) : (balance >= 0);

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-2">
        <span 
          className="w-3 h-3 rounded-full" 
          style={{ backgroundColor: enrollment.activities.color }}
        />
        <span className="text-sm font-medium">
          {isFoodActivity ? `+ ${enrollment.activities.name}` : enrollment.activities.name}
        </span>
      </div>
      <div className="text-right">
        <div className={cn(
          "text-sm font-semibold",
          isPositive ? "text-success" : "text-destructive"
        )}>
          {displayBalance > 0 ? '+' : ''}{formatCurrency(Math.abs(displayBalance))}
        </div>
        <div className="text-xs text-muted-foreground">
          {isFoodActivity ? (
            <>Оплати: {formatCurrency(payments)} | Повернення: {formatCurrency(displayRefunds)}</>
          ) : (
            <>Оплати: {formatCurrency(payments)} | Витрати: {formatCurrency(displayCharges)}</>
          )}
        </div>
      </div>
    </div>
  );
}
