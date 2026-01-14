import { useMemo } from 'react';
import { formatCurrency } from '@/lib/attendance';
import { getActivityDisplayPrice } from '@/lib/activityPrice';
import { useActivityPriceHistory } from '@/hooks/useActivities';
import type { EnrollmentWithRelations } from '@/hooks/useEnrollments';

interface EnrollmentPriceDisplayProps {
  enrollment: EnrollmentWithRelations;
  showLabel?: boolean;
}

export function EnrollmentPriceDisplay({ enrollment, showLabel = false }: EnrollmentPriceDisplayProps) {
  // Get price history for the activity
  const { data: priceHistory } = useActivityPriceHistory(enrollment.activity_id);
  
  // Use current date for display (актуальна ціна на сьогодні)
  // Примітка: для історичних записів можна використовувати enrollment.enrolled_at, 
  // але для відображення поточної ціни використовуємо сьогоднішню дату
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Get display price using billing_rules for current date
  const displayPrice = useMemo(() => {
    return getActivityDisplayPrice(
      enrollment.activities,
      priceHistory,
      enrollment.custom_price,
      enrollment.discount_percent || 0,
      currentDate
    );
  }, [enrollment.activities, priceHistory, enrollment.custom_price, enrollment.discount_percent, currentDate]);

  if (!displayPrice) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span>
      {displayPrice}
      {enrollment.custom_price && (
        <span className="text-xs text-muted-foreground ml-1">(індив.)</span>
      )}
      {showLabel && enrollment.custom_price && (
        <span className="block text-xs text-muted-foreground">Індивідуальна ціна</span>
      )}
    </span>
  );
}
