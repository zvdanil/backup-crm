import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Activity } from '@/hooks/useActivities';
import type { Staff } from '@/hooks/useStaff';
import type { GroupLesson } from '@/hooks/useGroupLessons';

interface GroupLessonFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; activity_id: string; staff_ids: string[] }) => void;
  isLoading?: boolean;
  activities: Activity[];
  staff: Staff[];
  initialData?: GroupLesson;
}

export function GroupLessonForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  activities,
  staff,
  initialData,
}: GroupLessonFormProps) {
  const [name, setName] = useState('');
  const [activityId, setActivityId] = useState('');
  const [staffIds, setStaffIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setName(initialData?.name || '');
      setActivityId(initialData?.activity_id || '');
      setStaffIds((initialData?.staff || []).map((member) => member.id));
    }
  }, [open, initialData]);

  const availableActivities = useMemo(
    () => activities.filter((activity) => activity.is_active),
    [activities]
  );

  const handleToggleStaff = (staffId: string) => {
    setStaffIds((prev) => (
      prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId]
    ));
  };

  const handleSubmit = () => {
    if (!name.trim() || !activityId) return;
    onSubmit({
      name: name.trim(),
      activity_id: activityId,
      staff_ids: staffIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Редагувати групове заняття' : 'Нове групове заняття'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Назва</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Наприклад, Логопед группове" />
          </div>

          <div className="space-y-2">
            <Label>Активність</Label>
            <Select value={activityId} onValueChange={setActivityId}>
              <SelectTrigger>
                <SelectValue placeholder="Оберіть активність" />
              </SelectTrigger>
              <SelectContent>
                {availableActivities.length === 0 && (
                  <SelectItem value="none" disabled>
                    Немає активних активностей
                  </SelectItem>
                )}
                {availableActivities.map((activity) => (
                  <SelectItem key={activity.id} value={activity.id}>
                    {activity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Викладачі</Label>
            <ScrollArea className="h-40 rounded-md border p-3">
              <div className="space-y-2">
                {staff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Немає доступних викладачів</p>
                ) : (
                  staff.map((member) => (
                    <label key={member.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={staffIds.includes(member.id)}
                        onCheckedChange={() => handleToggleStaff(member.id)}
                      />
                      <span>{member.full_name}</span>
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Скасувати
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading || !name.trim() || !activityId}>
              {initialData ? 'Зберегти' : 'Створити'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
