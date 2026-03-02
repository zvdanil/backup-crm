import {
  useFinanceTransactions,
  useDeletePaymentTransaction,
  useUpdateFinanceTransaction,
  usePaymentAllocation,
} from "@/hooks/useFinanceTransactions";
import { formatCurrency, formatDate, getMonthStartDate } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { usePaymentAccounts } from "@/hooks/usePaymentAccounts";
import {
  useAccountOpeningBalancesForMonth,
  useCreateAccountOpeningBalance,
  useUpdateAccountOpeningBalance,
  useDeleteAccountOpeningBalance,
  type AccountOpeningBalance,
} from "@/hooks/useAccountOpeningBalances";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet, Trash2, Pencil, Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/context/AuthContext";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { DeleteTransactionDialog } from "./DeleteTransactionDialog";
import {
  EditPaymentDialog,
  type PaymentToEdit,
} from "./EditPaymentDialog";
import { AccountOpeningBalanceDialog } from "./AccountOpeningBalanceDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

const MONTHS_TITLE = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

/** Один блок «Розподіл по послугах» для одного рахунку (викликає usePaymentAllocation з accountId) */
function AllocationBlockForAccount({
  studentId,
  month,
  year,
  accountId,
  accountName,
  excludeActivityIds,
}: {
  studentId: string;
  month: number;
  year: number;
  accountId: string;
  accountName: string;
  excludeActivityIds: string[];
}) {
  const { data: allocationData } = usePaymentAllocation({
    studentId,
    month,
    year,
    accountId,
    excludeActivityIds,
  });
  const currentMonth = month;
  const currentYear = year;
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const items = allocationData?.items ?? [];
  const byMonth = new Map<string, typeof items>();
  items.forEach((item) => {
    const key = `${item.year}-${item.month}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(item);
  });
  const order: { year: number; month: number }[] = [
    { year: currentYear, month: currentMonth },
    { year: prevYear, month: prevMonth },
  ];
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-muted-foreground">
        Розподіл по послугах ({accountName})
      </div>
      <div className="text-xs space-y-3">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-1">
            Немає нарахувань за поточний та попередній місяць
          </p>
        ) : (
          <>
            {order.map(({ year: y, month: m }) => {
              const key = `${y}-${m}`;
              const monthItems = byMonth.get(key);
              if (!monthItems?.length) return null;
              const monthTitle = `${MONTHS_TITLE[m]} ${y}`;
              return (
                <div key={key} className="space-y-1">
                  <div className="font-medium text-muted-foreground pb-0.5">
                    {monthTitle}
                  </div>
                  {monthItems
                    .sort((a, b) => (a.remainder > 0 ? 1 : 0) - (b.remainder > 0 ? 1 : 0))
                    .map((item) => {
                      const isPaid = item.remainder <= 0;
                      const isPartial = item.paid > 0 && item.remainder > 0;
                      return (
                        <div
                          key={`${item.activityId}-${item.accountId ?? "none"}-${item.year}-${item.month}`}
                          className={cn(
                            "flex justify-between gap-2 py-0.5 pl-2",
                            isPaid && "text-success",
                            isPartial && "text-muted-foreground",
                            !isPaid && !isPartial && "text-destructive",
                          )}
                        >
                          <span>{item.activityName}</span>
                          <span>
                            {isPaid && `оплачено ${formatCurrency(item.paid)}`}
                            {isPartial &&
                              `оплачено ${formatCurrency(item.paid)}, борг ${formatCurrency(item.remainder)}`}
                            {!isPaid && !isPartial && `борг ${formatCurrency(item.remainder)}`}
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            })}
            {allocationData && allocationData.totalRemaining > 0 && (
              <div className="flex justify-between gap-2 py-0.5 pt-1 border-t border-border font-medium text-destructive">
                <span>Всього борг по послугах</span>
                <span>{formatCurrency(allocationData.totalRemaining)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface StudentPaymentHistoryProps {
  studentId: string;
  month?: number;
  year?: number;
  title?: string;
  /** Activity IDs to exclude (e.g. controller activity) — same as in balance display */
  excludeActivityIds?: string[];
  /** Рахунки для розподілу окремо по кожному (з «Баланс по рахунках»). Якщо передано — показуємо блок по кожному рахунку окремо */
  accountIds?: string[];
  accountLabelMap?: Map<string, string> | Record<string, string>;
}

export function StudentPaymentHistory({
  studentId,
  month,
  year,
  title = "Історія оплат",
  excludeActivityIds = [],
  accountIds,
  accountLabelMap,
}: StudentPaymentHistoryProps) {
  const { data: payments = [], isLoading } = useFinanceTransactions({
    studentId,
    type: "payment",
    month,
    year,
  });
  const { data: accounts = [] } = usePaymentAccounts();
  const { data: balancesForMonth = [] } = useAccountOpeningBalancesForMonth(studentId, month, year);
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const deletePayment = useDeletePaymentTransaction();
  const updatePayment = useUpdateFinanceTransaction();
  const createBalance = useCreateAccountOpeningBalance();
  const updateBalance = useUpdateAccountOpeningBalance();
  const deleteBalance = useDeleteAccountOpeningBalance();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [editingBalance, setEditingBalance] = useState<AccountOpeningBalance | null>(null);
  const [deleteBalanceDialogOpen, setDeleteBalanceDialogOpen] = useState(false);
  const [balanceToDelete, setBalanceToDelete] = useState<AccountOpeningBalance | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<{
    id: string;
    amount: number;
  } | null>(null);
  const [paymentToEdit, setPaymentToEdit] = useState<PaymentToEdit | null>(null);

  const monthNum = month ?? new Date().getMonth();
  const yearNum = year ?? new Date().getFullYear();
  const canViewAllocation = role !== "parent";
  const canViewPaymentDescription = role !== "parent";

  const { data: allocationData } = usePaymentAllocation({
    studentId,
    month: monthNum,
    year: yearNum,
    excludeActivityIds,
    enabled: canViewAllocation,
  });

  // Рахунки для блоків «Розподіл по послугах»: з балансів (пропс) + усі, по яких є оплати в цьому місяці
  const displayAccountIds = useMemo(() => {
    const fromPayments = [
      ...new Set((payments || []).map((p) => p.account_id).filter(Boolean)),
    ] as string[];
    if ((accountIds?.length ?? 0) > 0)
      return [...new Set([...accountIds, ...fromPayments])];
    return fromPayments.length > 0 ? fromPayments : undefined;
  }, [accountIds, payments]);

  const usePerAccountAllocation = canViewAllocation && (displayAccountIds?.length ?? 0) > 0;
  const hasAnyAllocation =
    (canViewAllocation && allocationData && allocationData.items.length > 0) ||
    (usePerAccountAllocation && (displayAccountIds?.length ?? 0) > 0);
  const canEdit = role === "owner" || role === "admin" || role === "accountant";
  const canDelete = canEdit;
  const showBalanceSection = canEdit && month != null && year != null;

  const handleAddBalanceClick = () => {
    setEditingBalance(null);
    setBalanceDialogOpen(true);
  };

  const handleEditBalanceClick = (b: AccountOpeningBalance) => {
    setEditingBalance(b);
    setBalanceDialogOpen(true);
  };

  const handleBalanceSubmit = async (data: {
    account_id: string;
    amount: number;
    notes?: string | null;
  }) => {
    if (month == null || year == null) return;
    const balanceDate = getMonthStartDate(year, month);
    if (editingBalance) {
      await updateBalance.mutateAsync({
        id: editingBalance.id,
        amount: data.amount,
        notes: data.notes ?? null,
      });
    } else {
      await createBalance.mutateAsync({
        student_id: studentId,
        account_id: data.account_id,
        balance_date: balanceDate,
        amount: data.amount,
        notes: data.notes ?? null,
      });
    }
    setBalanceDialogOpen(false);
    setEditingBalance(null);
  };

  const handleDeleteBalanceClick = (b: AccountOpeningBalance) => {
    setBalanceToDelete(b);
    setDeleteBalanceDialogOpen(true);
  };

  const handleDeleteBalanceConfirm = async () => {
    if (!balanceToDelete) return;
    await deleteBalance.mutateAsync(balanceToDelete.id);
    setDeleteBalanceDialogOpen(false);
    setBalanceToDelete(null);
  };

  const handleEditClick = (payment: PaymentToEdit) => {
    setPaymentToEdit(payment);
    setEditDialogOpen(true);
  };

  const handleEditConfirm = async (data: {
    amount: number;
    date: string;
    account_id: string | null;
    description: string | null;
  }) => {
    if (!paymentToEdit) return;

    try {
      await updatePayment.mutateAsync({
        id: paymentToEdit.id,
        amount: data.amount,
        date: data.date,
        account_id: data.account_id,
        description: data.description,
      });
      toast({
        title: "Успішно",
        description: "Платіж оновлено",
      });
      setEditDialogOpen(false);
      setPaymentToEdit(null);
    } catch (error: any) {
      toast({
        title: "Помилка",
        description: error.message || "Не вдалося оновити платіж",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (paymentId: string, amount: number) => {
    setSelectedPayment({ id: paymentId, amount });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async (reason: string) => {
    if (!selectedPayment) return;

    try {
      await deletePayment.mutateAsync({
        transactionId: selectedPayment.id,
        reason,
      });
      toast({
        title: "Успішно",
        description: "Платіж видалено",
      });
      setDeleteDialogOpen(false);
      setSelectedPayment(null);
    } catch (error: any) {
      toast({
        title: "Помилка",
        description: error.message || "Не вдалося видалити платіж",
        variant: "destructive",
      });
    }
  };

  const totalsByAccount = useMemo(() => {
    const map = new Map<string | null, number>();
    payments.forEach((p) => {
      const key = p.account_id ?? null;
      const current = map.get(key) ?? 0;
      map.set(key, current + (p.amount || 0));
    });
    return Array.from(map.entries())
      .map(([accountId, amount]) => ({
        accountId,
        accountName: accountId
          ? accounts.find((a) => a.id === accountId)?.name ?? accountId
          : 'Без рахунку',
        amount,
      }))
      .filter((x) => x.amount !== 0)
      .sort((a, b) => b.amount - a.amount);
  }, [payments, accounts]);

  return (
    <div className="space-y-4">
      {/* Header with +остаток (top left) when canEdit and month/year */}
      <div className="flex items-center gap-2 mb-4">
        {showBalanceSection && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddBalanceClick}
            className="shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" />
            залишок
          </Button>
        )}
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>

      {/* Opening balances for the month */}
      {showBalanceSection && balancesForMonth.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm mb-4">
          {balancesForMonth.map((b) => {
            const accountName = accounts.find((a) => a.id === b.account_id)?.name ?? b.account_id;
            return (
              <div
                key={b.id}
                className={cn(
                  "inline-flex flex-col gap-0.5 px-2 py-1 rounded",
                  b.amount >= 0 ? "bg-muted" : "bg-destructive/10"
                )}
              >
                <div className="flex items-center gap-1">
                  <span>
                    {accountName}: {b.amount >= 0 ? "" : "−"} {formatCurrency(Math.abs(b.amount))}
                  </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => handleEditBalanceClick(b)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => handleDeleteBalanceClick(b)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
                </div>
                {b.notes && (
                  <span className="text-xs text-muted-foreground">{b.notes}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Payment content */}
      {isLoading ? (
        <div className="p-4 text-center text-sm text-muted-foreground">
          Завантаження...
        </div>
      ) : payments.length === 0 ? (
        <div className="p-8 text-center">
          <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <p className="text-sm text-muted-foreground">Немає оплат</p>
        </div>
      ) : (
        <>
      {isMobile ? (
        <div className="space-y-3">
          {payments.map((payment) => {
            const account = payment.account_id
              ? accounts.find((a) => a.id === payment.account_id)
              : null;

            return (
              <div key={payment.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">
                      {formatDate(payment.date)}
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {account ? (
                        <span className="break-words">{account.name}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                    {canViewPaymentDescription && (
                      <div className="mt-1 text-xs text-muted-foreground break-words">
                        {payment.description || "—"}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className={cn("font-semibold", "text-success")}>
                        +{formatCurrency(payment.amount || 0)}
                      </span>
                    </div>
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          onClick={() =>
                            handleEditClick({
                              id: payment.id,
                              amount: payment.amount || 0,
                              date: payment.date,
                              account_id: payment.account_id,
                              description: payment.description,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            handleDeleteClick(payment.id, payment.amount || 0)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Рахунок</TableHead>
                {canViewPaymentDescription && <TableHead>Опис</TableHead>}
                <TableHead className="text-right">Сума</TableHead>
                {canEdit && <TableHead className="w-[90px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => {
                const account = payment.account_id
                  ? accounts.find((a) => a.id === payment.account_id)
                  : null;

                return (
                  <TableRow key={payment.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(payment.date)}
                    </TableCell>
                    <TableCell>
                      {account ? (
                        <span className="text-sm">{account.name}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {canViewPaymentDescription && (
                      <TableCell className="text-sm text-muted-foreground">
                        {payment.description || "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <span className={cn("font-semibold", "text-success")}>
                        +{formatCurrency(payment.amount || 0)}
                      </span>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={() =>
                              handleEditClick({
                                id: payment.id,
                                amount: payment.amount || 0,
                                date: payment.date,
                                account_id: payment.account_id,
                                description: payment.description,
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              handleDeleteClick(payment.id, payment.amount || 0)
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
        </>
      )}

      {(payments.length > 0 || hasAnyAllocation) && (
        <div className="pt-2 border-t space-y-3">
          {payments.length > 0 && totalsByAccount.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              {totalsByAccount.map(({ accountId, accountName, amount }) => (
                <div key={accountId ?? "none"}>
                  <span className="text-muted-foreground">{accountName}:</span>{" "}
                  <span className="font-medium text-success">+{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
          )}
          {canViewAllocation &&
            (usePerAccountAllocation && displayAccountIds?.length
              ? displayAccountIds.map((aid) => (
                  <AllocationBlockForAccount
                    key={aid}
                    studentId={studentId}
                    month={monthNum}
                    year={yearNum}
                    accountId={aid}
                    accountName={
                      (accountLabelMap && (accountLabelMap instanceof Map ? accountLabelMap.get(aid) : accountLabelMap[aid]))
                      ?? accounts.find((a) => a.id === aid)?.name
                      ?? aid
                    }
                    excludeActivityIds={excludeActivityIds}
                  />
                ))
              : allocationData && allocationData.items.length > 0 && (() => {
                  const currentMonth = monthNum;
                  const currentYear = yearNum;
                  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
                  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
                  const byMonth = new Map<string, typeof allocationData.items>();
                  allocationData.items.forEach((item) => {
                    const key = `${item.year}-${item.month}`;
                    if (!byMonth.has(key)) byMonth.set(key, []);
                    byMonth.get(key)!.push(item);
                  });
                  const order: { year: number; month: number }[] = [
                    { year: currentYear, month: currentMonth },
                    { year: prevYear, month: prevMonth },
                  ];
                  return (
                    <div className="space-y-1.5">
                      <div className="text-sm font-medium text-muted-foreground">
                        Розподіл по послугах
                      </div>
                      <div className="text-xs space-y-3">
                        {order.map(({ year: y, month: m }) => {
                          const key = `${y}-${m}`;
                          const items = byMonth.get(key);
                          if (!items?.length) return null;
                          const monthTitle = `${MONTHS_TITLE[m]} ${y}`;
                          return (
                            <div key={key} className="space-y-1">
                              <div className="font-medium text-muted-foreground pb-0.5">
                                {monthTitle}
                              </div>
                              {items
                                .sort((a, b) => (a.remainder > 0 ? 1 : 0) - (b.remainder > 0 ? 1 : 0))
                                .map((item) => {
                                  const isPaid = item.remainder <= 0;
                                  const isPartial = item.paid > 0 && item.remainder > 0;
                                  return (
                                    <div
                                      key={`${item.activityId}-${item.accountId ?? "none"}-${item.year}-${item.month}`}
                                      className={cn(
                                        "flex justify-between gap-2 py-0.5 pl-2",
                                        isPaid && "text-success",
                                        isPartial && "text-muted-foreground",
                                        !isPaid && !isPartial && "text-destructive",
                                      )}
                                    >
                                      <span>{item.activityName}</span>
                                      <span>
                                        {isPaid && `оплачено ${formatCurrency(item.paid)}`}
                                        {isPartial &&
                                          `оплачено ${formatCurrency(item.paid)}, борг ${formatCurrency(item.remainder)}`}
                                        {!isPaid && !isPartial && `борг ${formatCurrency(item.remainder)}`}
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                          );
                        })}
                        {allocationData.totalRemaining > 0 && (
                          <div className="flex justify-between gap-2 py-0.5 pt-1 border-t border-border font-medium text-destructive">
                            <span>Всього борг по послугах</span>
                            <span>{formatCurrency(allocationData.totalRemaining)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })())}
        </div>
      )}

      {selectedPayment && (
        <DeleteTransactionDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteConfirm}
          transactionType="payment"
          amount={selectedPayment.amount}
          isLoading={deletePayment.isPending}
        />
      )}

      {showBalanceSection && month != null && year != null && (
        <AccountOpeningBalanceDialog
          open={balanceDialogOpen}
          onOpenChange={(open) => {
            setBalanceDialogOpen(open);
            if (!open) setEditingBalance(null);
          }}
          month={month}
          year={year}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          editingBalance={editingBalance}
          onSubmit={handleBalanceSubmit}
          isLoading={createBalance.isPending || updateBalance.isPending}
        />
      )}

      {balanceToDelete && (
        <AlertDialog open={deleteBalanceDialogOpen} onOpenChange={(open) => {
          setDeleteBalanceDialogOpen(open);
          if (!open) setBalanceToDelete(null);
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Видалити залишок?</AlertDialogTitle>
              <AlertDialogDescription>
                Залишок на {formatCurrency(balanceToDelete.amount)} буде видалено.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Скасувати</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteBalanceConfirm();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Видалити
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <EditPaymentDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        payment={paymentToEdit}
        onSubmit={handleEditConfirm}
        isLoading={updatePayment.isPending}
      />
    </div>
  );
}
