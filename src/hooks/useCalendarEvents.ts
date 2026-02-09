
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

// --- INTERFACES ---

// Represents the structure of the data in the 'calendar_events' table
export interface CalendarEvent {
  id: string;
  created_at?: string;
  updated_at?: string;
  activity_id: string | null;
  teacher_id: string | null;
  start_time: string; // "HH:mm:ss"
  end_time: string; // "HH:mm:ss"
  color: string | null;
  start_date: string; // "YYYY-MM-DD"
  rrule: RRule | null;
  excluded_dates: string[] | null; // Array of "YYYY-MM-DD"
  overrides: Record<string, Partial<EventOverride>> | null; // e.g., { "2024-11-05": { "start_time": "11:00" } }
}

// Represents the recurrence rule
export interface RRule {
  freq: 'weekly' | 'daily';
  interval?: number;
  byday?: number[]; // 0 = Sun, 1 = Mon, ...
  until: string; // "YYYY-MM-DD"
}

// Represents an override for a specific instance
export interface EventOverride {
  start_time: string;
  end_time: string;
  teacher_id: string | null;
  activity_id: string | null;
  color: string | null;
}

// Types for mutations
export type CalendarEventInsert = Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>;
export type CalendarEventUpdate = Partial<CalendarEventInsert>;

const CALENDAR_EVENTS_QUERY_KEY = 'calendar_events';

// --- HOOKS ---

/**
 * Fetches the master calendar event records from the database.
 * Note: This fetches the raw records, not the expanded instances.
 * The expansion logic will happen in the component that uses this hook.
 */
export function useCalendarEvents(startDate: Date, endDate: Date) {
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  return useQuery<CalendarEvent[], Error>({
    queryKey: [CALENDAR_EVENTS_QUERY_KEY, start, end],
    queryFn: async () => {
      // Fetch events that are not recurring and fall within the window
      // OR events that are recurring and started before the window ends
      // and whose recurrence ends after the window starts.
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .lt('start_date', end) // Event starts before the window ends
        .or(`rrule->>until.gte.${start},rrule.is.null`); // And it's recurring and ends after window starts, OR it's not recurring at all

      if (error) {
        console.error("Error fetching calendar events:", error);
        throw error;
      }
      
      return data || [];
    },
  });
}

/**
 * Hook to create a new calendar event.
 */
export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: CalendarEventInsert) => {
      const { data, error } = await supabase
        .from('calendar_events')
        .insert(event)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CALENDAR_EVENTS_QUERY_KEY] });
      toast({ title: 'Запис створено', description: 'Подію успішно додано до календаря.' });
    },
    onError: (error) => {
      toast({ title: 'Помилка створення', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Hook to update an existing calendar event.
 */
export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & CalendarEventUpdate) => {
      const { data, error } = await supabase
        .from('calendar_events')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CALENDAR_EVENTS_QUERY_KEY] });
      toast({ title: 'Запис оновлено', description: 'Зміни успішно збережено.' });
    },
    onError: (error) => {
      toast({ title: 'Помилка оновлення', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Hook to delete a calendar event record.
 * Note: This performs a hard delete. For recurring events, consider updating
 * the 'rrule' or 'excluded_dates' instead for more complex scenarios.
 */
export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CALENDAR_EVENTS_QUERY_KEY] });
      toast({ title: 'Запис видалено' });
    },
    onError: (error) => {
      toast({ title: 'Помилка видалення', description: error.message, variant: 'destructive' });
    },
  });
}
