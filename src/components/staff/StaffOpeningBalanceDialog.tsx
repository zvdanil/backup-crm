import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { StaffOpeningBalance } from '@/hooks/useStaffOpeningBalances';

const formSchema = z.object({
  amount: z.string().min(1, 'Вкажіть суму'),
});

type FormData = z.infer<typeof formSchema>;

interface StaffOpeningBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: number;
  year: number;
  editingBalance: StaffOpeningBalance | null;
  onSubmit: (data: { amount: number }) => Promise<void>;
  isLoading?: boolean;
}

const MONTH_NAMES = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

export function StaffOpeningBalanceDialog({
  open,
  onOpenChange,
  month,
  year,
  editingBalance,
  onSubmit,
  isLoading = false,
}: StaffOpeningBalanceDialogProps) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        amount: editingBalance ? String(editingBalance.amount) : '',
      });
    }
  }, [open, editingBalance, reset]);

  const handleFormSubmit = async (data: FormData) => {
    await onSubmit({ amount: parseFloat(data.amount) });
    onOpenChange(false);
  };

  const dateLabel = `${MONTH_NAMES[month]} ${year}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingBalance ? 'Редагувати залишок' : 'Додати залишок'} на {dateLabel}
          </DialogTitle>
          <DialogDescription>
            {editingBalance ? 'Змініть суму залишку на вибрану дату.' : 'Вкажіть суму корекції балансу на 1-ше число місяця.'}
            {' '}Корекція не впливає на стан рахунків.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Сума (₴) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...register('amount')}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">Може бути відʼємною (борг педагога)</p>
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 pb-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Збереження...' : 'Зберегти'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
