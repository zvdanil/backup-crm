import { useState } from 'react';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateActivity } from '@/hooks/useActivities';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import type { ActivityCategory, ActivityInsert } from '@/hooks/useActivities';

const EXPENSE_CATEGORY_OPTIONS: { value: ActivityCategory; label: string }[] = [
  { value: 'expense', label: 'Витрата' },
  { value: 'household_expense', label: 'Госп. витрати' },
  { value: 'salary', label: 'Зарплата' },
];

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

interface AddExpenseJournalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddExpenseJournalDialog({ open, onOpenChange }: AddExpenseJournalDialogProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('expense');
  const [accountId, setAccountId] = useState<string>('none');
  const [isActualExpense, setIsActualExpense] = useState(true);
  const [color, setColor] = useState('#3B82F6');
  const [description, setDescription] = useState('');

  const { data: accounts = [] } = usePaymentAccounts();
  const createActivity = useCreateActivity();

  const resetForm = () => {
    setName('');
    setCategory('expense');
    setAccountId('none');
    setIsActualExpense(true);
    setColor('#3B82F6');
    setDescription('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) return;

    const payload: ActivityInsert = {
      name: name.trim(),
      category,
      color,
      description: description.trim() || null,
      account_id: accountId && accountId !== 'none' ? accountId : null,
      is_actual_expense: category === 'expense' || category === 'household_expense' ? isActualExpense : false,
      teacher_payment_percent: 50,
      default_price: 0,
      payment_type: 'subscription',
      is_active: true,
      show_in_children: true,
      show_in_journals: true,
      auto_journal: false,
      activity_group: null,
      balance_display_mode: null,
      fixed_teacher_rate: null,
      payment_mode: null,
      billing_rules: null,
      config: null,
    };

    await createActivity.mutateAsync(payload);
    resetForm();
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const showIsActualExpense = category === 'expense' || category === 'household_expense';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Додати журнал витрат</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Назва *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Наприклад: Комунальні послуги"
              minLength={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Категорія *</Label>
            <Select
              value={category}
              onValueChange={(v) => {
                const cat = v as ActivityCategory;
                setCategory(cat);
                if (cat === 'expense' || cat === 'household_expense') setIsActualExpense(true);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Рахунок для нарахувань</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Не вибрано" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не вказано</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.is_active ? acc.name : `${acc.name} (неактивний)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showIsActualExpense && (
            <div className="flex items-center space-x-2">
              <Switch
                id="is_actual_expense"
                checked={isActualExpense}
                onCheckedChange={setIsActualExpense}
              />
              <Label htmlFor="is_actual_expense" className="cursor-pointer">
                Факт реальних витрат
              </Label>
            </div>
          )}

          <div className="space-y-2">
            <Label>Колір</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'hsl(var(--foreground))' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Опис</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опис журналу витрат..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Скасувати
            </Button>
            <Button type="submit" disabled={!name.trim() || name.trim().length < 2 || createActivity.isPending}>
              {createActivity.isPending ? 'Створення...' : 'Створити'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
