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
import type { StaffManualRateHistory } from '@/hooks/useStaffBilling';
import { useActivities } from '@/hooks/useActivities';

type StaffManualRateHistoryInput = Omit<StaffManualRateHistory, 'id' | 'staff_id' | 'created_at' | 'updated_at'>;

interface StaffManualRateHistoryEditorProps {
  history: StaffManualRateHistoryInput[];
  onChange: (history: StaffManualRateHistoryInput[]) => void;
  effectiveFrom: string;
  onEffectiveFromChange: (date: string) => void;
}

export function StaffManualRateHistoryEditor({
  history,
  onChange,
  effectiveFrom,
  onEffectiveFromChange,
}: StaffManualRateHistoryEditorProps) {
  const { data: activities = [] } = useActivities();
  const [localHistory, setLocalHistory] = useState<StaffManualRateHistoryInput[]>(history);

  useEffect(() => {
    setLocalHistory(history);
  }, [history]);

  const handleAddEntry = () => {
    const newEntry: StaffManualRateHistoryInput = {
      activity_id: null,
      manual_rate_type: 'per_session',
      manual_rate_value: 0,
      effective_from: effectiveFrom || new Date().toISOString().split('T')[0],
      effective_to: null,
    };
    const updated = [...localHistory, newEntry];
    setLocalHistory(updated);
    onChange(updated);
  };

  const handleRemoveEntry = (index: number) => {
    const updated = localHistory.filter((_, i) => i !== index);
    setLocalHistory(updated);
    onChange(updated);
  };

  const handleChange = (
    index: number,
    field: 'manual_rate_type' | 'manual_rate_value' | 'activity_id',
    value: string | number | null
  ) => {
    const updated = localHistory.map((entry, i) => {
      if (i === index) {
        return { ...entry, [field]: value };
      }
      return entry;
    });
    setLocalHistory(updated);
    onChange(updated);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Історія ставок для ручного режиму</CardTitle>
        <CardDescription>
          Налаштуйте ставки для ручного вводу з прив'язкою до дати
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

        {localHistory.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Немає налаштованих ставок. Натисніть "Додати ставку" щоб додати нову.
          </p>
        )}

        {localHistory.map((entry, index) => (
          <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 border rounded-lg">
            <div className="col-span-4">
              <Label htmlFor={`entry-activity-${index}`}>Активність</Label>
              <Select
                value={entry.activity_id || 'all'}
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
              <Label htmlFor={`entry-type-${index}`}>Тип ставки</Label>
              <Select
                value={entry.manual_rate_type}
                onValueChange={(value) => handleChange(index, 'manual_rate_type', value as 'hourly' | 'per_session' | 'per_working_day')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Почасово</SelectItem>
                  <SelectItem value="per_session">За заняття</SelectItem>
                  <SelectItem value="per_working_day">Ставка за раб. дні</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-3">
              <Label htmlFor={`entry-value-${index}`}>
                Значення ({entry.manual_rate_type === 'hourly' ? '₴/год' : entry.manual_rate_type === 'per_session' ? '₴/заняття' : '₴/місяць'})
              </Label>
              <Input
                id={`entry-value-${index}`}
                type="number"
                step="0.01"
                min="0"
                value={entry.manual_rate_value}
                onChange={(e) => handleChange(index, 'manual_rate_value', parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>

            <div className="col-span-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleRemoveEntry(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={handleAddEntry}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Додати ставку
        </Button>
      </CardContent>
    </Card>
  );
}
