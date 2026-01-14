/**
 * Garden Attendance Journal v1 - Calculation Logic
 * 
 * This module handles the calculation of daily accruals for garden attendance
 * based on base tariffs and food tariffs.
 */

import { getWorkingDaysInMonth } from './attendance';
import type { Activity } from '@/hooks/useActivities';
import type { EnrollmentWithRelations } from '@/hooks/useEnrollments';
import type { AttendanceStatus } from './attendance';

/**
 * Configuration structure for Garden Attendance Journal activity
 */
export interface GardenAttendanceConfig {
  base_tariff_ids?: string[];
  food_tariff_ids?: string[];
}

/**
 * Result of daily accrual calculation
 */
export interface DailyAccrualResult {
  amount: number;
  baseTariff: number | null;
  foodTariff: number | null;
  workingDaysInMonth: number;
  status: AttendanceStatus | null;
}

/**
 * Calculate daily accrual for a student on a specific date
 * 
 * Algorithm:
 * 1. Get config from controller activity
 * 2. Find enrollment with activity_id in base_tariff_ids (M - monthly tariff)
 * 3. Find enrollment with activity_id in food_tariff_ids (F - daily food cost)
 * 4. Calculate D (working days Mon-Fri in current month)
 * 5. If status "П" (present): result = M / D
 * 6. If status "О" (absent): result = (M / D) - F
 * 
 * @param studentId - Student ID
 * @param date - Date string in format YYYY-MM-DD
 * @param controllerActivityId - ID of the controller activity (Garden Attendance Journal)
 * @param enrollments - Array of all enrollments for the student
 * @param activities - Map of activity ID to Activity object
 * @param status - Attendance status ('present' | 'absent' | 'sick' | 'vacation' | null)
 * @returns DailyAccrualResult with calculated amount and metadata
 */
export function calculateDailyAccrual(
  studentId: string,
  date: string,
  controllerActivityId: string,
  enrollments: EnrollmentWithRelations[],
  activities: Map<string, Activity>,
  status: AttendanceStatus | null
): DailyAccrualResult | null {
  // 1. Get controller activity and its config
  const controllerActivity = activities.get(controllerActivityId);
  if (!controllerActivity) {
    return null;
  }

  // Parse config from controller activity
  const config = (controllerActivity.config as GardenAttendanceConfig) || {};
  const baseTariffIds = config.base_tariff_ids || [];
  const foodTariffIds = config.food_tariff_ids || [];

  // 2. Find enrollment with activity_id in base_tariff_ids (M - monthly tariff)
  const baseEnrollment = enrollments.find(
    (enrollment) =>
      enrollment.student_id === studentId &&
      enrollment.is_active &&
      baseTariffIds.includes(enrollment.activity_id)
  );

  if (!baseEnrollment) {
    // No base tariff enrollment found
    return null;
  }

  // Get base tariff activity
  const baseActivity = activities.get(baseEnrollment.activity_id);
  if (!baseActivity) {
    return null;
  }

  // Calculate M (monthly tariff)
  // Priority: custom_price > billing_rules > default_price
  let baseTariff = 0;
  
  if (baseEnrollment.custom_price !== null && baseEnrollment.custom_price > 0) {
    // Apply discount if any
    const discountMultiplier = 1 - ((baseEnrollment.discount_percent || 0) / 100);
    baseTariff = baseEnrollment.custom_price * discountMultiplier;
  } else if (baseActivity.billing_rules && typeof baseActivity.billing_rules === 'object') {
    // Try to get rate from billing_rules for 'present' status
    const presentRule = (baseActivity.billing_rules as any)['present'];
    if (presentRule && presentRule.rate && presentRule.rate > 0) {
      if (presentRule.type === 'subscription') {
        baseTariff = presentRule.rate;
      } else if (presentRule.type === 'fixed') {
        // For fixed type, we need to calculate monthly equivalent
        // This might need adjustment based on actual business logic
        baseTariff = presentRule.rate;
      }
    }
  } else {
    // Fallback to default_price
    baseTariff = baseActivity.default_price || 0;
  }

  // 3. Find enrollment with activity_id in food_tariff_ids (F - daily food cost)
  const foodEnrollment = enrollments.find(
    (enrollment) =>
      enrollment.student_id === studentId &&
      enrollment.is_active &&
      foodTariffIds.includes(enrollment.activity_id)
  );

  let foodTariff = 0;
  if (foodEnrollment) {
    const foodActivity = activities.get(foodEnrollment.activity_id);
    if (foodActivity) {
      // Calculate F (daily food cost)
      // Priority: custom_price > billing_rules > default_price
      if (foodEnrollment.custom_price !== null && foodEnrollment.custom_price > 0) {
        const discountMultiplier = 1 - ((foodEnrollment.discount_percent || 0) / 100);
        foodTariff = foodEnrollment.custom_price * discountMultiplier;
      } else if (foodActivity.billing_rules && typeof foodActivity.billing_rules === 'object') {
        // Try to get rate from billing_rules for 'present' status
        const presentRule = (foodActivity.billing_rules as any)['present'];
        if (presentRule && presentRule.rate && presentRule.rate > 0) {
          if (presentRule.type === 'fixed') {
            foodTariff = presentRule.rate;
          } else if (presentRule.type === 'subscription') {
            // For subscription, divide by working days in month
            const dateObj = new Date(date);
            const year = dateObj.getFullYear();
            const month = dateObj.getMonth();
            const workingDays = getWorkingDaysInMonth(year, month);
            foodTariff = workingDays > 0 ? presentRule.rate / workingDays : 0;
          }
        }
      } else {
        foodTariff = foodActivity.default_price || 0;
      }
    }
  }

  // 4. Calculate D (working days Mon-Fri in current month)
  const dateObj = new Date(date);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();
  const workingDaysInMonth = getWorkingDaysInMonth(year, month);

  if (workingDaysInMonth === 0) {
    return null;
  }

  // 5. Calculate daily amount based on status
  let amount = 0;

  if (status === 'present') {
    // If status "П" (present): result = M / D
    amount = baseTariff / workingDaysInMonth;
  } else if (status === 'absent') {
    // If status "О" (absent): result = (M / D) - F
    amount = (baseTariff / workingDaysInMonth) - foodTariff;
  } else {
    // For other statuses (sick, vacation), we might need different logic
    // For now, return null or handle as absent
    // This can be extended based on business requirements
    amount = (baseTariff / workingDaysInMonth) - foodTariff;
  }

  // Round to 2 decimal places
  amount = Math.round(amount * 100) / 100;

  return {
    amount,
    baseTariff,
    foodTariff,
    workingDaysInMonth,
    status,
  };
}

/**
 * Get config from activity
 */
export function getGardenAttendanceConfig(activity: Activity | null): GardenAttendanceConfig {
  if (!activity || !activity.config) {
    return {};
  }
  return (activity.config as GardenAttendanceConfig) || {};
}

/**
 * Check if activity is a Garden Attendance Journal controller
 */
export function isGardenAttendanceController(activity: Activity | null): boolean {
  if (!activity || !activity.config) {
    return false;
  }
  const config = activity.config as GardenAttendanceConfig;
  return !!(config.base_tariff_ids && config.base_tariff_ids.length > 0);
}
