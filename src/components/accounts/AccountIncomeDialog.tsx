import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateFinanceTransaction,
  useUpdateFinanceTransaction,
  useDeleteFinanceTransaction,
} from '@/hooks/useFinanceTransactions';
import type { FinanceTransaction } from '@/hooks/useFinanceTransactions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';

export const ACCOUNT_INCOME_CATEGORY = 'account_income';

interface AccountIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  transaction?: FinanceTransaction | null;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function AccountIncomeDialog({
  open,
  onOpenChange,
  accountId,
  transaction,
}: AccountIncomeDialogProps) {
  const isEdit = !!transaction;
  const queryClient = useQueryClient();
  const createTx = useCreateFinanceTransaction();
  const updateTx = useUpdateFinanceTransaction();
  const deleteTx = useDeleteFinanceTransaction();

  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(transaction?.date ?? todayStr());
      setAmount(transaction ? String(Math.abs(Number(transaction.amount))) : '');
      setDescription(transaction?.description ?? '');
    }
  }, [open, transaction]);

  const invalidateAccount = () => {
    queryClient.invalidateQueries({ queryKey: ['account_balance', accountId] });
    queryClient.invalidateQueries({ queryKey: ['account_transactions', accountId] });
  };

  const isLoading = createTx.isPending || updateTx.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount.replace(',', '.'));
    if (!date || isNaN(amountNum) || amountNum <= 0) return;

    try {
      if (isEdit && transaction) {
        await updateTx.mutateAsync({
          id: transaction.id,
          date,
          amount: amountNum,
          description: description.trim() || null,
        });
      } else {
        await createTx.mutateAsync({
          type: 'payment',
          account_id: accountId,
          amount: amountNum,
          date,
          description: description.trim() || null,
          category: ACCOUNT_INCOME_CATEGORY,
          student_id: null,
          activity_id: null,
          staff_id: null,
        });
      }
      invalidateAccount();
      onOpenChange(false);
    } catch {
      // handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!transaction) return;
    try {
      await deleteTx.mutateAsync(transaction.id);
      invalidateAccount();
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    } catch {
      // handled by mutation
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? 'Редагувати надходження' : 'Додати надходження'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="income-date">Дата</Label>
                <Input
                  id="income-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="income-amount">Сума</Label>
                <Input
                  id="income-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="income-description">Опис</Label>
                <Textarea
                  id="income-description"
                  placeholder="Джерело або призначення надходження..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              {isEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mr-auto text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleteTx.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Скасувати
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Збереження...' : isEdit ? 'Зберегти' : 'Додати'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити надходження?</AlertDialogTitle>
            <AlertDialogDescription>
              Запис буде видалено, баланс рахунку зміниться відповідно. Цю дію
              не можна скасувати.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ні</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Так, видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
