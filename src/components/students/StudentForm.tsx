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
import type { Student, StudentInsert } from '@/hooks/useStudents';
import { useGroups } from '@/hooks/useGroups';

const studentSchema = z.object({
  full_name: z.string().min(2, 'Мінімум 2 символи').max(100),
  birth_date: z.string().optional(),
  guardian_name: z.string().max(100).optional(),
  guardian_phone: z.string().max(20).optional(),
  guardian_email: z.string().email('Невірний email').optional().or(z.literal('')),
  group_id: z.string().optional().nullable(),
});

type StudentFormData = z.infer<typeof studentSchema>;

interface StudentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: StudentInsert) => void;
  initialData?: Student;
  isLoading?: boolean;
}

export function StudentForm({ open, onOpenChange, onSubmit, initialData, isLoading }: StudentFormProps) {
  const { data: groups = [] } = useGroups();
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<StudentFormData>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      full_name: '',
      birth_date: '',
      guardian_name: '',
      guardian_phone: '',
      guardian_email: '',
      group_id: null,
    },
  });

  // Reset form when initialData changes
  useEffect(() => {
    if (open) {
      reset({
        full_name: initialData?.full_name || '',
        birth_date: initialData?.birth_date || '',
        guardian_name: initialData?.guardian_name || '',
        guardian_phone: initialData?.guardian_phone || '',
        guardian_email: initialData?.guardian_email || '',
        group_id: initialData?.group_id || null,
      });
    }
  }, [open, initialData, reset]);

  // Get current group_id value, using 'none' if null/undefined
  const currentGroupId = watch('group_id') || 'none';

  const handleFormSubmit = (data: StudentFormData) => {
    onSubmit({
      full_name: data.full_name,
      birth_date: data.birth_date || null,
      guardian_name: data.guardian_name || null,
      guardian_phone: data.guardian_phone || null,
      guardian_email: data.guardian_email || null,
      group_id: data.group_id || null,
      status: 'active',
      custom_fields: {},
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Редагувати дитину' : 'Додати дитину'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">ПІБ дитини *</Label>
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
            <Label htmlFor="birth_date">Дата народження</Label>
            <Input
              id="birth_date"
              type="date"
              {...register('birth_date')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="guardian_name">ПІБ опікуна</Label>
            <Input
              id="guardian_name"
              {...register('guardian_name')}
              placeholder="Іванова Марія Петрівна"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="guardian_phone">Телефон</Label>
            <Input
              id="guardian_phone"
              {...register('guardian_phone')}
              placeholder="+380 (99) 123-45-67"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="guardian_email">Email</Label>
            <Input
              id="guardian_email"
              type="email"
              {...register('guardian_email')}
              placeholder="email@example.com"
            />
            {errors.guardian_email && (
              <p className="text-sm text-destructive">{errors.guardian_email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Група</Label>
            <Select
              value={currentGroupId}
              onValueChange={(value) => setValue('group_id', value === 'none' ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Виберіть групу" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без групи</SelectItem>
                {groups && groups.length > 0 && groups
                  .filter((group) => group && group.id && group.name)
                  .map((group) => (
                    <SelectItem key={group.id} value={group.id || "none"}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: group.color || '#3B82F6' }}
                        />
                        <span>{group.name}</span>
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
