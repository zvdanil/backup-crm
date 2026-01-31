import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Holiday {
  id: string;
  date: string;
  name: string | null;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
}

export function useHolidays() {
  return useQuery({
    queryKey: ['holidays'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .order('date');
      
      if (error) throw error;
      return (data || []) as Holiday[];
    },
  });
}

/**
 * Get working days count in a month excluding holidays
 * Working days = Monday-Friday, excluding holidays
 */
export async function getWorkingDaysInMonthWithHolidays(
  year: number,
  month: number
): Promise<number> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  
  const { data: holidays, error } = await supabase
    .from('holidays')
    .select('date, is_recurring')
    .or(`and(date.gte.${startDate},date.lte.${endDate}),is_recurring.eq.true`);
  
  if (error) throw error;
  
  const holidayDates = new Set<string>();
  const holidayMonthDay = new Set<string>(); // For recurring holidays: "MM-DD"
  
  (holidays || []).forEach(holiday => {
    const dateStr = holiday.date;
    // Check if holiday is in the current month
    const holidayDate = new Date(dateStr);
    if (holidayDate.getFullYear() === year && holidayDate.getMonth() + 1 === month) {
      holidayDates.add(dateStr);
    }
    
    if (holiday.is_recurring) {
      const date = new Date(dateStr);
      const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      holidayMonthDay.add(monthDay);
    }
  });
  
  // Calculate working days
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Check if Monday-Friday
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const monthDay = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Check if it's a holiday
      const isHoliday = holidayDates.has(dateStr) || holidayMonthDay.has(monthDay);
      
      if (!isHoliday) {
        workingDays++;
      }
    }
  }
  
  return workingDays;
}
