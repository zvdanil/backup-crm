import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PaymentAccount, PaymentAccountInsert } from '@/hooks/usePaymentAccounts';

const accountSchema = z.object({
  name: z.string().min(2, 'Мінімум 2 символи').max(100),
  description: z.string().max(500).optional(),
  details: z.string().max(2000).optional(),
  is_active: z.boolean().optional(),
});

type AccountFormData = z.infer<typeof accountSchema>;

interface PaymentAccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: PaymentAccountInsert) => void;
  initialData?: PaymentAccount;
  isLoading?: boolean;
}

export function PaymentAccountForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isLoading,
}: PaymentAccountFormProps) {
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      description: '',
      details: '',
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: initialData?.name || '',
        description: initialData?.description || '',
        details: initialData?.details || '',
        is_active: initialData?.is_active ?? true,
      });
    }
  }, [open, initialData, reset]);

  const isActive = watch('is_active');

  const handleFormSubmit = (data: AccountFormData) => {
    onSubmit({
      name: data.name,
      description: data.description || null,
      details: data.details || null,
      is_active: data.is_active ?? true,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Редагувати рахунок' : 'Новий рахунок'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Назва *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Приват / Моно / Наличные"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Опис</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Додаткова інформація..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">Реквізити</Label>
            <Textarea
              id="details"
              {...register('details')}
              placeholder="IBAN, отримувач, призначення платежу..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Реквізити для оплати, які будуть відображатися в кабінеті батьків
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label className="text-sm">Активний рахунок</Label>
              <p className="text-xs text-muted-foreground">Неактивні ховаються з вибору</p>
            </div>
            <Switch checked={!!isActive} onCheckedChange={(value) => setValue('is_active', value)} />
          </div>

          <div className="flex justify-end gap-3 pt-4">
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
