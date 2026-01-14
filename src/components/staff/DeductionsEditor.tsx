import { useState } from 'react';
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
import { Plus, Trash2 } from 'lucide-react';
import type { Deduction } from '@/hooks/useStaffBilling';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DeductionsEditorProps {
  deductions: Deduction[];
  onChange: (deductions: Deduction[]) => void;
}

export function DeductionsEditor({ deductions, onChange }: DeductionsEditorProps) {
  const [localDeductions, setLocalDeductions] = useState<Deduction[]>(deductions || []);

  const handleAdd = () => {
    const newDeduction: Deduction = {
      name: '',
      type: 'percent',
      value: 0,
    };
    const updated = [...localDeductions, newDeduction];
    setLocalDeductions(updated);
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    const updated = localDeductions.filter((_, i) => i !== index);
    setLocalDeductions(updated);
    onChange(updated);
  };

  const handleChange = (index: number, field: keyof Deduction, value: string | number) => {
    const updated = localDeductions.map((deduction, i) => {
      if (i === index) {
        return { ...deduction, [field]: value };
      }
      return deduction;
    });
    setLocalDeductions(updated);
    onChange(updated);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Динамічні комісії</CardTitle>
        <CardDescription>
          Додайте комісії, які будуть автоматично застосовуватися до базової суми зарплати
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {localDeductions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Немає доданих комісій. Натисніть "Додати комісію" щоб додати нову.
          </p>
        )}
        
        {localDeductions.map((deduction, index) => (
          <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 border rounded-lg">
            <div className="col-span-4">
              <Label htmlFor={`deduction-name-${index}`}>Назва</Label>
              <Input
                id={`deduction-name-${index}`}
                value={deduction.name}
                onChange={(e) => handleChange(index, 'name', e.target.value)}
                placeholder="Назва комісії"
              />
            </div>
            
            <div className="col-span-3">
              <Label htmlFor={`deduction-type-${index}`}>Тип</Label>
              <Select
                value={deduction.type}
                onValueChange={(value) => handleChange(index, 'type', value as 'percent' | 'fixed')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Відсоток</SelectItem>
                  <SelectItem value="fixed">Фіксована</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="col-span-3">
              <Label htmlFor={`deduction-value-${index}`}>
                Значення ({deduction.type === 'percent' ? '%' : '₴'})
              </Label>
              <Input
                id={`deduction-value-${index}`}
                type="number"
                step={deduction.type === 'percent' ? '0.01' : '1'}
                value={deduction.value}
                onChange={(e) => handleChange(index, 'value', parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            
            <div className="col-span-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleRemove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        
        <Button
          type="button"
          variant="outline"
          onClick={handleAdd}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Додати комісію
        </Button>
      </CardContent>
    </Card>
  );
}
