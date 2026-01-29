import { 
  useStudentActivityBalance, 
  useStudentActivityMonthlyBalance,
  useActivityIncomeTransaction,
  useDeleteIncomeTransaction,
  useCreateFinanceTransaction
} from '@/hooks/useFinanceTransactions';
import { formatCurrency } from '@/lib/attendance';
import type { EnrollmentWithRelations } from '@/hooks/useEnrollments';
import { cn } from '@/lib/utils';
import { useActivities } from '@/hooks/useActivities';
import { useMemo, useState } from 'react';
import { isGardenAttendanceController, type GardenAttendanceConfig } from '@/lib/gardenAttendance';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { DeleteTransactionDialog } from './DeleteTransactionDialog';
import { toast } from '@/hooks/use-toast';

interface StudentActivityBalanceRowProps {
  studentId: string;
  enrollment: EnrollmentWithRelations;
  month: number;
  year: number;
}

export function StudentActivityBalanceRow({ 
  studentId, 
  enrollment, 
  month, 
  year 
}: StudentActivityBalanceRowProps) {
  const { data: allActivities = [] } = useActivities();
  const { data: accounts = [] } = usePaymentAccounts();
  const { role } = useAuth();
  const canDelete = role === 'owner' || role === 'admin';

  // Check if this is a food activity
  const isFoodActivity = useMemo(() => {
    const foodTariffIds = new Set<string>();
    allActivities.forEach(activity => {
      if (isGardenAttendanceController(activity)) {
        const config = (activity.config as GardenAttendanceConfig) || {};
        (config.food_tariff_ids || []).forEach(id => foodTariffIds.add(id));
      }
    });
    return foodTariffIds.has(enrollment.activity_id);
  }, [allActivities, enrollment.activity_id]);

  // Check if activities data is loaded (might be null for archived activities)
  if (!enrollment.activities) {
    return (
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <span className="text-sm text-muted-foreground">Завантаження даних активності...</span>
      </div>
    );
  }

  const presentRule = enrollment.activities.billing_rules?.present;
  const isMonthlyBilling = !isFoodActivity && (presentRule?.type === 'fixed' || presentRule?.type === 'subscription');
  
  // Initialize deleteIncome hook early to avoid initialization errors
  const deleteIncome = useDeleteIncomeTransaction();
  const createTransaction = useCreateFinanceTransaction();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const accountLabel = useMemo(() => {
    // Приоритет: enrollment.account_id ?? activity.account_id
    const accountId = enrollment.account_id || enrollment.activities.account_id;
    if (!accountId) return 'Без рахунку';
    return accounts.find(account => account.id === accountId)?.name || 'Без рахунку';
  }, [accounts, enrollment.account_id, enrollment.activities.account_id]);

  const baseMonthlyCharge = useMemo(() => {
    if (!isMonthlyBilling) return 0;
    if (enrollment.custom_price !== null && enrollment.custom_price > 0) {
      const discountMultiplier = 1 - ((enrollment.discount_percent || 0) / 100);
      return Math.round(enrollment.custom_price * discountMultiplier * 100) / 100;
    }
    if (presentRule?.rate && presentRule.rate > 0) {
      return presentRule.rate;
    }
    return enrollment.activities.default_price || 0;
  }, [isMonthlyBilling, enrollment.custom_price, enrollment.discount_percent, enrollment.activities.default_price, presentRule?.rate]);

  const monthlyBalanceQuery = useStudentActivityMonthlyBalance(
    studentId,
    enrollment.activity_id,
    baseMonthlyCharge,
    month,
    year
  );

  const regularBalanceQuery = useStudentActivityBalance(
    studentId,
    enrollment.activity_id,
    month,
    year
  );
  
  // Get income transaction for subscription charges (only if monthly billing)
  const incomeTransactionQuery = useActivityIncomeTransaction(
    studentId,
    enrollment.activity_id,
    month,
    year
  );
  
  // For monthly billing, use income transaction if it exists
  // This works even for archived enrollments - we still want to show delete button
  const incomeTransaction = isMonthlyBilling ? incomeTransactionQuery.data : null;
  
  const displayMode =
    enrollment.activities.balance_display_mode ??
    (isFoodActivity ? 'recalculation' : isMonthlyBilling ? 'subscription' : 'recalculation');

  const isLoading = monthlyBalanceQuery.isLoading || regularBalanceQuery.isLoading;
  const monthlyData = monthlyBalanceQuery.data;
  const recalculationData = regularBalanceQuery.data;

  // Extract monthlyCharges outside useMemo so it's available for logging
  const monthlyCharges = monthlyData?.charges ?? 0;

  const combinedData = useMemo(() => {
    // Для подписок: используем только monthlyData (или baseMonthlyCharge если monthlyData отсутствует)
    // Не используем recalculationData для подписок, так как он может содержать данные из другого месяца
    if (displayMode === 'subscription') {
      // Для подписок: используем monthlyData или baseMonthlyCharge
      const payments = monthlyData?.payments ?? 0;
      const refunds = monthlyData?.refunds ?? 0;
      const monthlyChargesLocal = monthlyData?.charges ?? 0;
      // Если есть incomeTransaction, используем monthlyChargesLocal (транзакция существует)
      // Если нет incomeTransaction:
      //   - Для архивных активностей: charges = 0 (транзакция была удалена)
      //   - Для активных активностей: используем baseMonthlyCharge (для будущих месяцев)
      const hasIncomeTransaction = !!incomeTransaction;
      const charges = hasIncomeTransaction 
        ? (monthlyChargesLocal > 0 ? monthlyChargesLocal : baseMonthlyCharge)
        : (enrollment.is_active && baseMonthlyCharge > 0 ? baseMonthlyCharge : 0);
      const balance = payments - charges + refunds;
      return { balance, payments, charges, refunds };
    }

    // Для других режимов: используем стандартную логику
    if (!monthlyData && !recalculationData) return null;
    const payments = recalculationData?.payments ?? monthlyData?.payments ?? 0;
    const refunds = recalculationData?.refunds ?? monthlyData?.refunds ?? 0;
    const monthlyChargesLocal = monthlyData?.charges ?? 0;
    const recalculationCharges = recalculationData?.charges ?? 0;

    let charges = recalculationCharges;
    if (displayMode === 'subscription_and_recalculation') {
      const monthlyCharges = monthlyChargesLocal > 0 ? monthlyChargesLocal : (baseMonthlyCharge > 0 ? baseMonthlyCharge : 0);
      charges = monthlyCharges + recalculationCharges;
    }

    const balance = payments - charges + refunds;
    return { balance, payments, charges, refunds };
  }, [displayMode, monthlyData, recalculationData, monthlyCharges, baseMonthlyCharge, incomeTransaction, enrollment.is_active]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <span className="text-sm text-muted-foreground">Завантаження...</span>
      </div>
    );
  }

  const balance = combinedData?.balance || 0;
  const payments = combinedData?.payments || 0;
  const charges = combinedData?.charges || 0;
  const refunds = combinedData?.refunds || 0;
  
  // Для архивных активностей: скрываем если баланс = 0 и нет транзакций
  // Это позволяет скрывать архивные активности после удаления транзакций
  if (!enrollment.is_active && balance === 0 && payments === 0 && charges === 0 && refunds === 0 && !incomeTransaction) {
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
  
  // For food activity: if there are refunds, balance is always positive (green) for client
  // For other activities: balance can be positive or negative
  const isPositive = isFoodActivity ? (refunds > 0 ? true : balance >= 0) : (balance >= 0);
  
  // Check if we can show delete button for subscription charges
  // For subscription billing, show delete button if:
  // 1. It's monthly billing (fixed or subscription type)
  // 2. There are charges (monthlyCharges > 0) OR there's an income transaction - this means subscription is active
  // We show button even if incomeTransaction doesn't exist - we'll create it on delete
  // This works even for archived enrollments
  // Note: After deletion, monthlyCharges will be 0, so button will disappear
  const hasSubscriptionCharge = isMonthlyBilling && (monthlyCharges > 0 || !!incomeTransaction);
  
  // Debug logging for "Прескул" activity
  if (enrollment.activities.name === 'Прескул' || enrollment.activities.name?.includes('Прескул')) {
    console.log('[Прескул Debug]', {
      activityName: enrollment.activities.name,
      isActive: enrollment.is_active,
      isMonthlyBilling,
      presentRuleType: presentRule?.type,
      hasIncomeTransaction: !!incomeTransaction,
      incomeTransaction: incomeTransaction,
      incomeTransactionQueryLoading: incomeTransactionQuery.isLoading,
      incomeTransactionQueryError: incomeTransactionQuery.error,
      studentId,
      activityId: enrollment.activity_id,
      month,
      year,
      monthlyCharges,
      baseMonthlyCharge,
      hasSubscriptionCharge,
      displayMode,
      billingRules: enrollment.activities.billing_rules,
    });
  }
  
  const handleDeleteClick = () => {
    // Allow deletion for subscription charges even if transaction doesn't exist
    if (hasSubscriptionCharge) {
      setDeleteDialogOpen(true);
    }
  };
  
  const handleDeleteConfirm = async (reason: string) => {
    if (!hasSubscriptionCharge) return;
    
    try {
      let transactionId = incomeTransaction?.id;
      
      // If transaction doesn't exist, create it first
      if (!transactionId) {
        // Get account_id from enrollment or activity
        const accountId = enrollment.account_id || enrollment.activities.account_id || null;
        
        // Create income transaction for subscription charge
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const monthName = new Date(year, month).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
        const createdTransaction = await createTransaction.mutateAsync({
          type: 'income',
          student_id: studentId,
          activity_id: enrollment.activity_id,
          amount: baseMonthlyCharge,
          date: startDate,
          description: `Абонплата за ${monthName}`,
          account_id: accountId,
        });
        
        transactionId = createdTransaction.id;
        
        // Wait a bit for the transaction to be fully created and queries to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Delete the transaction
      await deleteIncome.mutateAsync({
        transactionId: transactionId!,
        reason,
      });
      
      toast({
        title: 'Успішно',
        description: 'Нарахування видалено',
      });
      setDeleteDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Помилка',
        description: error.message || 'Не вдалося видалити нарахування',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2 p-3 border rounded-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: enrollment.activities.color }}
          />
          <span className="text-sm font-medium break-words">
            {isFoodActivity ? `+ ${enrollment.activities.name}` : enrollment.activities.name}
          </span>
          <span className="rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {accountLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-left sm:text-right">
            <div className={cn(
              "text-sm font-semibold",
              isPositive ? "text-success" : "text-destructive"
            )}>
              {displayBalance > 0 ? '+' : ''}{formatCurrency(Math.abs(displayBalance))}
            </div>
            <div className="text-xs text-muted-foreground whitespace-normal break-words">
              {isFoodActivity ? (
                <>Оплати: {formatCurrency(payments)} | Повернення: {formatCurrency(displayRefunds)}</>
              ) : (
                <>Оплати: {formatCurrency(payments)} | Витрати: {formatCurrency(displayCharges)}</>
              )}
            </div>
          </div>
          {canDelete && hasSubscriptionCharge && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
              onClick={handleDeleteClick}
              disabled={deleteIncome.isPending || createTransaction.isPending}
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
          amount={incomeTransaction?.amount || baseMonthlyCharge}
          isLoading={deleteIncome.isPending || createTransaction.isPending}
        />
      )}
    </>
  );
}
