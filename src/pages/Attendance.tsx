import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EnhancedAttendanceGrid } from '@/components/attendance/EnhancedAttendanceGrid';
import { useActivities } from '@/hooks/useActivities';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const RECENT_JOURNALS_KEY = 'recentAttendanceJournals';

export default function Attendance() {
  const { data: activities = [], isLoading } = useActivities();
  const activeActivities = useMemo(() => activities.filter(a => a.is_active), [activities]);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [recentActivityIds, setRecentActivityIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_JOURNALS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentActivityIds(parsed.filter((id) => typeof id === 'string'));
        }
      }
    } catch (error) {
      console.warn('Failed to load recent journals from localStorage:', error);
    }
  }, []);

  // Auto-select first activity
  useEffect(() => {
  if (!selectedActivityId && activeActivities.length > 0) {
    setSelectedActivityId(activeActivities[0].id);
  }
  }, [selectedActivityId, activeActivities]);

  useEffect(() => {
    if (!selectedActivityId) return;
    setRecentActivityIds((prev) => {
      const next = [selectedActivityId, ...prev.filter(id => id !== selectedActivityId)].slice(0, 5);
      try {
        localStorage.setItem(RECENT_JOURNALS_KEY, JSON.stringify(next));
      } catch (error) {
        console.warn('Failed to save recent journals to localStorage:', error);
      }
      return next;
    });
  }, [selectedActivityId]);

  const recentActivities = useMemo(() => {
    return recentActivityIds
      .map((id) => activeActivities.find((activity) => activity.id === id))
      .filter((activity): activity is (typeof activeActivities)[number] => Boolean(activity));
  }, [recentActivityIds, activeActivities]);

  return (
    <>
      <PageHeader 
        title="Журнал" 
        description="Відмічайте відвідування та контролюйте нарахування"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {recentActivities.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {recentActivities.map((activity) => (
                  <Button
                    key={activity.id}
                    variant={activity.id === selectedActivityId ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedActivityId(activity.id)}
                    className="h-9"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: activity.color }}
                      />
                      {activity.name}
                    </span>
                  </Button>
                ))}
              </div>
            )}
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
          </div>
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
