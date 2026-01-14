import type { Staff } from '@/hooks/useStaff';
import type { StaffBillingRule, Deduction, DeductionApplied } from '@/hooks/useStaffBilling';
import type { Activity, BillingRules } from '@/hooks/useActivities';
import { getBillingRulesForDate } from '@/hooks/useActivities';
import { calculateValueFromBillingRules } from './attendance';
import { getWorkingDaysInMonth } from './attendance';
import type { AttendanceStatus } from './attendance';

export interface SalaryCalculationInput {
  staff: Staff;
  activity: Activity | null;
  date: string;
  attendanceValue: number | null; // Значення з attendance.value або charged_amount
  attendanceStatus: AttendanceStatus | null;
  staffBillingRule: StaffBillingRule | null;
  activityBillingRules: BillingRules | null;
  deductions: Deduction[];
}

export interface SalaryCalculationResult {
  baseAmount: number; // Базова сума до застосування комісій
  deductionsApplied: DeductionApplied[];
  finalAmount: number; // Фінальна сума після застосування всіх комісій
}

/**
 * Calculate staff salary for a specific date
 * Priority: 1. staff_billing_rules (індивідуальна ставка для активності)
 *           2. activity billing_rules (глобальна ставка активності)
 *           3. 0 (якщо ніде не вказано)
 */
export function calculateStaffSalary(input: SalaryCalculationInput): SalaryCalculationResult | null {
  const { staff, activity, date, attendanceValue, attendanceStatus, staffBillingRule, activityBillingRules, deductions } = input;

  let baseAmount = 0;

  // Priority 1: Use staff_billing_rules if available (індивідуальна ставка для активності)
  if (staffBillingRule) {
    switch (staffBillingRule.rate_type) {
      case 'fixed':
        baseAmount = staffBillingRule.rate;
        break;
      
      case 'percent':
        // Need attendance value to calculate percentage
        if (attendanceValue !== null && attendanceValue > 0) {
          baseAmount = (attendanceValue * staffBillingRule.rate) / 100;
        } else if (activity && activityBillingRules && attendanceStatus) {
          // Calculate from activity billing rules
          const calculatedValue = calculateValueFromBillingRules(
            date,
            attendanceStatus,
            null,
            null,
            0,
            activityBillingRules
          );
          if (calculatedValue !== null) {
            baseAmount = (calculatedValue * staffBillingRule.rate) / 100;
          }
        }
        break;
      
      case 'per_session':
        // Fixed amount per session
        if (attendanceStatus === 'present') {
          baseAmount = staffBillingRule.rate;
        }
        break;
    }
  } 
  // Priority 2: Use activity billing_rules (глобальна ставка активності)
  else if (activity && activityBillingRules && attendanceStatus) {
    const calculatedValue = calculateValueFromBillingRules(
      date,
      attendanceStatus,
      null,
      null,
      0,
      activityBillingRules
    );
    
    if (calculatedValue !== null) {
      // Use activity's teacher_payment_percent or fixed_teacher_rate
      if (activity.fixed_teacher_rate && activity.fixed_teacher_rate > 0) {
        baseAmount = activity.fixed_teacher_rate;
      } else if (activity.teacher_payment_percent && activity.teacher_payment_percent > 0) {
        baseAmount = (calculatedValue * activity.teacher_payment_percent) / 100;
      }
    } else if (attendanceValue !== null && attendanceValue > 0) {
      // Fallback to attendance value
      if (activity.fixed_teacher_rate && activity.fixed_teacher_rate > 0) {
        baseAmount = activity.fixed_teacher_rate;
      } else if (activity.teacher_payment_percent && activity.teacher_payment_percent > 0) {
        baseAmount = (attendanceValue * activity.teacher_payment_percent) / 100;
      }
    }
  }
  // Priority 3: Якщо ніде не вказано - результат 0 (не використовуємо staff default tariff)
  // baseAmount залишається 0

  if (baseAmount <= 0) {
    return null; // No salary to calculate
  }

  // Apply deductions
  const deductionsApplied: DeductionApplied[] = [];
  let finalAmount = baseAmount;

  deductions.forEach(deduction => {
    let deductionAmount = 0;
    
    if (deduction.type === 'percent') {
      deductionAmount = (finalAmount * deduction.value) / 100;
    } else if (deduction.type === 'fixed') {
      deductionAmount = deduction.value;
    }
    
    if (deductionAmount > 0) {
      deductionsApplied.push({
        name: deduction.name,
        type: deduction.type,
        value: deduction.value,
        amount: Math.round(deductionAmount * 100) / 100,
      });
      finalAmount -= deductionAmount;
    }
  });

  // Ensure final amount is not negative
  finalAmount = Math.max(0, Math.round(finalAmount * 100) / 100);

  return {
    baseAmount: Math.round(baseAmount * 100) / 100,
    deductionsApplied,
    finalAmount,
  };
}
