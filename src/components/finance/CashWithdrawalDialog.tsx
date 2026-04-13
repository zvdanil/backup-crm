import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/attendance';
import type { PaymentAccount } from '@/hooks/usePaymentAccounts';

export interface CashWithdrawalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: {
    id: string;
    amount: number;
    date: string;
    description?: string | null;
    account_id?: string | null;
  } | null;
  accounts: PaymentAccount[];
  defaultCashAccountId?: string | null;
  onSubmit: (payload: {
    expenseTransactionId: string;
    cashAccountId: string;
    commissionPercent: number;
    creditedAmount: number;
  }) => Promise<void>;
  isSaving: boolean;
}

export function CashWithdrawalDialog({
  open,
  onOpenChange,
  transaction,
  accounts,
  defaultCashAccountId,
  onSubmit,
  isSaving,
}: CashWithdrawalDialogProps) {
  const initialAmount = transaction?.amount ?? 0;
  const [commissionPercent, setCommissionPercent] = useState('0');
  const [creditedAmount, setCreditedAmount] = useState(initialAmount.toFixed(2));
  const [cashAccountId, setCashAccountId] = useState(defaultCashAccountId || 'none');

  useEffect(() => {
    if (open && transaction) {
      setCommissionPercent('0');
      setCreditedAmount(transaction.amount.toFixed(2));
      setCashAccountId(defaultCashAccountId || 'none');
    }
  }, [open, transaction, defaultCashAccountId]);

  useEffect(() => {
    if (!open || !transaction) return;
    const percent = Number(commissionPercent);
    if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
      const computed = Math.round((transaction.amount * (1 - percent / 100)) * 100) / 100;
      if (String(computed.toFixed(2)) !== creditedAmount) {
        setCreditedAmount(computed.toFixed(2));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commissionPercent]);

  const handleSubmit = async () => {
    if (!transaction) return;
    if (cashAccountId === 'none') {
      return;
    }
    const credited = Number(creditedAmount);
    const percent = Number(commissionPercent);
    if (!Number.isFinite(credited) || credited < 0 || credited > transaction.amount) {
      return;
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return;
    }
    try {
      await onSubmit({
        expenseTransactionId: transaction.id,
        cashAccountId,
        commissionPercent: percent,
        creditedAmount: Math.round(credited * 100) / 100,
      });
      onOpenChange(false);
    } catch {
      // Ошибка уже показывается в хуке
    }
  };

  const commissionAmount = transaction
    ? Math.round((transaction.amount - Number(creditedAmount)) * 100) / 100
    : 0;
  const recipientText = transaction?.description ? transaction.description : 'отримувача витрати';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Вивести кошти</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Сума витрати</Label>
            <div className="mt-1 text-base font-semibold">{formatCurrency(transaction?.amount || 0)}</div>
          </div>

          <div className="space-y-2">
            <Label>Рахунок для зарахування</Label>
            <Select value={cashAccountId} onValueChange={setCashAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Оберіть рахунок" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Оберіть рахунок</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Комісія (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Зарахувати</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={creditedAmount}
                onChange={(e) => setCreditedAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted p-4 text-sm">
            <div>Комісія становить {formatCurrency(commissionAmount)}.</div>
            <div>Комісія залишилась у {recipientText}.</div>
          </div>
        </div>

        <DialogFooter>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Скасувати</Button>
            <Button onClick={handleSubmit} disabled={isSaving || cashAccountId === 'none'}>
              {isSaving ? 'Зберігаю...' : 'Підтвердити'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
