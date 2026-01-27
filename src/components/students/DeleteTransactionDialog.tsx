import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface DeleteTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  transactionType: 'payment' | 'income';
  amount: number;
  isLoading?: boolean;
}

export function DeleteTransactionDialog({
  open,
  onOpenChange,
  onConfirm,
  transactionType,
  amount,
  isLoading = false,
}: DeleteTransactionDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (!reason.trim()) {
      return; // Reason is required
    }
    onConfirm(reason.trim());
    setReason(''); // Reset after confirmation
  };

  const handleCancel = () => {
    setReason('');
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Видалити {transactionType === 'payment' ? 'платіж' : 'нарахування'}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Ви впевнені, що хочете видалити {transactionType === 'payment' ? 'платіж' : 'нарахування'} на суму {amount} ₴?
            {transactionType === 'payment' && ' Це також відкотить автоматичне розподілення по заборгованостях.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Причина видалення *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Вкажіть причину видалення..."
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Обов'язково вкажіть причину видалення для аудиту
            </p>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isLoading}>
            Скасувати
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!reason.trim() || isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? 'Видалення...' : 'Видалити'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
