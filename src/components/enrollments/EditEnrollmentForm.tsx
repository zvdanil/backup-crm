import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/attendance';

const editEnrollmentSchema = z.object({
  custom_price: z.string().optional(),
  discount_percent: z.string().optional(),
  effective_from: z.string().optional(),
});

type EditEnrollmentFormData = z.infer<typeof editEnrollmentSchema>;

interface EditEnrollmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { custom_price: number | null; discount_percent: number; effective_from: string | null }) => void;
  activityName: string;
  initialCustomPrice: number | null;
  initialDiscount: number | null;
  initialEffectiveFrom: string | null;
  isLoading?: boolean;
}

export function EditEnrollmentForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  activityName,
  initialCustomPrice,
  initialDiscount,
  initialEffectiveFrom,
  isLoading,
}: EditEnrollmentFormProps) {
  const { register, handleSubmit, reset } = useForm<EditEnrollmentFormData>({
    resolver: zodResolver(editEnrollmentSchema),
    defaultValues: {
      custom_price: '',
      discount_percent: '0',
      effective_from: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        custom_price: initialCustomPrice?.toString() || '',
        discount_percent: initialDiscount?.toString() || '0',
        effective_from: initialEffectiveFrom || new Date().toISOString().split('T')[0],
      });
    }
  }, [open, initialCustomPrice, initialDiscount, initialEffectiveFrom, reset]);

  const handleFormSubmit = (data: EditEnrollmentFormData) => {
    onSubmit({
      custom_price: data.custom_price ? parseFloat(data.custom_price) : null,
      discount_percent: data.discount_percent ? parseFloat(data.discount_percent) : 0,
      effective_from: data.effective_from || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Редагувати параметри</DialogTitle>
          <p className="text-sm text-muted-foreground">{activityName}</p>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <p className="text-muted-foreground">
              Ціни встановлюються в правилах розрахунку активності (billing_rules) та відображаються в журналі.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom_price">Індивідуальна ціна (₴)</Label>
            <Input
              id="custom_price"
              type="number"
              {...register('custom_price')}
              placeholder="Залиште порожнім для стандартної"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="discount_percent">Знижка (%)</Label>
            <Input
              id="discount_percent"
              type="number"
              min="0"
              max="100"
              {...register('discount_percent')}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="effective_from">Дата початку нової ціни</Label>
            <Input
              id="effective_from"
              type="date"
              {...register('effective_from')}
            />
            <p className="text-xs text-muted-foreground">
              Нова ціна застосовується до занять з вказаної дати
            </p>
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
