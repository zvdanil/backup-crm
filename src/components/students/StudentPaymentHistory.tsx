import {
  useFinanceTransactions,
  useDeletePaymentTransaction,
  useUpdateFinanceTransaction,
} from "@/hooks/useFinanceTransactions";
import { formatCurrency, formatDate, getMonthStartDate } from "@/lib/attendance";
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
import { cn } from "@/lib/utils";
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

interface StudentPaymentHistoryProps {
  studentId: string;
  month?: number;
  year?: number;
  title?: string;
}

export function StudentPaymentHistory({
  studentId,
  month,
  year,
  title = "Історія оплат",
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
                    <div className="mt-1 text-xs text-muted-foreground break-words">
                      {payment.description || "—"}
                    </div>
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
                <TableHead>Опис</TableHead>
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
                    <TableCell className="text-sm text-muted-foreground">
                      {payment.description || "—"}
                    </TableCell>
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

      {payments.length > 0 && (
        <div className="pt-2 border-t space-y-2">
          {totalsByAccount.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              {totalsByAccount.map(({ accountId, accountName, amount }) => (
                <div key={accountId ?? 'none'}>
                  <span className="text-muted-foreground">{accountName}:</span>{' '}
                  <span className="font-medium text-success">+{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
        </>
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
