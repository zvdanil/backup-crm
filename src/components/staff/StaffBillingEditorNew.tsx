import { useEffect, useState } from 'react';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { useActivities } from '@/hooks/useActivities';
import { useGroupLessons } from '@/hooks/useGroupLessons';
import type { StaffBillingRule } from '@/hooks/useStaffBilling';

type StaffBillingRuleInput = Omit<StaffBillingRule, 'id' | 'staff_id' | 'created_at' | 'updated_at'>;

interface StaffBillingEditorNewProps {
  rules: StaffBillingRuleInput[];
  onChange: (rules: StaffBillingRuleInput[]) => void;
  effectiveFrom: string;
  onEffectiveFromChange: (date: string) => void;
}

const toOptionalNumber = (value: string) => {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export function StaffBillingEditorNew({
  rules,
  onChange,
  effectiveFrom,
  onEffectiveFromChange,
}: StaffBillingEditorNewProps) {
  const { data: activities = [] } = useActivities();
  const { data: groupLessons = [] } = useGroupLessons();
  const [localRules, setLocalRules] = useState<StaffBillingRuleInput[]>(rules);

  useEffect(() => {
    setLocalRules(rules);
  }, [rules]);

  const handleAddRule = () => {
    const newRule: StaffBillingRuleInput = {
      activity_id: null,
      group_lesson_id: null,
      rate_type: 'percent',
      rate: 0,
      lesson_limit: null,
      penalty_trigger_percent: null,
      penalty_percent: null,
      extra_lesson_rate: null,
      effective_from: effectiveFrom || new Date().toISOString().split('T')[0],
      effective_to: null,
    };
    const updated = [...localRules, newRule];
    setLocalRules(updated);
    onChange(updated);
  };

  const handleRemoveRule = (index: number) => {
    const updated = localRules.filter((_, i) => i !== index);
    setLocalRules(updated);
    onChange(updated);
  };

  const handleChange = (
    index: number,
    field: keyof StaffBillingRuleInput,
    value: string | number | null
  ) => {
    const updated = localRules.map((rule, i) => {
      if (i === index) {
        const nextRule = { ...rule, [field]: value } as StaffBillingRuleInput;
        if (field === 'activity_id' && value === null) {
          nextRule.group_lesson_id = null;
        }
        if (field === 'rate_type' && value !== 'subscription') {
          nextRule.lesson_limit = null;
          nextRule.penalty_trigger_percent = null;
          nextRule.penalty_percent = null;
          nextRule.extra_lesson_rate = null;
        }
        return nextRule;
      }
      return rule;
    });
    setLocalRules(updated);
    onChange(updated);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Індивідуальні ставки</CardTitle>
        <CardDescription>
          Налаштуйте індивідуальні ставки для конкретних активностей або загальну ставку
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="effective_from">
            <Calendar className="h-4 w-4 inline mr-2" />
            Дата початку дії
          </Label>
          <Input
            id="effective_from"
            type="date"
            value={effectiveFrom}
            onChange={(e) => onEffectiveFromChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Нові ставки застосовуються до нарахувань з вказаної дати
          </p>
        </div>

        {localRules.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Немає налаштованих ставок. Натисніть "Додати ставку" щоб додати нову.
          </p>
        )}

        {localRules.map((rule, index) => (
          <div key={index} className="space-y-3 p-3 border rounded-lg">
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                <Label htmlFor={`rule-activity-${index}`}>Активність</Label>
                <Select
                  value={rule.activity_id || 'all'}
                  onValueChange={(value) =>
                    handleChange(index, 'activity_id', value === 'all' || value === 'null' ? null : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Всі активності" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Всі активності</SelectItem>
                    {activities.map((activity) => (
                      <SelectItem key={activity.id} value={activity.id}>
                        {activity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-3">
                <Label htmlFor={`rule-type-${index}`}>Тип ставки</Label>
                <Select
                  value={rule.rate_type}
                  onValueChange={(value) =>
                    handleChange(
                      index,
                      'rate_type',
                      value as StaffBillingRule['rate_type']
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Фіксована</SelectItem>
                    <SelectItem value="percent">Відсоток</SelectItem>
                    <SelectItem value="per_session">За заняття</SelectItem>
                    <SelectItem value="subscription">Абонемент</SelectItem>
                    <SelectItem value="per_student">За учня</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-3">
                <Label htmlFor={`rule-value-${index}`}>
                  Значення ({rule.rate_type === 'percent' ? '%' : '₴'})
                </Label>
                <Input
                  id={`rule-value-${index}`}
                  type="number"
                  step={rule.rate_type === 'percent' ? '0.01' : '1'}
                  value={rule.rate}
                  onChange={(e) => handleChange(index, 'rate', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>

              <div className="col-span-2 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleRemoveRule(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {rule.activity_id && (
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-6">
                  <Label htmlFor={`rule-group-lesson-${index}`}>Групове заняття (опціонально)</Label>
                  <Select
                    value={rule.group_lesson_id || 'none'}
                    onValueChange={(value) =>
                      handleChange(index, 'group_lesson_id', value === 'none' ? null : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Без групового" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без групового</SelectItem>
                      {groupLessons
                        .filter((lesson) => lesson.activity_id === rule.activity_id)
                        .map((lesson) => (
                          <SelectItem key={lesson.id} value={lesson.id}>
                            {lesson.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {rule.rate_type === 'subscription' && (
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-3">
                  <Label htmlFor={`rule-limit-${index}`}>Ліміт занять</Label>
                  <Input
                    id={`rule-limit-${index}`}
                    type="number"
                    min="0"
                    step="1"
                    value={rule.lesson_limit ?? ''}
                    onChange={(e) => handleChange(index, 'lesson_limit', toOptionalNumber(e.target.value))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Максимальна кількість занять у межах абонемента.
                  </p>
                </div>
                <div className="col-span-3">
                  <Label htmlFor={`rule-trigger-${index}`}>Поріг штрафу (%)</Label>
                  <Input
                    id={`rule-trigger-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={rule.penalty_trigger_percent ?? ''}
                    onChange={(e) =>
                      handleChange(index, 'penalty_trigger_percent', toOptionalNumber(e.target.value))
                    }
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Відсоток від ліміту, після якого нараховується штраф.
                  </p>
                </div>
                <div className="col-span-3">
                  <Label htmlFor={`rule-penalty-${index}`}>Штраф (%)</Label>
                  <Input
                    id={`rule-penalty-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={rule.penalty_percent ?? ''}
                    onChange={(e) => handleChange(index, 'penalty_percent', toOptionalNumber(e.target.value))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Розмір штрафу у відсотках.
                  </p>
                </div>
                <div className="col-span-3">
                  <Label htmlFor={`rule-extra-${index}`}>Понад ліміт (₴)</Label>
                  <Input
                    id={`rule-extra-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={rule.extra_lesson_rate ?? ''}
                    onChange={(e) => handleChange(index, 'extra_lesson_rate', toOptionalNumber(e.target.value))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Оплата за кожне заняття понад ліміт.
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={handleAddRule}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Додати ставку
        </Button>
      </CardContent>
    </Card>
  );
}
