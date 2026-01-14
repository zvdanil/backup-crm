import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EnhancedAttendanceGrid } from '@/components/attendance/EnhancedAttendanceGrid';
import { useActivities } from '@/hooks/useActivities';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Attendance() {
  const { data: activities = [], isLoading } = useActivities();
  const activeActivities = useMemo(() => activities.filter(a => a.is_active), [activities]);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');

  // Auto-select first activity
  useEffect(() => {
  if (!selectedActivityId && activeActivities.length > 0) {
    setSelectedActivityId(activeActivities[0].id);
  }
  }, [selectedActivityId, activeActivities]);

  return (
    <>
      <PageHeader 
        title="Журнал" 
        description="Відмічайте відвідування та контролюйте нарахування"
        actions={
          <Select value={selectedActivityId} onValueChange={setSelectedActivityId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Виберіть активність" />
            </SelectTrigger>
            <SelectContent>
              {activeActivities.map((activity) => (
                <SelectItem key={activity.id} value={activity.id}>
                  <span className="flex items-center gap-2">
                    <span 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: activity.color }}
                    />
                    {activity.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      
      <div className="p-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : activeActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Немає активних активностей</p>
            <a href="/activities" className="text-primary hover:underline mt-2">
              Створити активність
            </a>
          </div>
        ) : selectedActivityId ? (
          <EnhancedAttendanceGrid activityId={selectedActivityId} />
        ) : null}
      </div>
    </>
  );
}
