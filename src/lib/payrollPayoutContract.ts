import { z } from "zod";

/**
 * Unified entry points for creating/editing payroll payouts.
 * These values are for UI context and analytics only.
 */
export const payrollPayoutSourceSchema = z.enum([
  "financial-history",
  "activity-expense-journal",
  "staff-expense-journal",
]);

export type PayrollPayoutSource = z.infer<typeof payrollPayoutSourceSchema>;

/**
 * Unified form payload for payroll payout popup.
 *
 * Business rules (agreed):
 * - staffId is always required
 * - subcategoryId is optional
 * - payoutDate is editable and must be local YYYY-MM-DD string
 */
export const payrollPayoutInputSchema = z.object({
  staffId: z.string().min(1, "Співробітник обов'язковий"),
  amount: z.number().positive("Сума має бути більше 0"),
  payoutDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата має бути у форматі YYYY-MM-DD"),
  accountId: z.string().min(1, "Рахунок обов'язковий"),
  notes: z.string().max(2000).optional().nullable(),
  commission: z.number().min(0).optional().default(0),
  subcategoryId: z.string().optional().nullable(),
  source: payrollPayoutSourceSchema,
});

export type PayrollPayoutInput = z.infer<typeof payrollPayoutInputSchema>;

/**
 * Context-driven popup prefill. For some sources staff is preselected.
 */
export interface PayrollPayoutPrefill {
  source: PayrollPayoutSource;
  staffId?: string;
  payoutDate?: string;
  accountId?: string;
  subcategoryId?: string | null;
}

export interface ResolvePayrollPayoutPrefillInput {
  source: PayrollPayoutSource;
  staffId?: string;
  payoutDate?: string;
  accountId?: string;
  subcategoryId?: string | null;
}

export interface ResolvedPayrollPayoutPrefill extends PayrollPayoutPrefill {
  lockStaff: boolean;
}

/**
 * Resolves source-specific prefill behavior agreed for unified popup:
 * - financial-history: staff is prefilled and locked
 * - activity-expense-journal: staff is prefilled and locked (row context)
 * - staff-expense-journal: no prefill, staff is editable
 */
export function resolvePayrollPayoutPrefill(
  input: ResolvePayrollPayoutPrefillInput,
): ResolvedPayrollPayoutPrefill {
  const base: ResolvedPayrollPayoutPrefill = {
    source: input.source,
    staffId: input.staffId,
    payoutDate: input.payoutDate,
    accountId: input.accountId,
    subcategoryId: input.subcategoryId ?? null,
    lockStaff: false,
  };

  if (input.source === "financial-history") {
    return { ...base, lockStaff: Boolean(input.staffId) };
  }
  if (input.source === "activity-expense-journal") {
    return { ...base, lockStaff: Boolean(input.staffId) };
  }
  return { ...base, staffId: undefined, lockStaff: false };
}

/**
 * Normalizes optional fields before write operations.
 */
export function normalizePayrollPayoutInput(
  input: PayrollPayoutInput,
): PayrollPayoutInput {
  const notes = input.notes?.trim();
  const subcategoryId =
    input.subcategoryId && input.subcategoryId.trim().length > 0
      ? input.subcategoryId
      : null;

  return {
    ...input,
    notes: notes && notes.length > 0 ? notes : null,
    subcategoryId,
    commission: input.commission ?? 0,
  };
}
