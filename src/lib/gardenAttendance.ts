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
  baseTariffs: Array<{
    activityId: string;
    monthlyTariff: number;
    dailyTariff: number;
  }>;
  foodTariffs: Array<{
    activityId: string;
    dailyTariff: number;
  }>;
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

  const dateObj = new Date(date);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();
  const workingDaysInMonth = getWorkingDaysInMonth(year, month);

  if (workingDaysInMonth === 0) {
    return null;
  }

  // 2. Find all base tariff enrollments (M - monthly tariff, may be multiple)
  const baseEnrollments = enrollments.filter(
    (enrollment) =>
      enrollment.student_id === studentId &&
      enrollment.is_active &&
      baseTariffIds.includes(enrollment.activity_id)
  );

  if (baseEnrollments.length === 0) {
    return null;
  }

  const baseTariffs: DailyAccrualResult['baseTariffs'] = [];
  let baseTariffTotal = 0;

  baseEnrollments.forEach((baseEnrollment) => {
    const baseActivity = activities.get(baseEnrollment.activity_id);
    if (!baseActivity) return;

    let baseTariff = 0;
    if (baseEnrollment.custom_price !== null && baseEnrollment.custom_price > 0) {
      const discountMultiplier = 1 - ((baseEnrollment.discount_percent || 0) / 100);
      baseTariff = baseEnrollment.custom_price * discountMultiplier;
    } else if (baseActivity.billing_rules && typeof baseActivity.billing_rules === 'object') {
      const presentRule = (baseActivity.billing_rules as any)['present'];
      if (presentRule && presentRule.rate && presentRule.rate > 0) {
        if (presentRule.type === 'subscription' || presentRule.type === 'fixed') {
          baseTariff = presentRule.rate;
        }
      }
    } else {
      baseTariff = baseActivity.default_price || 0;
    }

    const dailyTariff = workingDaysInMonth > 0 ? baseTariff / workingDaysInMonth : 0;
    baseTariffTotal += baseTariff;
    baseTariffs.push({
      activityId: baseEnrollment.activity_id,
      monthlyTariff: baseTariff,
      dailyTariff: Math.round(dailyTariff * 100) / 100,
    });
  });

  // 3. Find all food tariff enrollments (F - daily food cost, may be multiple)
  const foodEnrollments = enrollments.filter(
    (enrollment) =>
      enrollment.student_id === studentId &&
      enrollment.is_active &&
      foodTariffIds.includes(enrollment.activity_id)
  );

  const foodTariffs: DailyAccrualResult['foodTariffs'] = [];
  let foodTariffTotal = 0;

  foodEnrollments.forEach((foodEnrollment) => {
    const foodActivity = activities.get(foodEnrollment.activity_id);
    if (!foodActivity) return;

    let foodTariff = 0;
    if (foodEnrollment.custom_price !== null && foodEnrollment.custom_price > 0) {
      const discountMultiplier = 1 - ((foodEnrollment.discount_percent || 0) / 100);
      foodTariff = foodEnrollment.custom_price * discountMultiplier;
    } else if (foodActivity.billing_rules && typeof foodActivity.billing_rules === 'object') {
      const presentRule = (foodActivity.billing_rules as any)['present'];
      if (presentRule && presentRule.rate && presentRule.rate > 0) {
        if (presentRule.type === 'fixed') {
          foodTariff = presentRule.rate;
        } else if (presentRule.type === 'subscription') {
          foodTariff = workingDaysInMonth > 0 ? presentRule.rate / workingDaysInMonth : 0;
        }
      }
    } else {
      foodTariff = foodActivity.default_price || 0;
    }

    foodTariffTotal += foodTariff;
    foodTariffs.push({
      activityId: foodEnrollment.activity_id,
      dailyTariff: Math.round(foodTariff * 100) / 100,
    });
  });

  // 5. Calculate daily amount based on status
  let amount = 0;
  const baseDailyTotal = baseTariffs.reduce((sum, item) => sum + item.dailyTariff, 0);

  if (status === 'present') {
    // If status "П" (present): result = M / D
    amount = baseDailyTotal;
  } else if (status === 'absent') {
    // If status "О" (absent): result = (M / D) - F
    amount = baseDailyTotal - foodTariffTotal;
  } else {
    // For other statuses (sick, vacation), we might need different logic
    // For now, return null or handle as absent
    // This can be extended based on business requirements
    amount = baseDailyTotal - foodTariffTotal;
  }

  // Round to 2 decimal places
  amount = Math.round(amount * 100) / 100;

  return {
    amount,
    baseTariff: baseTariffTotal,
    foodTariff: foodTariffTotal,
    baseTariffs,
    foodTariffs,
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
