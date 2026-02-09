import { GroupLesson as OriginalGroupLesson } from '@/hooks/useGroupLessons';

export type RecurrenceFreq = 'daily' | 'weekly' | 'weekdays';

export interface RRule {
  freq: RecurrenceFreq;
  until: string; // "YYYY-MM-DD"
}

export interface LessonActivity {
  id: number;
  created_at: string;
  title: string;
  teacher: string;
  color: string;
  startTime: string;
  endTime: string;
  comment?: string;
  activityId?: string;
  teacherId?: string;
  startDate: string; // "YYYY-MM-DD"
  rrule?: RRule;
  excludedDates?: string[]; // "YYYY-MM-DD"
}

export interface ActivityInstance extends Omit<LessonActivity, 'rrule'> {
  instanceId: string;
  date: string;
  isRecurring: boolean;
  isGroupLesson?: boolean;
  groupLessonId?: string; 
  rrule?: RRule;
}

export type NewLessonActivityPayload = Omit<LessonActivity, 'id' | 'created_at'>;
export type UpdateLessonActivityPayload = Partial<NewLessonActivityPayload> & { id: number };

// Re-exporting GroupLesson to be available for other components under this module
export type GroupLesson = OriginalGroupLesson;
