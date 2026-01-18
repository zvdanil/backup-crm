import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { Activity, ActivityInsert, ActivityCategory, ACTIVITY_CATEGORY_LABELS, BillingRules } from '@/hooks/useActivities';
import { BillingRulesEditor } from './BillingRulesEditor';
import { useActivities } from '@/hooks/useActivities';
import { Checkbox } from '@/components/ui/checkbox';
import type { GardenAttendanceConfig } from '@/lib/gardenAttendance';

const CATEGORY_OPTIONS: { value: ActivityCategory; label: string }[] = [
  { value: 'income', label: 'Дохід' },
  { value: 'expense', label: 'Витрата' },
  { value: 'additional_income', label: 'Дод. дохід' },
  { value: 'household_expense', label: 'Госп. витрати' },
  { value: 'salary', label: 'Зарплата' },
];

const activitySchema = z.object({
  name: z.string().min(2, 'Мінімум 2 символи').max(100),
  teacher_payment_percent: z.string(),
  description: z.string().max(500).optional(),
  color: z.string(),
  category: z.enum(['income', 'expense', 'additional_income', 'household_expense', 'salary']),
  fixed_teacher_rate: z.string().optional(),
  payment_mode: z.string().optional(),
  auto_journal: z.boolean().optional(),
  show_in_children: z.boolean().optional(),
  billing_rules: z.any().optional(),
  effective_from: z.string().optional(),
  config: z.any().optional(),
});

type ActivityFormData = z.infer<typeof activitySchema>;

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

interface ActivityFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ActivityInsert & { effective_from?: string }) => void;
  initialData?: Activity;
  isLoading?: boolean;
}

export function ActivityForm({ open, onOpenChange, onSubmit, initialData, isLoading }: ActivityFormProps) {
  const [billingRules, setBillingRules] = useState<BillingRules | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [config, setConfig] = useState<GardenAttendanceConfig>({});
  const { data: allActivities = [] } = useActivities();

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<ActivityFormData>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      name: '',
      teacher_payment_percent: '50',
      description: '',
      color: '#3B82F6',
      category: 'income',
      fixed_teacher_rate: '',
      payment_mode: 'default',
      auto_journal: false,
      show_in_children: true,
      billing_rules: null,
      effective_from: new Date().toISOString().split('T')[0],
    },
  });

  // Reset form when initialData changes
  useEffect(() => {
    if (open) {
      const defaultEffectiveFrom = new Date().toISOString().split('T')[0];
      setEffectiveFrom(defaultEffectiveFrom);
      setBillingRules(initialData?.billing_rules || null);
      const initialConfig = (initialData?.config as GardenAttendanceConfig) || {};
      setConfig(initialConfig);
      reset({
        name: initialData?.name || '',
        teacher_payment_percent: initialData?.teacher_payment_percent?.toString() || '50',
        description: initialData?.description || '',
        color: initialData?.color || '#3B82F6',
        category: initialData?.category || 'income',
        fixed_teacher_rate: initialData?.fixed_teacher_rate?.toString() || '',
        payment_mode: initialData?.payment_mode || 'default',
        auto_journal: initialData?.auto_journal || false,
        show_in_children: initialData?.show_in_children ?? true,
        billing_rules: initialData?.billing_rules || null,
        effective_from: defaultEffectiveFrom,
        config: initialConfig,
      });
    }
  }, [open, initialData, reset]);

  const selectedColor = watch('color');

  const handleFormSubmit = (data: ActivityFormData) => {
    onSubmit({
      name: data.name,
      teacher_payment_percent: parseFloat(data.teacher_payment_percent),
      description: data.description || null,
      color: data.color,
      category: data.category,
      fixed_teacher_rate: data.fixed_teacher_rate ? parseFloat(data.fixed_teacher_rate) : null,
      payment_mode: data.payment_mode || null,
      auto_journal: data.auto_journal || false,
      show_in_children: data.show_in_children ?? true,
      billing_rules: billingRules,
      config: Object.keys(config).length > 0 ? config : null,
      // default_price та payment_type не передаються - тепер використовується billing_rules
      effective_from: effectiveFrom, // Передаємо дату зміни для історії (не зберігається в activities)
      is_active: true,
    });
    reset();
    setBillingRules(null);
    setConfig({});
    onOpenChange(false);
  };

  const handleBaseTariffToggle = (activityId: string) => {
    const currentIds = config.base_tariff_ids || [];
    const newIds = currentIds.includes(activityId)
      ? currentIds.filter(id => id !== activityId)
      : [...currentIds, activityId];
    setConfig({ ...config, base_tariff_ids: newIds });
  };

  const handleFoodTariffToggle = (activityId: string) => {
    const currentIds = config.food_tariff_ids || [];
    const newIds = currentIds.includes(activityId)
      ? currentIds.filter(id => id !== activityId)
      : [...currentIds, activityId];
    setConfig({ ...config, food_tariff_ids: newIds });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Редагувати активність' : 'Нова активність'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Назва *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Малювання"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Категорія *</Label>
            <Select
              value={watch('category')}
              onValueChange={(value) => setValue('category', value as ActivityCategory)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Виберіть категорію" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-sm text-destructive">{errors.category.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="teacher_payment_percent">Оплата педагогу (%)</Label>
            <Input
              id="teacher_payment_percent"
              type="number"
              {...register('teacher_payment_percent')}
              placeholder="50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fixed_teacher_rate">Фіксована ставка педагога (₴)</Label>
            <Input
              id="fixed_teacher_rate"
              type="number"
              {...register('fixed_teacher_rate')}
              placeholder="0 (якщо > 0, має пріоритет над тарифом викладача)"
            />
            <p className="text-xs text-muted-foreground">
              Якщо встановлено, має пріоритет над тарифом з картки викладача
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_mode">Режим оплати</Label>
            <Select
              value={watch('payment_mode') || 'default'}
              onValueChange={(value) => setValue('payment_mode', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">За замовчуванням</SelectItem>
                <SelectItem value="fixed">Фіксована</SelectItem>
                <SelectItem value="percent">Відсоток</SelectItem>
                <SelectItem value="per_session">За заняття</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="auto_journal">Автожурнал</Label>
              <p className="text-xs text-muted-foreground">
                Автоматично проставляти "П" у робочі дні
              </p>
            </div>
            <Switch
              id="auto_journal"
              checked={watch('auto_journal') || false}
              onCheckedChange={(checked) => setValue('auto_journal', checked)}
            />
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="show_in_children">Відображати у дітей</Label>
              <p className="text-xs text-muted-foreground">
                Показувати активність у картці вибору активностей та таблиці дітей
              </p>
            </div>
            <Switch
              id="show_in_children"
              checked={watch('show_in_children') ?? true}
              onCheckedChange={(checked) => setValue('show_in_children', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Опис</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Опис активності..."
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

          <Separator />

          <BillingRulesEditor
            billingRules={billingRules}
            onChange={setBillingRules}
            effectiveFrom={effectiveFrom}
            onEffectiveFromChange={setEffectiveFrom}
          />

          <Separator />

          {/* Garden Attendance Journal Config */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">Налаштування журналу відвідування v1</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Налаштуйте зв'язки з іншими активностями для автоматичного розрахунку нарахувань
              </p>
            </div>

            {/* Base Tariffs */}
            <div className="space-y-2">
              <Label>Базові тарифи (для розрахунку M)</Label>
              <p className="text-xs text-muted-foreground">
                Активності, які є базовими тарифами (наприклад, "Дитячий садок повний день")
              </p>
              <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                {allActivities.filter(a => a.id !== initialData?.id && a.is_active).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Немає інших активностей</p>
                ) : (
                  allActivities
                    .filter(a => a.id !== initialData?.id && a.is_active)
                    .map((activity) => (
                      <div key={activity.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`base-${activity.id}`}
                          checked={(config.base_tariff_ids || []).includes(activity.id)}
                          onCheckedChange={() => handleBaseTariffToggle(activity.id)}
                        />
                        <Label 
                          htmlFor={`base-${activity.id}`} 
                          className="cursor-pointer font-normal flex items-center gap-2 flex-1"
                        >
                          <div 
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: activity.color }}
                          />
                          {activity.name}
                        </Label>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Food Tariffs */}
            <div className="space-y-2">
              <Label>Тарифи харчування (для розрахунку F)</Label>
              <p className="text-xs text-muted-foreground">
                Активності, які відповідають за харчування (наприклад, "Харчування повний день")
              </p>
              <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                {allActivities.filter(a => a.id !== initialData?.id && a.is_active).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Немає інших активностей</p>
                ) : (
                  allActivities
                    .filter(a => a.id !== initialData?.id && a.is_active)
                    .map((activity) => (
                      <div key={activity.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`food-${activity.id}`}
                          checked={(config.food_tariff_ids || []).includes(activity.id)}
                          onCheckedChange={() => handleFoodTariffToggle(activity.id)}
                        />
                        <Label 
                          htmlFor={`food-${activity.id}`} 
                          className="cursor-pointer font-normal flex items-center gap-2 flex-1"
                        >
                          <div 
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: activity.color }}
                          />
                          {activity.name}
                        </Label>
                      </div>
                    ))
                )}
              </div>
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
