import { useMemo, useState, useCallback, useEffect } from "react";
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
import {
  useEnrollmentPriceHistoryMap,
  enrollmentHistoryCoversMonth,
} from "@/hooks/useEnrollments";
import { useAccountOpeningBalancesCumulativeUpToMonth } from "@/hooks/useAccountOpeningBalances";
import { ACTIVITY_GROUP_LABELS } from "@/lib/activityGroups";
import type { ActivityGroup } from "@/hooks/useActivities";

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
  const enrollmentIds = useMemo(
    () => enrollments.map((e) => e.id),
    [enrollments],
  );
  const { data: priceHistoryMap = new Map() } = useEnrollmentPriceHistoryMap(enrollmentIds);

  const balanceEnrollments = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const isFutureMonth =
      year > currentYear || (year === currentYear && month > currentMonth);

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    return enrollments.filter((enrollment) => {
      const activity = allActivities.find(
        (a) => a.id === enrollment.activity_id,
      );
      if (activity && isGardenAttendanceController(activity)) return false;

      const unenrolledDate = enrollment.unenrolled_at ? new Date(enrollment.unenrolled_at) : null;
      if (unenrolledDate && unenrolledDate < monthStart) return false;

      const history = priceHistoryMap.get(enrollment.id);
      const coversByHistory = enrollmentHistoryCoversMonth(history, year, month);

      if (history && history.length > 0) {
        if (!coversByHistory) return false;
        if (isFutureMonth) return enrollment.is_active === true;
        if (enrollment.is_active === true) return true;
        if (enrollment.is_active === false && unenrolledDate) {
          return unenrolledDate >= monthStart && unenrolledDate <= monthEnd;
        }
        return false;
      }

      const effectiveDate = (enrollment.effective_from ?? enrollment.enrolled_at)
        ? new Date(enrollment.effective_from ?? enrollment.enrolled_at)
        : null;
      if (effectiveDate && effectiveDate > monthEnd) return false;
      if (isFutureMonth) {
        return enrollment.is_active === true && effectiveDate && effectiveDate <= monthEnd;
      }
      if (enrollment.is_active === true) return true;
      if (enrollment.is_active === false && unenrolledDate) {
        return unenrolledDate >= monthStart && unenrolledDate <= monthEnd;
      }
      return false;
    });
  }, [enrollments, allActivities, month, year, priceHistoryMap]);

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

  const { data: openingBalances = [] } = useAccountOpeningBalancesCumulativeUpToMonth(studentId, month, year);
  const openingByAccountId = useMemo(() => {
    const map = new Map<string, number>();
    openingBalances.forEach((ob) => {
      const id = ob.account_id || "none";
      map.set(id, (map.get(id) ?? 0) + (ob.amount ?? 0));
    });
    return map;
  }, [openingBalances]);

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

  const groupLabel = (key: ActivityGroup | "other") =>
    key === "other" ? "Інше" : ACTIVITY_GROUP_LABELS[key];

  const [chargesByGroup, setChargesByGroup] = useState<
    Record<string, Record<string, number>>
  >({});

  useEffect(() => {
    setChargesByGroup({});
  }, [month, year, balanceEnrollments]);

  const reportCharge = useCallback(
    (
      accountId: string,
      groupKey: ActivityGroup | "other",
      enrollmentId: string,
      charge: number
    ) => {
      setChargesByGroup((prev) => {
        const k = `${accountId}-${groupKey}`;
        return {
          ...prev,
          [k]: { ...(prev[k] || {}), [enrollmentId]: charge },
        };
      });
    },
    []
  );

  const getGroupTotal = useCallback(
    (accountId: string, groupKey: ActivityGroup | "other") => {
      const k = `${accountId}-${groupKey}`;
      return Object.values(chargesByGroup[k] || {}).reduce((a, b) => a + b, 0);
    },
    [chargesByGroup]
  );

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
              const basePreviousBalance = accountBalance?.previous_balance ?? 0;
              const openingForAccount = openingByAccountId.get(group.id) ?? 0;
              const displayPreviousBalance = basePreviousBalance + openingForAccount;
              const charges = accountBalance?.charges || 0;
              const payments = accountBalance?.payments || 0;
              const refunds = accountBalance?.refunds || 0;
              const endBalance = displayPreviousBalance + payments - charges + refunds;
              const startLabel =
                displayPreviousBalance < 0
                  ? "Борг на початок"
                  : displayPreviousBalance > 0
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
                          displayPreviousBalance < 0
                            ? "text-destructive"
                            : displayPreviousBalance > 0
                              ? "text-success"
                              : "text-muted-foreground",
                        )}
                      >
                        {displayPreviousBalance > 0 ? "+" : ""}
                        {formatCurrency(Math.abs(displayPreviousBalance))}
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
                        {formatCurrency(charges - displayPreviousBalance)}
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
                    (() => {
                      const groupKeys: (ActivityGroup | "other")[] = [
                        "kindergarten",
                        "additional_classes",
                        "other",
                      ];
                      const byGroup = new Map<ActivityGroup | "other", EnrollmentWithRelations[]>();
                      groupKeys.forEach((k) => byGroup.set(k, []));
                      group.enrollments.forEach((enrollment) => {
                        const activity = allActivities.find((a) => a.id === enrollment.activity_id);
                        const ag = activity?.activity_group;
                        const key: ActivityGroup | "other" =
                          ag === "kindergarten" || ag === "additional_classes" ? ag : "other";
                        byGroup.get(key)!.push(enrollment);
                      });
                      return (
                        <div className="space-y-4">
                          {groupKeys.map((groupKey) => {
                            const groupEnrollments = byGroup.get(groupKey) ?? [];
                            if (groupEnrollments.length === 0) return null;
                            const groupTotal = getGroupTotal(group.id, groupKey);
                            return (
                              <div key={groupKey}>
                                <div className="text-sm font-medium text-muted-foreground mb-2">
                                  {groupLabel(groupKey)}
                                </div>
                                <div className="space-y-3 pl-0">
                                  {groupEnrollments.map((enrollment) => (
                                    <StudentActivityBalanceRow
                                      key={enrollment.id}
                                      studentId={studentId}
                                      enrollment={enrollment}
                                      month={month}
                                      year={year}
                                      onChargeCalculated={(enrollmentId, charge) =>
                                        reportCharge(group.id, groupKey, enrollmentId, charge)
                                      }
                                    />
                                  ))}
                                </div>
                                <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-border">
                                  <span className="font-medium text-muted-foreground">
                                    Всього нараховано
                                  </span>
                                  <span className="font-semibold">
                                    {formatCurrency(groupTotal)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
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
