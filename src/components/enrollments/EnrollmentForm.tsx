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
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useActivities, useActivityPriceHistory } from '@/hooks/useActivities';
import { formatCurrency } from '@/lib/attendance';
import { getActivityDisplayPrice } from '@/lib/activityPrice';
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

const enrollmentSchema = z.object({
  enrollments: z.array(z.object({
    activity_id: z.string(),
    custom_price: z.string().optional(),
    discount_percent: z.string().optional(),
  })).min(1, 'Виберіть хоча б одну активність'),
});

type EnrollmentFormData = z.infer<typeof enrollmentSchema>;

interface SelectedActivity {
  activity_id: string;
  custom_price: string;
  discount_percent: string;
}

// Component to display activity with current price from billing_rules/price_history
function ActivityPriceDisplayItem({ activity }: { activity: any }) {
  const { data: priceHistory } = useActivityPriceHistory(activity.id);
  const currentDate = new Date().toISOString().split('T')[0];
  
  const displayPrice = useMemo(() => {
    return getActivityDisplayPrice(
      activity,
      priceHistory,
      null, // No custom_price in selection list
      0, // No discount in selection list
      currentDate
    );
  }, [activity, priceHistory, currentDate]);
  
  return (
    <span className="flex items-center gap-2">
      <span 
        className="w-3 h-3 rounded-full" 
        style={{ backgroundColor: activity.color }}
      />
      {activity.name} {displayPrice && `— ${displayPrice}`}
    </span>
  );
}

interface EnrollmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { activity_id: string; custom_price: number | null; discount_percent: number }) => void | Promise<void>;
  studentName: string;
  isLoading?: boolean;
  excludeActivityIds?: string[];
}

export function EnrollmentForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  studentName,
  isLoading,
  excludeActivityIds = []
}: EnrollmentFormProps) {
  const { data: activities = [] } = useActivities();
  const availableActivities = activities.filter(
    a => a.is_active && a.show_in_children && !excludeActivityIds.includes(a.id)
  );
  
  const [selectedActivities, setSelectedActivities] = useState<SelectedActivity[]>([]);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<EnrollmentFormData>({
    resolver: zodResolver(enrollmentSchema),
    defaultValues: {
      enrollments: [],
    },
  });

  const handleActivityToggle = (activityId: string) => {
    setSelectedActivities(prev => {
      const exists = prev.find(a => a.activity_id === activityId);
      if (exists) {
        return prev.filter(a => a.activity_id !== activityId);
      } else {
        return [...prev, {
          activity_id: activityId,
          custom_price: '',
          discount_percent: '0',
        }];
      }
    });
  };

  const handleActivityUpdate = (activityId: string, field: 'custom_price' | 'discount_percent', value: string) => {
    setSelectedActivities(prev =>
      prev.map(a =>
        a.activity_id === activityId ? { ...a, [field]: value } : a
      )
    );
  };

  const handleFormSubmit = async () => {
    // Валидация: проверяем, что выбрана хотя бы одна активность
    if (selectedActivities.length === 0) {
      return;
    }
    
    // Создаём записи для каждой выбранной активности последовательно
    // Это гарантирует, что инвалидация кеша происходит после каждого создания
    for (const activity of selectedActivities) {
      const result = onSubmit({
        activity_id: activity.activity_id,
        custom_price: activity.custom_price ? parseFloat(activity.custom_price) : null,
        discount_percent: activity.discount_percent ? parseFloat(activity.discount_percent) : 0,
      });
      
      // Если onSubmit возвращает Promise, ждём его завершения
      if (result instanceof Promise) {
        await result;
      }
    }
    
    // Сброс состояния после отправки
    setSelectedActivities([]);
    reset();
    onOpenChange(false);
  };

  // Сброс состояния при закрытии диалога
  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedActivities([]);
      reset();
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Записати на активність</DialogTitle>
          <p className="text-sm text-muted-foreground">{studentName}</p>
        </DialogHeader>
        
        <form onSubmit={(e) => {
          e.preventDefault();
          handleFormSubmit();
        }} className="space-y-4">
          <div className="space-y-2">
            <Label>Виберіть активності *</Label>
            <div className="border rounded-lg p-3 max-h-60 overflow-y-auto space-y-2">
              {availableActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Немає доступних активностей</p>
              ) : (
                availableActivities.map((activity) => {
                  const isSelected = selectedActivities.some(a => a.activity_id === activity.id);
                  return (
                    <div key={activity.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`activity-${activity.id}`}
                        checked={isSelected}
                        onCheckedChange={() => handleActivityToggle(activity.id)}
                      />
                      <Label 
                        htmlFor={`activity-${activity.id}`} 
                        className="cursor-pointer font-normal flex items-center gap-2 flex-1"
                      >
                        <ActivityPriceDisplayItem activity={activity} />
                      </Label>
                    </div>
                  );
                })
              )}
            </div>
            {selectedActivities.length === 0 && (
              <p className="text-sm text-destructive">Виберіть хоча б одну активність</p>
            )}
          </div>

          {/* Список выбранных активностей с полями для цены и скидки */}
          {selectedActivities.length > 0 && (
            <div className="space-y-3">
              <Label>Налаштування для вибраних активностей</Label>
              {selectedActivities.map((selected) => {
                const activity = activities.find(a => a.id === selected.activity_id);
                if (!activity) return null;
                
                return (
                  <div key={selected.activity_id} className="p-3 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: activity.color }}
                        />
                        <span className="font-medium">{activity.name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleActivityToggle(selected.activity_id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`price-${selected.activity_id}`} className="text-xs">
                          Індивідуальна ціна (₴)
                        </Label>
                        <Input
                          id={`price-${selected.activity_id}`}
                          type="number"
                          value={selected.custom_price}
                          onChange={(e) => handleActivityUpdate(selected.activity_id, 'custom_price', e.target.value)}
                          placeholder="Стандартна"
                          className="h-9"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <Label htmlFor={`discount-${selected.activity_id}`} className="text-xs">
                          Знижка (%)
                        </Label>
                        <Input
                          id={`discount-${selected.activity_id}`}
                          type="number"
                          min="0"
                          max="100"
                          value={selected.discount_percent}
                          onChange={(e) => handleActivityUpdate(selected.activity_id, 'discount_percent', e.target.value)}
                          placeholder="0"
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setSelectedActivities([]);
                reset();
                onOpenChange(false);
              }}
            >
              Скасувати
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || selectedActivities.length === 0 || availableActivities.length === 0}
            >
              {isLoading ? 'Збереження...' : `Записати (${selectedActivities.length})`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
