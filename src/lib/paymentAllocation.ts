/**
 * Payment allocation by activity — for display only.
 * Does NOT change balance calculation. Shows how payments distribute across activity debts.
 *
 * Priority: 1) allocation_activity_ids (targeted), 2) auto: oldest first, full-closure preferred.
 */

export interface DebtPosition {
  activityId: string;
  activityName: string;
  accountId: string | null;
  month: number;
  year: number;
  charge: number;
  paid: number;
  remainder: number;
}

export interface PaymentInput {
  id?: string;
  amount: number;
  date: string;
  account_id: string | null;
  allocation_activity_ids?: string[] | null;
}

export interface AllocationResult {
  positions: DebtPosition[];
  activityNames: Record<string, string>;
}

type DebtInput = {
  activityId: string;
  accountId: string | null;
  month: number;
  year: number;
  charge: number;
};

function sortDebtsForAuto(debts: DebtInput[]): DebtInput[] {
  return [...debts].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return b.charge - a.charge; // larger first (prefer full closure)
  });
}

/** Match payment account to debt account: both null or both same id */
function accountMatches(
  paymentAccountId: string | null,
  debtAccountId: string | null
): boolean {
  const p = paymentAccountId ?? "none";
  const d = debtAccountId ?? "none";
  return p === d;
}

/**
 * Compute payment allocation across activity debts.
 * Payments are applied only to debts with matching account_id.
 * @param debts - Charges by activity/account/month
 * @param payments - Payment transactions (date order)
 * @param activityNames - Map activityId -> name
 */
export function computePaymentAllocation(
  debts: DebtInput[],
  payments: PaymentInput[],
  activityNames: Record<string, string>
): AllocationResult {
  const key = (a: string, acc: string | null, m: number, y: number) =>
    `${a}|${acc ?? "none"}|${y}|${m}`;
  const remainder = new Map<string, number>();
  debts.forEach((d) => {
    remainder.set(key(d.activityId, d.accountId, d.month, d.year), d.charge);
  });

  const paid = new Map<string, number>();
  debts.forEach((d) => paid.set(key(d.activityId, d.accountId, d.month, d.year), 0));

  const sortedPayments = [...payments].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const debtsByActivity = new Map<string, DebtInput[]>();
  debts.forEach((d) => {
    const list = debtsByActivity.get(d.activityId) || [];
    list.push(d);
    debtsByActivity.set(d.activityId, list);
  });
  debtsByActivity.forEach((list) => {
    list.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  });

  for (const pay of sortedPayments) {
    let rem = pay.amount || 0;
    if (rem <= 0) continue;

    const allocIds = pay.allocation_activity_ids || [];
    const payAcc = pay.account_id ?? null;

    if (allocIds.length > 0) {
      for (const aid of allocIds) {
        if (rem <= 0) break;
        const list = debtsByActivity.get(aid) || [];
        for (const d of list) {
          if (!accountMatches(payAcc, d.accountId)) continue;
          if (rem <= 0) break;
          const k = key(d.activityId, d.accountId, d.month, d.year);
          const left = remainder.get(k) || 0;
          if (left <= 0) continue;
          const apply = Math.min(rem, left);
          remainder.set(k, left - apply);
          paid.set(k, (paid.get(k) || 0) + apply);
          rem -= apply;
        }
      }
      // При целевому призначенні (allocation_activity_ids) залишок НЕ розносимо по інших активностях
      continue;
    }

    const forAuto = sortDebtsForAuto(
      debts.filter((d) => {
        if (!accountMatches(payAcc, d.accountId)) return false;
        const k = key(d.activityId, d.accountId, d.month, d.year);
        return (remainder.get(k) || 0) > 0;
      })
    );
    for (const d of forAuto) {
      if (rem <= 0) break;
      const k = key(d.activityId, d.accountId, d.month, d.year);
      const left = remainder.get(k) || 0;
      if (left <= 0) continue;
      const apply = Math.min(rem, left);
      remainder.set(k, left - apply);
      paid.set(k, (paid.get(k) || 0) + apply);
      rem -= apply;
    }
  }

  const positions: DebtPosition[] = debts.map((d) => {
    const k = key(d.activityId, d.accountId, d.month, d.year);
    return {
      activityId: d.activityId,
      activityName: activityNames[d.activityId] || d.activityId,
      accountId: d.accountId,
      month: d.month,
      year: d.year,
      charge: d.charge,
      paid: paid.get(k) || 0,
      remainder: remainder.get(k) || 0,
    };
  });

  return { positions, activityNames };
}

export const MONTH_NAMES_UK = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

export function formatAllocationLabel(pos: DebtPosition): string {
  const monthLabel = MONTH_NAMES_UK[pos.month];
  if (pos.remainder <= 0) {
    return `${pos.activityName} за ${monthLabel} оплачено — ${pos.paid.toFixed(2)}`;
  }
  return `${pos.activityName} за ${monthLabel} борг — ${pos.remainder.toFixed(2)}`;
}

/** Types for integration with useFinanceTransactions */
export interface DebtEntry {
  activityId: string;
  activityName: string;
  accountId?: string | null;
  month: number;
  year: number;
  amount: number;
}

export interface PaymentEntry {
  id?: string;
  amount: number;
  date: string;
  allocationActivityIds?: string[] | null;
  accountId?: string | null;
}

export interface PaymentAllocationResult {
  items: DebtPosition[];
  totalPaid: number;
  totalRemaining: number;
}

/**
 * Adapter for fetchPaymentAllocation. Converts DebtEntry/PaymentEntry to core format.
 */
export function computePaymentAllocationFromEntries(
  debts: DebtEntry[],
  payments: PaymentEntry[]
): PaymentAllocationResult {
  const activityNames: Record<string, string> = {};
  debts.forEach((d) => (activityNames[d.activityId] = d.activityName));
  const debtInputs: DebtInput[] = debts.map((d) => ({
    activityId: d.activityId,
    accountId: d.accountId ?? null,
    month: d.month,
    year: d.year,
    charge: d.amount,
  }));
  const paymentInputs: PaymentInput[] = payments.map((p) => ({
    amount: p.amount,
    date: p.date,
    account_id: p.accountId ?? null,
    allocation_activity_ids: p.allocationActivityIds ?? null,
  }));
  const result = computePaymentAllocation(debtInputs, paymentInputs, activityNames);
  const totalPaid = result.positions.reduce((s, p) => s + p.paid, 0);
  const totalRemaining = result.positions.reduce((s, p) => s + p.remainder, 0);
  return {
    items: result.positions,
    totalPaid,
    totalRemaining,
  };
}
