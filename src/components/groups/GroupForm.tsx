import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Group, GroupInsert } from '@/hooks/useGroups';

const groupSchema = z.object({
  name: z.string().min(2, 'Мінімум 2 символи').max(100),
  color: z.string(),
  description: z.string().max(500).optional(),
});

type GroupFormData = z.infer<typeof groupSchema>;

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

interface GroupFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: GroupInsert) => void;
  initialData?: Group;
  isLoading?: boolean;
}

export function GroupForm({ open, onOpenChange, onSubmit, initialData, isLoading }: GroupFormProps) {
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<GroupFormData>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: '',
      color: '#3B82F6',
      description: '',
    },
  });

  // Reset form when initialData changes
  useEffect(() => {
    if (open) {
      reset({
        name: initialData?.name || '',
        color: initialData?.color || '#3B82F6',
        description: initialData?.description || '',
      });
    }
  }, [open, initialData, reset]);

  const selectedColor = watch('color');

  const handleFormSubmit = (data: GroupFormData) => {
    onSubmit({
      name: data.name,
      color: data.color,
      description: data.description || null,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Редагувати групу' : 'Нова група'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Назва *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Сонечко"
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
              placeholder="Опис групи..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Колір</Label>
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setValue('color', color)}
                  className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ 
                    backgroundColor: color,
                    borderColor: selectedColor === color ? 'hsl(var(--foreground))' : 'transparent',
                  }}
                />
              ))}
            </div>
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
