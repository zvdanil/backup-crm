import {
  useStudentActivityBalance,
  useStudentActivityMonthlyBalance,
  useActivityIncomeTransaction,
  useDeleteIncomeTransaction,
  useAddSubscriptionChargeExclusion,
} from "@/hooks/useFinanceTransactions";
import { formatCurrency, getMonthEndDate } from "@/lib/attendance";
import {
  type EnrollmentWithRelations,
  useEnrollmentPriceHistory,
  useEnrollmentAccountHistory,
  getEnrollmentPriceForDate,
  getEnrollmentAccountForDate,
} from "@/hooks/useEnrollments";
import { cn } from "@/lib/utils";
import { useActivities } from "@/hooks/useActivities";
import { useMemo, useState, useEffect } from "react";
import {
  isGardenAttendanceController,
  type GardenAttendanceConfig,
} from "@/lib/gardenAttendance";
import { usePaymentAccounts } from "@/hooks/usePaymentAccounts";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { DeleteTransactionDialog } from "./DeleteTransactionDialog";
import { toast } from "@/hooks/use-toast";

interface StudentActivityBalanceRowProps {
  studentId: string;
  enrollment: EnrollmentWithRelations;
  month: number;
  year: number;
  /** Викликається з сумою нарахування для рядка (для підрахунку підсумку по групі) */
  onChargeCalculated?: (enrollmentId: string, charge: number) => void;
  /** Зміна цього ключа примусово перезапускає звіт (після clear у батька) */
  chargeResetKey?: number;
}

export function StudentActivityBalanceRow({
  studentId,
  enrollment,
  month,
  year,
  onChargeCalculated,
  chargeResetKey = 0,
}: StudentActivityBalanceRowProps) {
  const { data: allActivities = [] } = useActivities();
  const { data: accounts = [] } = usePaymentAccounts();
  const { role } = useAuth();
  const canDelete = role === "owner" || role === "admin";
  const deleteIncome = useDeleteIncomeTransaction();
  const addExclusion = useAddSubscriptionChargeExclusion();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Check if this is a food activity
  const isFoodActivity = useMemo(() => {
    const foodTariffIds = new Set<string>();
    allActivities.forEach((activity) => {
      if (isGardenAttendanceController(activity)) {
        const config = (activity.config as GardenAttendanceConfig) || {};
        (config.food_tariff_ids || []).forEach((id) => foodTariffIds.add(id));
      }
    });
    return foodTariffIds.has(enrollment.activity_id);
  }, [allActivities, enrollment.activity_id]);

  const activities = enrollment.activities;
  const presentRule = activities?.billing_rules?.present;
  const isMonthlyBilling =
    !!activities &&
    !isFoodActivity &&
    (presentRule?.type === "fixed" || presentRule?.type === "subscription");

  // Max rate from custom_statuses with subscription/subscription_with_logic type.
  // These also contribute to «Нараховано на початок» even when isMonthlyBilling = false.
  const customSubscriptionRate = useMemo(() => {
    if (isFoodActivity || !activities?.billing_rules?.custom_statuses) return 0;
    const subs = (activities.billing_rules.custom_statuses as any[]).filter(
      (cs: any) =>
        cs.is_active !== false &&
        (cs.type === "subscription" || cs.type === "subscription_with_logic") &&
        cs.rate != null &&
        Number(cs.rate) > 0,
    );
    if (!subs.length) return 0;
    return Math.max(...subs.map((cs: any) => Number(cs.rate)));
  }, [isFoodActivity, activities?.billing_rules?.custom_statuses]);

  // Для помесячного отображения используем конец месяца как якорную дату
  // (чтобы запись, начавшаяся внутри месяца, корректно применялась к этому месяцу).
  const monthEndDateStr = getMonthEndDate(year, month);
  const { data: enrollmentPriceHistory } = useEnrollmentPriceHistory(enrollment.id);
  const { data: enrollmentAccountHistory } = useEnrollmentAccountHistory(
    enrollment.id,
  );

  const accountLabel = useMemo(() => {
    const accountId =
      getEnrollmentAccountForDate(
        enrollment,
        enrollmentAccountHistory,
        monthEndDateStr,
      ) || activities?.account_id;
    if (!accountId) return "Без рахунку";
    return (
      accounts.find((account) => account.id === accountId)?.name ||
      "Без рахунку"
    );
  }, [accounts, enrollment, enrollmentAccountHistory, monthEndDateStr, activities?.account_id]);

  const baseMonthlyCharge = useMemo(() => {
    if (!isMonthlyBilling) return 0;
    const priceForDate = getEnrollmentPriceForDate(
      enrollment,
      enrollmentPriceHistory,
      monthEndDateStr,
    );
    if (
      priceForDate.custom_price !== null &&
      priceForDate.custom_price !== undefined
    ) {
      const discountMultiplier =
        1 - (priceForDate.discount_percent || 0) / 100;
      return (
        Math.round(priceForDate.custom_price * discountMultiplier * 100) / 100
      );
    }
    if (presentRule?.rate && presentRule.rate > 0) {
      return presentRule.rate;
    }
    return activities?.default_price || 0;
  }, [
    isMonthlyBilling,
    enrollment,
    enrollmentPriceHistory,
    monthEndDateStr,
    activities?.default_price,
    presentRule?.rate,
  ]);

  const monthlyBalanceQuery = useStudentActivityMonthlyBalance(
    studentId,
    enrollment.activity_id,
    baseMonthlyCharge,
    month,
    year,
  );

  const regularBalanceQuery = useStudentActivityBalance(
    studentId,
    enrollment.activity_id,
    month,
    year,
  );

  // Get income transaction for subscription charges (only if monthly billing)
  const incomeTransactionQuery = useActivityIncomeTransaction(
    studentId,
    enrollment.activity_id,
    month,
    year,
  );

  // For monthly billing, use income transaction if it exists
  // This works even for archived enrollments - we still want to show delete button
  const incomeTransaction = isMonthlyBilling
    ? incomeTransactionQuery.data
    : null;

  const displayMode =
    enrollment.activities.balance_display_mode ??
    (isFoodActivity
      ? "recalculation"
      : isMonthlyBilling
        ? "subscription"
        : "recalculation");

  const isLoading =
    monthlyBalanceQuery.isLoading || regularBalanceQuery.isLoading;
  const monthlyData = monthlyBalanceQuery.data;
  const recalculationData = regularBalanceQuery.data;

  // Keep monthly charges as a standalone value for row-level checks
  const monthlyCharges = monthlyData?.charges ?? 0;

  const combinedData = useMemo(() => {
    // Для подписок: используем только monthlyData (или baseMonthlyCharge если monthlyData отсутствует)
    // Не используем recalculationData для подписок, так как он может содержать данные из другого месяца
    if (displayMode === "subscription") {
      // Для подписок: используем monthlyData или baseMonthlyCharge
      const payments = monthlyData?.payments ?? 0;
      const refunds = monthlyData?.refunds ?? 0;
      const attendanceCount =
        monthlyData?.attendanceCount ?? recalculationData?.attendanceCount ?? 0;
      const absentCount =
        monthlyData?.absentCount ?? recalculationData?.absentCount ?? 0;
      const monthlyChargesLocal = monthlyData?.charges ?? 0;
      // Якщо є incomeTransaction — використовуємо monthlyChargesLocal
      // Якщо немає (користувач натиснув корзину): для поточного/минулого місяця — 0,
      // для майбутнього — baseMonthlyCharge (очікуване нарахування)
      const hasIncomeTransaction = !!incomeTransaction;
      const now = new Date();
      const isFutureMonth = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());
      const charges = hasIncomeTransaction
        ? monthlyChargesLocal > 0
          ? monthlyChargesLocal
          : baseMonthlyCharge
        : isFutureMonth && enrollment.is_active && baseMonthlyCharge > 0
          ? baseMonthlyCharge
          : 0;
      const balance = payments - charges + refunds;
      return {
        balance,
        payments,
        charges,
        refunds,
        attendanceCount,
        absentCount,
      };
    }

    // Для других режимов: используем стандартную логику
    if (!monthlyData && !recalculationData) return null;
    const payments = recalculationData?.payments ?? monthlyData?.payments ?? 0;
    const refunds = recalculationData?.refunds ?? monthlyData?.refunds ?? 0;
    const attendanceCount =
      recalculationData?.attendanceCount ?? monthlyData?.attendanceCount ?? 0;
    const absentCount =
      recalculationData?.absentCount ?? monthlyData?.absentCount ?? 0;
    const monthlyChargesLocal = monthlyData?.charges ?? 0;
    const recalculationCharges = recalculationData?.charges ?? 0;

    let charges = recalculationCharges;
    if (displayMode === "subscription_and_recalculation") {
      const monthlyCharges =
        monthlyChargesLocal > 0
          ? monthlyChargesLocal
          : baseMonthlyCharge > 0
            ? baseMonthlyCharge
            : 0;
      charges = monthlyCharges + recalculationCharges;
    }

    const balance = payments - charges + refunds;
    return {
      balance,
      payments,
      charges,
      refunds,
      attendanceCount,
      absentCount,
    };
  }, [
    displayMode,
    monthlyData,
    recalculationData,
    monthlyCharges,
    baseMonthlyCharge,
    incomeTransaction,
    enrollment.is_active,
  ]);

  const charges = combinedData?.charges ?? 0;
  const refunds = combinedData?.refunds ?? 0;
  const displayChargesForReport = isFoodActivity ? 0 : charges;
  const displayRefundsForReport = isFoodActivity ? refunds : 0;
  const valueForGroupTotal = displayChargesForReport - displayRefundsForReport;

  useEffect(() => {
    if (onChargeCalculated) {
      onChargeCalculated(enrollment.id, valueForGroupTotal);
    }
  }, [onChargeCalculated, enrollment.id, valueForGroupTotal, chargeResetKey]);

  // Check if activities data is loaded (might be null for archived activities)
  if (!activities) {
    return (
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <span className="text-sm text-muted-foreground">
          Завантаження даних активності...
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <span className="text-sm text-muted-foreground">Завантаження...</span>
      </div>
    );
  }

  const balance = combinedData?.balance || 0;
  const payments = combinedData?.payments || 0;
  const attendanceCount = combinedData?.attendanceCount || 0;
  const absentCount = combinedData?.absentCount || 0;

  // Для архивних активностей: ховаємо якщо баланс = 0 і немає транзакцій.
  // Виняток: у місяці відписання показуємо завжди — щоб була видна кнопка корзини,
  // користувач сам вирішить чи видаляти нарахування.
  const unenrolledDate = enrollment.unenrolled_at ? new Date(enrollment.unenrolled_at) : null;
  const isMonthOfUnenrollment =
    unenrolledDate &&
    unenrolledDate.getFullYear() === year &&
    unenrolledDate.getMonth() === month;
  if (
    !enrollment.is_active &&
    !isMonthOfUnenrollment &&
    balance === 0 &&
    payments === 0 &&
    charges === 0 &&
    refunds === 0 &&
    !incomeTransaction
  ) {
    return null;
  }

  // Активность отображается если ребёнок записан на неё (есть enrollment)
  // Или если есть баланс/платежи/начисления

  // For food activity: expense transactions are refunds (positive for client)
  // Balance calculation: payments - charges + refunds (refunds increase balance)
  // For food: if there are refunds, balance should be positive (green)
  // For food: balance = payments (0) - charges (0) + refunds (200) = 200 (positive, green)
  // For food: refunds are always positive for client, so balance should always be positive if refunds > 0
  const displayBalance = balance;

  // For food: charges = 0 (no charges), refunds shown separately
  const displayCharges = isFoodActivity ? 0 : charges;
  const displayRefunds = isFoodActivity ? refunds : 0;

  // Permanent UI rule:
  // for pure subscription activities, the row value must show monthly accrual
  // (charges/baseMonthlyCharge), not balance/debt. This keeps the "Абонплата"
  // row semantically correct and prevents showing opening-balance artifacts here.
  const isPureSubscriptionDisplay =
    !isFoodActivity &&
    displayMode === "subscription" &&
    presentRule?.type === "subscription";
  const rowPrimaryValue = isPureSubscriptionDisplay
    ? displayCharges
    : displayBalance;

  // For food activity: if there are refunds, balance is always positive (green) for client
  // For other activities: balance can be positive or negative
  const isPositive = isFoodActivity
    ? refunds > 0
      ? true
      : balance >= 0
    : balance >= 0;

  // Show delete button if this enrollment contributes to «Нараховано на початок місяця».
  // Two sources match the backend subscription_charges calculation:
  // 1. presentRule.type === "subscription" | "fixed"  (isMonthlyBilling)
  // 2. custom_statuses with subscription/subscription_with_logic type  (customSubscriptionRate)
  const hasSubscriptionCharge =
    (isMonthlyBilling && (monthlyCharges > 0 || !!incomeTransaction)) ||
    (customSubscriptionRate > 0 && !isFoodActivity);

  const handleDeleteClick = () => {
    // Allow deletion for subscription charges even if transaction doesn't exist
    if (hasSubscriptionCharge) {
      setDeleteDialogOpen(true);
    }
  };

  const handleDeleteConfirm = async (reason: string) => {
    if (!hasSubscriptionCharge) return;

    try {
      // 1. Додати виключення — «Нараховано на початок» більше не включатиме цю активність
      await addExclusion.mutateAsync({
        enrollmentId: enrollment.id,
        year,
        month,
      });

      // 2. Якщо є income-транзакція — видалити (рядок покаже 0)
      const transactionId = incomeTransaction?.id;
      if (transactionId) {
        await deleteIncome.mutateAsync({
          transactionId,
          reason,
        });
      }

      toast({
        title: "Успішно",
        description: "Нарахування видалено",
      });
      setDeleteDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Помилка",
        description: (error as Error)?.message || "Не вдалося видалити нарахування",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2 p-3 border rounded-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: activities.color }}
          />
          <span className="text-sm font-medium break-words">
            {isFoodActivity ? `+ ${activities.name}` : activities.name}
          </span>
          <span className="rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {accountLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-left sm:text-right">
            <div
              className={cn(
                "text-sm font-semibold",
                isPureSubscriptionDisplay
                  ? "text-destructive"
                  : isPositive
                    ? "text-success"
                    : "text-destructive",
              )}
            >
              {!isPureSubscriptionDisplay && rowPrimaryValue > 0 ? "+" : ""}
              {formatCurrency(Math.abs(rowPrimaryValue))}
            </div>
            <div className="text-xs text-muted-foreground whitespace-normal break-words">
              {isFoodActivity
                ? `Пропусків: ${absentCount}`
                : presentRule?.type === "subscription"
                  ? "Абонплата"
                  : `Відвідувань: ${attendanceCount}`}
            </div>
            {isFoodActivity && displayRefunds > 0 && (
              <div className="text-xs text-muted-foreground whitespace-normal break-words">
                Переплата в поточному місяці: {formatCurrency(displayRefunds)}
              </div>
            )}
          </div>
          {canDelete && hasSubscriptionCharge && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
              onClick={handleDeleteClick}
              disabled={addExclusion.isPending || deleteIncome.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {hasSubscriptionCharge && (
        <DeleteTransactionDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteConfirm}
          transactionType="income"
          amount={incomeTransaction?.amount || baseMonthlyCharge || customSubscriptionRate}
          isLoading={addExclusion.isPending || deleteIncome.isPending}
        />
      )}
    </>
  );
}
