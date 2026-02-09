import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { isGardenAttendanceController } from "@/lib/gardenAttendance";
import { StudentActivityBalanceRow } from "./StudentActivityBalanceRow";
import type { EnrollmentWithRelations } from "@/hooks/useEnrollments";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMonthStartDate, getMonthEndDate } from "@/lib/attendance";
import {
  getBillingRulesForDate,
  type ActivityPriceHistory,
} from "@/hooks/useActivities";

const MONTHS = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];

interface StudentAccountBalanceProps {
  studentId: string;
  enrollments: EnrollmentWithRelations[];
  allActivities: any[];
  accounts: any[];
  accountBalances: any[];
  accountBalancesLoading: boolean;
  month: number;
  year: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
}

export function StudentAccountBalance({
  studentId,
  enrollments,
  allActivities,
  accounts,
  accountBalances,
  accountBalancesLoading,
  month,
  year,
  onMonthChange,
  onYearChange,
}: StudentAccountBalanceProps) {
  // Load price history for all activities
  const activityIds = useMemo(() => {
    return Array.from(new Set(enrollments.map((e) => e.activity_id)));
  }, [enrollments]);

  const { data: priceHistoryData } = useQuery({
    queryKey: ["activity_price_history_bulk", activityIds],
    queryFn: async () => {
      if (activityIds.length === 0) return [];
      // @ts-expect-error - activity_price_history table exists but may not be in generated types
      const { data, error } = await supabase
        .from("activity_price_history")
        .select("*")
        .in("activity_id", activityIds)
        .order("effective_from", { ascending: false });

      if (error) throw error;
      return data as ActivityPriceHistory[];
    },
    enabled: activityIds.length > 0,
  });

  // Group price history by activity_id
  const priceHistoryByActivity = useMemo(() => {
    const map = new Map<string, ActivityPriceHistory[]>();
    if (!priceHistoryData) return map;

    priceHistoryData.forEach((ph) => {
      if (!map.has(ph.activity_id)) {
        map.set(ph.activity_id, []);
      }
      map.get(ph.activity_id)!.push(ph);
    });

    return map;
  }, [priceHistoryData]);

  const balanceEnrollments = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const isFutureMonth =
      year > currentYear || (year === currentYear && month > currentMonth);

    return enrollments.filter((enrollment) => {
      const activity = allActivities.find(
        (a) => a.id === enrollment.activity_id,
      );
      if (activity && isGardenAttendanceController(activity)) return false;

      // Фильтруем по месяцу архивации:
      // - Для будущих месяцев: только активные enrollments
      // - Для текущего/прошлого месяца: активные + архивные, которые были заархивированы в этом месяце
      if (isFutureMonth) {
        return enrollment.is_active === true;
      } else {
        if (enrollment.is_active === true) return true;
        // Архивные: показываем только если были заархивированы в этом месяце
        if (enrollment.is_active === false && enrollment.unenrolled_at) {
          const unenrolledDate = new Date(enrollment.unenrolled_at);
          const monthStart = new Date(year, month, 1);
          const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
          return unenrolledDate >= monthStart && unenrolledDate <= monthEnd;
        }
        return false;
      }
    });
  }, [enrollments, allActivities, month, year]);

  const accountLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((account) => map.set(account.id, account.name));
    return map;
  }, [accounts]);

  const accountBalanceMap = useMemo(() => {
    const map = new Map<string, (typeof accountBalances)[number]>();
    accountBalances.forEach((balance) => {
      map.set(balance.account_id || "none", balance);
    });
    return map;
  }, [accountBalances]);

  const accountGroups = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; label: string; enrollments: EnrollmentWithRelations[] }
    >();
    balanceEnrollments.forEach((enrollment) => {
      // Приоритет: enrollment.account_id ?? activity.account_id
      const accountId =
        enrollment.account_id || enrollment.activities.account_id || "none";
      const label =
        accountId === "none"
          ? "Без рахунку"
          : accountLabelMap.get(accountId) || "Без рахунку";
      if (!groups.has(accountId)) {
        groups.set(accountId, { id: accountId, label, enrollments: [] });
      }
      groups.get(accountId)!.enrollments.push(enrollment);
    });
    accountBalances.forEach((balance) => {
      const accountId = balance.account_id || "none";
      if (!groups.has(accountId)) {
        const label =
          accountId === "none"
            ? "Без рахунку"
            : accountLabelMap.get(accountId) || "Без рахунку";
        groups.set(accountId, { id: accountId, label, enrollments: [] });
      }
    });
    return Array.from(groups.values()).sort((a, b) => {
      const aIsNone = a.id === "none";
      const bIsNone = b.id === "none";
      if (aIsNone !== bIsNone) return aIsNone ? 1 : -1;
      return a.label.localeCompare(b.label, "uk-UA");
    });
  }, [balanceEnrollments, accountLabelMap, accountBalances]);

  // Calculate subscription charges from activity settings (not from transactions)
  // For subscription type: use price effective on LAST DAY of the month (for historical months)
  const subscriptionChargesByAccount = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const isCurrentOrFutureMonth =
      year > currentYear || (year === currentYear && month >= currentMonth);

    // For historical months: use last day of that month
    // For current/future months: use current date (prices may still change)
    const priceDate = isCurrentOrFutureMonth
      ? new Date() // Current date
      : new Date(year, month + 1, 0); // Last day of the month (month+1, day 0)

    const priceDateString = priceDate.toISOString().split("T")[0];

    balanceEnrollments.forEach((enrollment) => {
      const activity = enrollment.activities;

      // Check billing_rules for subscription type
      // For historical months, need to get billing_rules that were effective on last day of month
      const priceHistory =
        priceHistoryByActivity.get(enrollment.activity_id) || [];
      const billingRules =
        priceHistory.length > 0
          ? getBillingRulesForDate(activity, priceHistory, priceDateString)
          : activity?.billing_rules;

      const presentRule = billingRules?.present;

      // Only subscription type activities
      if (presentRule?.type !== "subscription") return;

      // For subscription: enrollment must be active at the END of the month
      // If unenrolled during the month (even on last day) → don't charge
      const monthEndDate = new Date(year, month + 1, 0); // Last day of month

      const enrolledDate = enrollment.enrolled_at
        ? new Date(enrollment.enrolled_at)
        : null;
      const unenrolledDate = enrollment.unenrolled_at
        ? new Date(enrollment.unenrolled_at)
        : null;

      // Skip if enrolled AFTER month end
      if (enrolledDate && enrolledDate > monthEndDate) {
        return;
      }

      // Skip if unenrolled ON or BEFORE the last day of the month
      // (must be active AFTER month end to be charged for that month)
      if (unenrolledDate && unenrolledDate <= monthEndDate) {
        return;
      }

      const accountId = enrollment.account_id || activity?.account_id || "none";

      // Calculate charge from settings
      let charge = 0;

      // Check if custom_price is effective on the price date
      const hasCustomPrice =
        enrollment.custom_price !== null &&
        enrollment.custom_price !== undefined;
      const effectiveFromDate = enrollment.effective_from
        ? new Date(enrollment.effective_from)
        : null;
      const isCustomPriceEffective =
        hasCustomPrice &&
        (!effectiveFromDate || effectiveFromDate <= priceDate);

      if (isCustomPriceEffective) {
        // Individual tariff with discount (effective on this date)
        const discountMultiplier = 1 - (enrollment.discount_percent || 0) / 100;
        charge =
          Math.round(enrollment.custom_price! * discountMultiplier * 100) / 100;
      } else if (presentRule?.rate && presentRule.rate > 0) {
        // From billing rule rate (historically accurate for this date)
        charge = presentRule.rate;
      } else {
        // From default price
        charge = activity?.default_price || 0;
      }

      const current = map.get(accountId) || 0;
      map.set(accountId, current + charge);
    });

    return map;
  }, [balanceEnrollments, month, year, priceHistoryByActivity]);

  if (balanceEnrollments.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="text-lg font-semibold">Баланс по рахунках</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select
            value={month.toString()}
            onValueChange={(value) => onMonthChange(parseInt(value))}
          >
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((monthLabel, idx) => (
                <SelectItem key={idx} value={idx.toString()}>
                  {monthLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={year}
            onChange={(e) => onYearChange(parseInt(e.target.value))}
            className="w-full sm:w-24"
          />
        </div>
      </div>

      <div className="space-y-4">
        {accountBalancesLoading ? (
          <div className="text-sm text-muted-foreground">Завантаження...</div>
        ) : accountGroups.length === 0 ? (
          <div className="text-sm text-muted-foreground">Немає нарахувань</div>
        ) : (
          <div className="space-y-4">
            {accountGroups.map((group) => {
              const accountBalance = accountBalanceMap.get(group.id);
              const previousBalance = accountBalance?.previous_balance || 0;
              const charges = accountBalance?.charges || 0;
              const payments = accountBalance?.payments || 0;
              const refunds = accountBalance?.refunds || 0;
              const endBalance = previousBalance + payments - charges + refunds;
              const subscriptionCharges =
                subscriptionChargesByAccount.get(group.id) || 0;
              const startLabel =
                previousBalance < 0
                  ? "Борг на початок"
                  : previousBalance > 0
                    ? "Залишок на початок"
                    : "Баланс на початок";
              return (
                <div
                  key={group.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="text-sm font-semibold">{group.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {MONTHS[month]} {year}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {startLabel}
                      </span>
                      <span
                        className={cn(
                          "font-semibold",
                          previousBalance < 0
                            ? "text-destructive"
                            : previousBalance > 0
                              ? "text-success"
                              : "text-muted-foreground",
                        )}
                      >
                        {previousBalance > 0 ? "+" : ""}
                        {formatCurrency(Math.abs(previousBalance))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Нараховано за місяць
                      </span>
                      <span className="font-medium">
                        {formatCurrency(charges)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Оплачено за місяць
                      </span>
                      <span className="font-medium">
                        {formatCurrency(payments)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-destructive">
                        До сплати на початок {MONTHS[month]}
                      </span>
                      <span className="font-medium text-destructive">
                        {formatCurrency(subscriptionCharges - previousBalance)}
                      </span>
                    </div>
                    <div className="border-t border-border my-1"></div>
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">Поточний баланс</span>
                      {endBalance < 0 ? (
                        <span className="font-semibold text-foreground">
                          До сплати: {formatCurrency(Math.abs(endBalance))}
                        </span>
                      ) : endBalance > 0 ? (
                        <span className="font-semibold text-foreground">
                          Переплата: +{formatCurrency(endBalance)}
                        </span>
                      ) : (
                        <span className="font-semibold text-foreground">
                          {formatCurrency(0)}
                        </span>
                      )}
                    </div>
                  </div>

                  {group.enrollments.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Немає рядків за вибраний період
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {group.enrollments.map((enrollment) => (
                        <StudentActivityBalanceRow
                          key={enrollment.id}
                          studentId={studentId}
                          enrollment={enrollment}
                          month={month}
                          year={year}
                        />
                      ))}
                    </div>
                  )}
                  {group.id === "none" &&
                    (accountBalanceMap.get("none")?.unassigned_payments || 0) >
                      0 && (
                      <div className="mt-3 rounded-md border border-dashed border-muted-foreground/40 p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Оплата без активності
                          </span>
                          <span className="font-semibold text-success">
                            +
                            {formatCurrency(
                              accountBalanceMap.get("none")
                                ?.unassigned_payments || 0,
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
