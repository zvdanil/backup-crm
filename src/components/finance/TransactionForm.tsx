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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStudents } from '@/hooks/useStudents';
import { useActivities } from '@/hooks/useActivities';
import { useStaff } from '@/hooks/useStaff';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import type { FinanceTransactionInsert, TransactionType } from '@/hooks/useFinanceTransactions';

const transactionSchema = z.object({
  type: z.enum(['income', 'expense', 'payment', 'salary', 'household']),
  student_id: z.string().optional(),
  activity_id: z.string().optional(),
  staff_id: z.string().optional(),
  account_id: z.string().optional(),
  amount: z.string().min(1, 'Вкажіть суму'),
  date: z.string().min(1, 'Вкажіть дату'),
  description: z.string().optional(),
  category: z.string().optional(),
}).refine((data) => {
  // For payment type, account_id is required
  if (data.type === 'payment') {
    return !!data.account_id && data.account_id !== 'none';
  }
  return true;
}, {
  message: 'Для оплати необхідно вибрати рахунок',
  path: ['account_id'],
});

type TransactionFormData = z.infer<typeof transactionSchema>;

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FinanceTransactionInsert) => void;
  initialStudentId?: string;
  isLoading?: boolean;
}

export function TransactionForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  initialStudentId,
  isLoading 
}: TransactionFormProps) {
  const { data: students = [] } = useStudents();
  const { data: activities = [] } = useActivities();
  const { data: staff = [] } = useStaff();
  const { data: accounts = [] } = usePaymentAccounts();

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'income',
      student_id: '',
      activity_id: '',
      staff_id: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      category: '',
    },
  });

  useEffect(() => {
    if (open) {
      // If initialStudentId is provided, default to 'payment' type for student payments
      const defaultType = initialStudentId ? 'payment' : 'income';
      reset({
        type: defaultType,
        student_id: initialStudentId || '',
        activity_id: '',
        staff_id: '',
        account_id: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        category: '',
      });
    } else {
      // Reset form when dialog closes
      reset();
    }
  }, [open, initialStudentId, reset]);

  const selectedType = watch('type');

  const handleFormSubmit = (data: TransactionFormData) => {
    onSubmit({
      type: data.type as TransactionType,
      student_id: data.student_id || null,
      activity_id: (data.type === 'payment' ? null : (data.activity_id && data.activity_id !== 'none') ? data.activity_id : null), // Hide activity_id for payment
      staff_id: data.staff_id || null,
      account_id: (data.account_id && data.account_id !== 'none') ? data.account_id : null,
      amount: parseFloat(data.amount),
      date: data.date,
      description: data.description || null,
      category: data.category || null,
    });
    reset();
    onOpenChange(false);
  };

  const isIncome = selectedType === 'income' || selectedType === 'payment';
  const isExpense = selectedType === 'expense' || selectedType === 'salary' || selectedType === 'household';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto !top-[5vh] !translate-y-0">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-2 border-b">
          <DialogTitle>+ Транзакція</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Тип транзакції *</Label>
            <Select
              value={selectedType}
              onValueChange={(value) => setValue('type', value as TransactionType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Дохід</SelectItem>
                <SelectItem value="payment">Оплата</SelectItem>
                <SelectItem value="expense">Витрата</SelectItem>
                <SelectItem value="salary">Зарплата</SelectItem>
                <SelectItem value="household">Госп. витрати</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isIncome && (
            <>
              <div className="space-y-2">
                <Label>Дитина {initialStudentId ? '' : '*'}</Label>
                {initialStudentId ? (
                  <div className="px-3 py-2 border rounded-md bg-muted text-sm">
                    {students.find(s => s.id === initialStudentId)?.full_name || 'Завантаження...'}
                  </div>
                ) : (
                  <Select
                    value={watch('student_id') || ''}
                    onValueChange={(value) => setValue('student_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Виберіть дитину" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* For payment type: hide activity_id, show account_id */}
              {selectedType === 'payment' ? (
                <div className="space-y-2">
                  <Label>Рахунок для оплати *</Label>
                  <Select
                    value={watch('account_id') || ''}
                    onValueChange={(value) => setValue('account_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Виберіть рахунок" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.filter(a => a.is_active).map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.account_id && (
                    <p className="text-sm text-destructive">{errors.account_id.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Оплата буде зарахована на авансовий рахунок і автоматично розподілена по заборгованостям
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Активність</Label>
                    <Select
                      value={watch('activity_id') || undefined}
                      onValueChange={(value) => setValue('activity_id', value === 'none' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Виберіть активність (необов'язково)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не вказано</SelectItem>
                        {activities.filter(a => a.is_active).map((activity) => (
                          <SelectItem key={activity.id} value={activity.id}>
                            {activity.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Рахунок</Label>
                    <Select
                      value={watch('account_id') || 'none'}
                      onValueChange={(value) => setValue('account_id', value === 'none' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Не вказано" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не вказано</SelectItem>
                        {accounts.filter(a => a.is_active).map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </>
          )}

          {isExpense && (
            <>
              {(selectedType === 'salary' || selectedType === 'household') && (
                <div className="space-y-2">
                  <Label>Співробітник</Label>
                  <Select
                    value={watch('staff_id') || ''}
                    onValueChange={(value) => setValue('staff_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Виберіть співробітника" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.filter(s => s.is_active).map((staffMember) => (
                        <SelectItem key={staffMember.id} value={staffMember.id}>
                          {staffMember.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Категорія</Label>
                <Input
                  {...register('category')}
                  placeholder="Назва витрати"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Сума (₴) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                {...register('amount')}
                placeholder="1000"
              />
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Дата *</Label>
              <Input
                id="date"
                type="date"
                {...register('date')}
              />
              {errors.date && (
                <p className="text-sm text-destructive">{errors.date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Опис</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Опис транзакції..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 pb-2">
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
