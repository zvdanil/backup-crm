import { supabase } from "@/integrations/supabase/client";

const supabaseAny = supabase as any;

export interface CreatePayrollPayoutInput {
  staffId: string;
  amount: number;
  payoutDate: string;
  payoutForPeriod?: string | null;
  notes?: string | null;
  accountId?: string | null;
  financeTransaction?: {
    activityId?: string | null;
    expenseCategoryId?: string | null;
    description?: string | null;
    category?: string | null;
    dividendPayoutId?: string | null;
    allocationActivityIds?: string[] | null;
  };
}

export interface CreatedPayrollPayoutResult {
  payout: any;
  transaction: any;
}

export interface UpdatePayrollPayoutInput {
  payoutId: string;
  payout: {
    staffId?: string;
    amount?: number;
    payoutDate?: string;
    payoutForPeriod?: string | null;
    notes?: string | null;
    accountId?: string | null;
    dividendPayoutId?: string | null;
  };
  financeTransaction?: {
    activityId?: string | null;
    expenseCategoryId?: string | null;
    description?: string | null;
    category?: string | null;
    dividendPayoutId?: string | null;
    allocationActivityIds?: string[] | null;
  };
}

export interface DeletePayrollPayoutInput {
  payoutId: string;
  deleteNote: string;
}

/**
 * Canonical create flow for payroll payout:
 * 1) Create staff_payouts record (source of truth)
 * 2) Create derived finance_transactions salary record linked by staff_payout_id
 */
export async function createPayrollPayoutWithDerivedTransaction(
  input: CreatePayrollPayoutInput,
): Promise<CreatedPayrollPayoutResult> {
  const { data: payoutRow, error: payoutError } = await supabaseAny
    .from("staff_payouts")
    .insert({
      staff_id: input.staffId,
      amount: input.amount,
      payout_date: input.payoutDate,
      payout_for_period: input.payoutForPeriod || null,
      notes: input.notes || null,
      account_id: input.accountId || null,
      dividend_payout_id: input.financeTransaction?.dividendPayoutId || null,
    })
    .select("*")
    .single();

  if (payoutError) throw payoutError;

  const { data: txRow, error: txError } = await supabaseAny
    .from("finance_transactions")
    .insert({
      type: "salary",
      staff_id: input.staffId,
      activity_id: input.financeTransaction?.activityId || null,
      expense_category_id: input.financeTransaction?.expenseCategoryId || null,
      allocation_activity_ids:
        input.financeTransaction?.allocationActivityIds || null,
      amount: input.amount,
      date: input.payoutDate,
      description:
        input.financeTransaction?.description ||
        input.notes ||
        "Виплата зарплати",
      category: input.financeTransaction?.category || null,
      account_id: input.accountId || null,
      dividend_payout_id: input.financeTransaction?.dividendPayoutId || null,
      staff_payout_id: payoutRow.id,
    })
    .select("*")
    .single();

  if (txError) {
    await supabaseAny.from("staff_payouts").delete().eq("id", payoutRow.id);
    throw txError;
  }

  return { payout: payoutRow, transaction: txRow };
}

/**
 * Unified update flow for payroll payout:
 * 1) Update canonical staff_payouts record
 * 2) Update derived finance_transactions salary record linked by staff_payout_id
 * 3) If derived tx is missing (legacy), create it and link by staff_payout_id
 *
 * Best-effort rollback:
 * If derived tx update/create fails, payout is rolled back to previous state.
 */
export async function updatePayrollPayoutWithDerivedTransaction(
  input: UpdatePayrollPayoutInput,
): Promise<CreatedPayrollPayoutResult> {
  const { data: currentPayout, error: currentPayoutError } = await supabaseAny
    .from("staff_payouts")
    .select("*")
    .eq("id", input.payoutId)
    .single();
  if (currentPayoutError) throw currentPayoutError;

  const payoutUpdate = {
    staff_id: input.payout.staffId ?? currentPayout.staff_id,
    amount: input.payout.amount ?? currentPayout.amount,
    payout_date: input.payout.payoutDate ?? currentPayout.payout_date,
    payout_for_period:
      input.payout.payoutForPeriod !== undefined
        ? input.payout.payoutForPeriod
        : (currentPayout.payout_for_period ?? null),
    notes:
      input.payout.notes !== undefined
        ? input.payout.notes
        : (currentPayout.notes ?? null),
    account_id:
      input.payout.accountId !== undefined
        ? input.payout.accountId
        : (currentPayout.account_id ?? null),
    dividend_payout_id:
      input.payout.dividendPayoutId !== undefined
        ? input.payout.dividendPayoutId
        : (currentPayout.dividend_payout_id ?? null),
  };

  const { data: updatedPayout, error: payoutUpdateError } = await supabaseAny
    .from("staff_payouts")
    .update(payoutUpdate)
    .eq("id", input.payoutId)
    .select("*")
    .single();
  if (payoutUpdateError) throw payoutUpdateError;

  const { data: currentTx, error: currentTxError } = await supabaseAny
    .from("finance_transactions")
    .select("*")
    .eq("staff_payout_id", input.payoutId)
    .maybeSingle();
  if (currentTxError) {
    await supabaseAny
      .from("staff_payouts")
      .update({
        staff_id: currentPayout.staff_id,
        amount: currentPayout.amount,
        payout_date: currentPayout.payout_date,
        payout_for_period: currentPayout.payout_for_period ?? null,
        notes: currentPayout.notes ?? null,
        account_id: currentPayout.account_id ?? null,
        dividend_payout_id: currentPayout.dividend_payout_id ?? null,
      })
      .eq("id", input.payoutId);
    throw currentTxError;
  }

  const nextTxPayload = {
    type: "salary",
    staff_id: payoutUpdate.staff_id,
    amount: payoutUpdate.amount,
    date: payoutUpdate.payout_date,
    description:
      input.financeTransaction?.description ??
      payoutUpdate.notes ??
      currentTx?.description ??
      "Виплата зарплати",
    account_id: payoutUpdate.account_id,
    dividend_payout_id:
      input.financeTransaction?.dividendPayoutId ??
      payoutUpdate.dividend_payout_id,
    activity_id:
      input.financeTransaction?.activityId ??
      (currentTx?.activity_id ?? null),
    expense_category_id:
      input.financeTransaction?.expenseCategoryId ??
      (currentTx?.expense_category_id ?? null),
    allocation_activity_ids:
      input.financeTransaction?.allocationActivityIds ??
      (currentTx?.allocation_activity_ids ?? null),
    category:
      input.financeTransaction?.category ?? (currentTx?.category ?? null),
    staff_payout_id: input.payoutId,
  };

  if (currentTx?.id) {
    const { data: updatedTx, error: txUpdateError } = await supabaseAny
      .from("finance_transactions")
      .update(nextTxPayload)
      .eq("id", currentTx.id)
      .select("*")
      .single();

    if (txUpdateError) {
      await supabaseAny
        .from("staff_payouts")
        .update({
          staff_id: currentPayout.staff_id,
          amount: currentPayout.amount,
          payout_date: currentPayout.payout_date,
          payout_for_period: currentPayout.payout_for_period ?? null,
          notes: currentPayout.notes ?? null,
          account_id: currentPayout.account_id ?? null,
          dividend_payout_id: currentPayout.dividend_payout_id ?? null,
        })
        .eq("id", input.payoutId);
      throw txUpdateError;
    }

    return { payout: updatedPayout, transaction: updatedTx };
  }

  const { data: createdTx, error: txCreateError } = await supabaseAny
    .from("finance_transactions")
    .insert(nextTxPayload)
    .select("*")
    .single();

  if (txCreateError) {
    await supabaseAny
      .from("staff_payouts")
      .update({
        staff_id: currentPayout.staff_id,
        amount: currentPayout.amount,
        payout_date: currentPayout.payout_date,
        payout_for_period: currentPayout.payout_for_period ?? null,
        notes: currentPayout.notes ?? null,
        account_id: currentPayout.account_id ?? null,
        dividend_payout_id: currentPayout.dividend_payout_id ?? null,
      })
      .eq("id", input.payoutId);
    throw txCreateError;
  }

  return { payout: updatedPayout, transaction: createdTx };
}

/**
 * Unified delete flow for payroll payout:
 * 1) Soft delete canonical staff_payouts (with required reason)
 * 2) Remove derived salary transaction linked by staff_payout_id
 *    (hard delete is used here because finance_transactions currently
 *    has no soft-delete contract in this module)
 */
export async function deletePayrollPayoutWithDerivedTransaction(
  input: DeletePayrollPayoutInput,
): Promise<{ payoutId: string; transactionId?: string }> {
  if (!input.deleteNote || !input.deleteNote.trim()) {
    throw new Error("Причина видалення обов'язкова");
  }

  const { data: currentPayout, error: currentPayoutError } = await supabaseAny
    .from("staff_payouts")
    .select("*")
    .eq("id", input.payoutId)
    .single();
  if (currentPayoutError) throw currentPayoutError;

  const { error: payoutDeleteError } = await supabaseAny
    .from("staff_payouts")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_note: input.deleteNote.trim(),
    })
    .eq("id", input.payoutId);
  if (payoutDeleteError) throw payoutDeleteError;

  const { data: linkedTx, error: linkedTxError } = await supabaseAny
    .from("finance_transactions")
    .select("id")
    .eq("staff_payout_id", input.payoutId)
    .maybeSingle();

  if (linkedTxError) {
    await supabaseAny
      .from("staff_payouts")
      .update({
        is_deleted: currentPayout.is_deleted ?? false,
        deleted_at: currentPayout.deleted_at ?? null,
        deleted_note: currentPayout.deleted_note ?? null,
      })
      .eq("id", input.payoutId);
    throw linkedTxError;
  }

  if (!linkedTx?.id) {
    return { payoutId: input.payoutId };
  }

  const { error: txDeleteError } = await supabaseAny
    .from("finance_transactions")
    .delete()
    .eq("id", linkedTx.id);

  if (txDeleteError) {
    await supabaseAny
      .from("staff_payouts")
      .update({
        is_deleted: currentPayout.is_deleted ?? false,
        deleted_at: currentPayout.deleted_at ?? null,
        deleted_note: currentPayout.deleted_note ?? null,
      })
      .eq("id", input.payoutId);
    throw txDeleteError;
  }

  return { payoutId: input.payoutId, transactionId: linkedTx.id };
}
