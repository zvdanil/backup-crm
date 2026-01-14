import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { BillingRules, BillingRule, BillingRuleType } from '@/hooks/useActivities';
import { ATTENDANCE_LABELS, ATTENDANCE_FULL_LABELS } from '@/lib/attendance';
import type { AttendanceStatus } from '@/lib/attendance';

const BILLING_RULE_TYPES: { value: BillingRuleType; label: string }[] = [
  { value: 'fixed', label: 'Разово (фіксована сума)' },
  { value: 'subscription', label: 'Абонемент (поділити на робочі дні)' },
  { value: 'hourly', label: 'Почасово (ставка × число з журналу)' },
];

interface BillingRulesEditorProps {
  billingRules: BillingRules | null;
  onChange: (rules: BillingRules | null) => void;
  effectiveFrom: string;
  onEffectiveFromChange: (date: string) => void;
}

const statuses: (AttendanceStatus | 'value')[] = ['present', 'sick', 'absent', 'vacation', 'value'];

export function BillingRulesEditor({ 
  billingRules, 
  onChange, 
  effectiveFrom,
  onEffectiveFromChange 
}: BillingRulesEditorProps) {
  const [localRules, setLocalRules] = useState<BillingRules>(billingRules || {});

  useEffect(() => {
    setLocalRules(billingRules || {});
  }, [billingRules]);

  const updateRule = (status: AttendanceStatus | 'value', rule: BillingRule | null) => {
    const newRules = { ...localRules };
    if (rule) {
      newRules[status as keyof BillingRules] = rule;
    } else {
      delete newRules[status as keyof BillingRules];
    }
    setLocalRules(newRules);
    onChange(Object.keys(newRules).length > 0 ? newRules : null);
  };

  const getStatusLabel = (status: AttendanceStatus | 'value') => {
    if (status === 'value') return 'Число';
    return `${ATTENDANCE_LABELS[status]} - ${ATTENDANCE_FULL_LABELS[status]}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Правила розрахунку за статусами</CardTitle>
        <p className="text-sm text-muted-foreground">
          Налаштуйте тип оплати та ставку для кожного статусу відвідування
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="effective_from">Дата зміни правил</Label>
          <div className="flex items-center gap-2">
            <Input
              id="effective_from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => onEffectiveFromChange(e.target.value)}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground">
              Правила застосуються з цієї дати
            </span>
          </div>
        </div>

        <Separator />

        {statuses.map((status) => {
          const rule = localRules[status as keyof BillingRules];
          const isEnabled = !!rule;

          return (
            <div key={status} className="space-y-2 p-3 border rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="font-medium">{getStatusLabel(status)}</Label>
                <Button
                  type="button"
                  variant={isEnabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (isEnabled) {
                      updateRule(status, null);
                    } else {
                      updateRule(status, { rate: 0, type: 'fixed' });
                    }
                  }}
                >
                  {isEnabled ? 'Вимкнути' : 'Увімкнути'}
                </Button>
              </div>

              {isEnabled && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Тип оплати</Label>
                    <Select
                      value={rule.type}
                      onValueChange={(value) =>
                        updateRule(status, { ...rule, type: value as BillingRuleType })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BILLING_RULE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Ставка (₴)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={rule.rate || ''}
                      onChange={(e) =>
                        updateRule(status, {
                          ...rule,
                          rate: parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                </div>
              )}

              {isEnabled && (
                <p className="text-xs text-muted-foreground mt-1">
                  {rule.type === 'fixed' && 'Розрахунок: ставка × 1'}
                  {rule.type === 'subscription' &&
                    'Розрахунок: ставка ÷ кількість робочих днів у місяці'}
                  {rule.type === 'hourly' && 'Розрахунок: ставка × число, введене в журналі'}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
