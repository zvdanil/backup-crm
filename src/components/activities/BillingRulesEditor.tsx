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
import type { BillingRules, BillingRule, BillingRuleType, CustomAttendanceStatus } from '@/hooks/useActivities';
import { ATTENDANCE_LABELS, ATTENDANCE_FULL_LABELS } from '@/lib/attendance';
import type { AttendanceStatus } from '@/lib/attendance';
import { Trash2, X } from 'lucide-react';

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

  const addCustomStatus = () => {
    const currentCustomStatuses = localRules.custom_statuses || [];
    if (currentCustomStatuses.length >= 2) {
      return; // Максимум 2 кастомных статуса
    }

    const newCustomStatus: CustomAttendanceStatus = {
      id: crypto.randomUUID(),
      name: '',
      rate: 0,
      type: 'fixed',
      color: '#3B82F6',
      is_active: true,
    };

    const newRules = {
      ...localRules,
      custom_statuses: [...currentCustomStatuses, newCustomStatus],
    };

    setLocalRules(newRules);
    onChange(newRules);
  };

  const updateCustomStatus = (id: string, updates: Partial<CustomAttendanceStatus>) => {
    const currentCustomStatuses = localRules.custom_statuses || [];
    const updatedStatuses = currentCustomStatuses.map((cs) =>
      cs.id === id ? { ...cs, ...updates } : cs
    );

    const newRules = {
      ...localRules,
      custom_statuses: updatedStatuses,
    };

    setLocalRules(newRules);
    onChange(newRules);
  };

  const removeCustomStatus = (id: string) => {
    const currentCustomStatuses = localRules.custom_statuses || [];
    const updatedStatuses = currentCustomStatuses.filter((cs) => cs.id !== id);

    const newRules = {
      ...localRules,
      custom_statuses: updatedStatuses.length > 0 ? updatedStatuses : undefined,
    };

    setLocalRules(newRules);
    onChange(newRules);
  };

  const toggleCustomStatusActive = (id: string) => {
    const currentCustomStatuses = localRules.custom_statuses || [];
    const customStatus = currentCustomStatuses.find((cs) => cs.id === id);
    if (customStatus) {
      updateCustomStatus(id, { is_active: !customStatus.is_active });
    }
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

        <Separator />

        {/* Кастомные статусы */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-semibold">Кастомні статуси</Label>
              <p className="text-xs text-muted-foreground">
                Додайте до 2 додаткових статусів з індивідуальними налаштуваннями
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCustomStatus}
              disabled={(localRules.custom_statuses || []).length >= 2}
            >
              Додати статус
            </Button>
          </div>

          {(localRules.custom_statuses || []).map((customStatus) => (
            <div
              key={customStatus.id}
              className={`space-y-3 p-3 border rounded-lg ${
                !customStatus.is_active ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border-2 border-gray-300"
                    style={{ backgroundColor: customStatus.color }}
                  />
                  <Label className="font-medium">
                    {customStatus.name || 'Новий статус'}
                  </Label>
                  {!customStatus.is_active && (
                    <span className="text-xs text-muted-foreground">(деактивовано)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleCustomStatusActive(customStatus.id)}
                  >
                    {customStatus.is_active ? 'Деактивувати' : 'Активувати'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCustomStatus(customStatus.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Назва статусу</Label>
                  <Input
                    type="text"
                    value={customStatus.name}
                    onChange={(e) =>
                      updateCustomStatus(customStatus.id, { name: e.target.value })
                    }
                    placeholder="Наприклад: Отработка"
                    className="h-9"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Колір</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={customStatus.color}
                        onChange={(e) =>
                          updateCustomStatus(customStatus.id, { color: e.target.value })
                        }
                        className="h-9 w-20 p-1 cursor-pointer"
                      />
                      <Input
                        type="text"
                        value={customStatus.color}
                        onChange={(e) =>
                          updateCustomStatus(customStatus.id, { color: e.target.value })
                        }
                        placeholder="#3B82F6"
                        className="h-9 flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Тип оплати</Label>
                    <Select
                      value={customStatus.type}
                      onValueChange={(value) =>
                        updateCustomStatus(customStatus.id, {
                          type: value as BillingRuleType,
                        })
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
                      value={customStatus.rate || ''}
                      onChange={(e) =>
                        updateCustomStatus(customStatus.id, {
                          rate: parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="h-9"
                    />
                    <p className="text-xs text-muted-foreground">
                      Може бути від'ємним (для відпрацювань/повернень)
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {customStatus.type === 'fixed' && 'Розрахунок: ставка × 1'}
                  {customStatus.type === 'subscription' &&
                    'Розрахунок: ставка ÷ кількість робочих днів у місяці'}
                  {customStatus.type === 'hourly' &&
                    'Розрахунок: ставка × число, введене в журналі'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
