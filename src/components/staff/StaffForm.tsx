import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Staff, StaffInsert } from '@/hooks/useStaff';

const staffSchema = z.object({
  full_name: z.string().min(2, 'Мінімум 2 символи').max(100),
  position: z.string().min(1, 'Вкажіть посаду').max(100),
  accrual_mode: z.enum(['auto', 'manual']),
});

type StaffFormData = z.infer<typeof staffSchema>;

interface StaffFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: StaffInsert) => void;
  initialData?: Staff;
  isLoading?: boolean;
}

export function StaffForm({ open, onOpenChange, onSubmit, initialData, isLoading }: StaffFormProps) {
  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      full_name: '',
      position: '',
      accrual_mode: 'auto',
    },
  });

  // Reset form when initialData changes
  useEffect(() => {
    if (open) {
      reset({
        full_name: initialData?.full_name || '',
        position: initialData?.position || '',
        accrual_mode: initialData?.accrual_mode || 'auto',
      });
    }
  }, [open, initialData, reset]);

  const handleFormSubmit = (data: StaffFormData) => {
    onSubmit({
      full_name: data.full_name,
      position: data.position,
      is_active: true,
      deductions: null,
      accrual_mode: data.accrual_mode,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Редагувати співробітника' : 'Новий співробітник'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">ПІБ *</Label>
            <Input
              id="full_name"
              {...register('full_name')}
              placeholder="Іванов Іван Іванович"
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="position">Посада *</Label>
            <Input
              id="position"
              {...register('position')}
              placeholder="Педагог"
            />
            {errors.position && (
              <p className="text-sm text-destructive">{errors.position.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="accrual_mode">Режим нарахування</Label>
            <Select
              value={watch('accrual_mode')}
              onValueChange={(value) => setValue('accrual_mode', value as 'auto' | 'manual')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Виберіть режим" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Автоматичне (з журналу відвідуваності)</SelectItem>
                <SelectItem value="manual">Ручне (в журналі витрат)</SelectItem>
              </SelectContent>
            </Select>
            {errors.accrual_mode && (
              <p className="text-sm text-destructive">{errors.accrual_mode.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Для ручного режиму ставки налаштовуються в картці співробітника (вкладка "Ставки для ручного режиму")
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
