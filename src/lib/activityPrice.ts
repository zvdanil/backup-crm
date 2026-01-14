import type { Activity, ActivityPriceHistory, BillingRules } from '@/hooks/useActivities';
import { getBillingRulesForDate } from '@/hooks/useActivities';
import { formatCurrency } from './attendance';
import { getWorkingDaysInMonth } from './attendance';

/**
 * Get display price for an activity based on billing_rules and price history
 * Returns the price for "present" status as a representative price, or null if not available
 */
export function getActivityDisplayPrice(
  activity: Activity | null | undefined,
  priceHistory: ActivityPriceHistory[] | undefined,
  customPrice: number | null = null,
  discountPercent: number = 0,
  date: string = new Date().toISOString().split('T')[0]
): string | null {
  if (!activity) return null;

  // Priority 1: If custom_price exists, use it as fixed
  if (customPrice !== null && customPrice > 0) {
    const discountMultiplier = 1 - (discountPercent / 100);
    const finalPrice = Math.round(customPrice * discountMultiplier * 100) / 100;
    return formatCurrency(finalPrice);
  }

  // Priority 2: Get billing_rules for the date
  const billingRules = priceHistory 
    ? getBillingRulesForDate(activity, priceHistory, date)
    : activity.billing_rules;

  if (!billingRules || typeof billingRules !== 'object') {
    return null;
  }

  // Get price for "present" status as representative
  const presentRule = billingRules['present'];
  if (!presentRule || !presentRule.rate || presentRule.rate <= 0) {
    return null;
  }

  const dateObj = new Date(date);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();

  switch (presentRule.type) {
    case 'fixed':
      // For fixed type, return the rate directly
      return formatCurrency(presentRule.rate);
    
    case 'subscription': {
      // For subscription, show monthly rate (the full subscription price)
      return formatCurrency(presentRule.rate);
    }
    
    case 'hourly':
      // For hourly, show rate per unit
      return `${formatCurrency(presentRule.rate)}/од`;
    
    default:
      return null;
  }
}

/**
 * Get the numeric price value for an activity (for comparison/sorting)
 * Returns the base rate from billing_rules, or custom_price if set
 */
export function getActivityPriceValue(
  activity: Activity | null | undefined,
  priceHistory: ActivityPriceHistory[] | undefined,
  customPrice: number | null = null,
  date: string = new Date().toISOString().split('T')[0]
): number | null {
  if (!activity) return null;

  // Priority 1: If custom_price exists, use it
  if (customPrice !== null && customPrice > 0) {
    return customPrice;
  }

  // Priority 2: Get billing_rules for the date
  const billingRules = priceHistory 
    ? getBillingRulesForDate(activity, priceHistory, date)
    : activity.billing_rules;

  if (!billingRules || typeof billingRules !== 'object') {
    return null;
  }

  // Get rate for "present" status as representative
  const presentRule = billingRules['present'];
  if (presentRule && presentRule.rate && presentRule.rate > 0) {
    return presentRule.rate;
  }

  return null;
}
