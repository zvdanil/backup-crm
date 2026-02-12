import {
  useFinanceTransactions,
  useDeletePaymentTransaction,
  useUpdateFinanceTransaction,
} from "@/hooks/useFinanceTransactions";
import { formatCurrency, formatDate } from "@/lib/attendance";
import { usePaymentAccounts } from "@/hooks/usePaymentAccounts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Wallet, Trash2, Pencil } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeleteTransactionDialog } from "./DeleteTransactionDialog";
import {
  EditPaymentDialog,
  type PaymentToEdit,
} from "./EditPaymentDialog";
import { toast } from "@/hooks/use-toast";

interface StudentPaymentHistoryProps {
  studentId: string;
  month?: number;
  year?: number;
}

export function StudentPaymentHistory({
  studentId,
  month,
  year,
}: StudentPaymentHistoryProps) {
  const { data: payments = [], isLoading } = useFinanceTransactions({
    studentId,
    type: "payment",
    month,
    year,
  });
  const { data: accounts = [] } = usePaymentAccounts();
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const deletePayment = useDeletePaymentTransaction();
  const updatePayment = useUpdateFinanceTransaction();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<{
    id: string;
    amount: number;
  } | null>(null);
  const [paymentToEdit, setPaymentToEdit] = useState<PaymentToEdit | null>(null);

  const canEdit = role === "owner" || role === "admin";
  const canDelete = canEdit;

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

  if (isLoading) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Завантаження...
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="p-8 text-center">
        <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
        <p className="text-sm text-muted-foreground">Немає оплат</p>
      </div>
    );
  }

  // Calculate total
  const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-4">
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
        <div className="flex justify-end pt-2 border-t">
          <div className="text-sm">
            <span className="text-muted-foreground mr-2">Всього:</span>
            <span className="font-semibold text-success">
              +{formatCurrency(total)}
            </span>
          </div>
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
