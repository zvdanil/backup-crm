import { useMemo } from 'react';
import { formatCurrency, formatLocalDate } from '@/lib/attendance';
import {
  getEnrollmentPriceForDate,
  useEnrollmentPriceHistory,
  type EnrollmentWithRelations,
} from '@/hooks/useEnrollments';

interface EnrollmentPriceDisplayProps {
  enrollment: EnrollmentWithRelations;
  showLabel?: boolean;
}

export function EnrollmentPriceDisplay({ enrollment, showLabel = false }: EnrollmentPriceDisplayProps) {
  const { data: enrollmentPriceHistory } = useEnrollmentPriceHistory(enrollment.id);

  // Поточна ціна: завжди з єдиного джерела enrollment_price_history (інтервали).
  const currentDate = formatLocalDate(new Date());

  const { custom_price, discount_percent } = useMemo(
    () =>
      getEnrollmentPriceForDate(
        enrollment,
        enrollmentPriceHistory,
        currentDate,
      ),
    [enrollment, enrollmentPriceHistory, currentDate],
  );

  const displayPrice = useMemo(() => {
    if (custom_price !== null && custom_price !== undefined) {
      const discountMultiplier = 1 - (discount_percent || 0) / 100;
      const finalPrice = Math.round(custom_price * discountMultiplier * 100) / 100;
      return formatCurrency(finalPrice);
    }
    const presentRate = enrollment.activities?.billing_rules?.present?.rate;
    if (presentRate && presentRate > 0) return formatCurrency(presentRate);
    if (enrollment.activities?.default_price != null) {
      return formatCurrency(enrollment.activities.default_price);
    }
    return null;
  }, [custom_price, discount_percent, enrollment.activities]);

  if (!displayPrice) return <span className="text-muted-foreground">—</span>;

  return (
    <span>
      {displayPrice}
      {custom_price !== null && custom_price !== undefined && (
        <span className="text-xs text-muted-foreground ml-1">(індив.)</span>
      )}
      {showLabel && custom_price !== null && custom_price !== undefined && (
        <span className="block text-xs text-muted-foreground">Індивідуальна ціна</span>
      )}
    </span>
  );
}
