import { useState, useEffect } from 'react';
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
import type { StaffBillingRule } from '@/hooks/useStaffBilling';

type StaffBillingRuleInput = Omit<StaffBillingRule, 'id' | 'staff_id' | 'created_at' | 'updated_at'>;

interface StaffBillingRulesEditorProps {
  rules: StaffBillingRuleInput[];
  onChange: (rules: StaffBillingRuleInput[]) => void;
  effectiveFrom: string;
  onEffectiveFromChange: (date: string) => void;
}

export function StaffBillingRulesEditor({
  rules,
  onChange,
  effectiveFrom,
  onEffectiveFromChange,
}: StaffBillingRulesEditorProps) {
  const { data: activities = [] } = useActivities();
  const [localRules, setLocalRules] = useState<StaffBillingRuleInput[]>(rules);

  useEffect(() => {
    setLocalRules(rules);
  }, [rules]);

  const handleAddRule = () => {
    const newRule: StaffBillingRuleInput = {
      activity_id: null, // null = global rule for all activities
      rate_type: 'percent',
      rate: 0,
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
    field: 'activity_id' | 'rate_type' | 'rate',
    value: string | number | null
  ) => {
    const updated = localRules.map((rule, i) => {
      if (i === index) {
        return { ...rule, [field]: value };
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
          <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 border rounded-lg">
            <div className="col-span-4">
              <Label htmlFor={`rule-activity-${index}`}>Активність</Label>
              <Select
                value={rule.activity_id || 'all'}
                onValueChange={(value) => handleChange(index, 'activity_id', value === 'all' ? null : value)}
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
                onValueChange={(value) => handleChange(index, 'rate_type', value as 'fixed' | 'percent' | 'per_session')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Фіксована</SelectItem>
                  <SelectItem value="percent">Відсоток</SelectItem>
                  <SelectItem value="per_session">За заняття</SelectItem>
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

            <div className="col-span-2">
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
