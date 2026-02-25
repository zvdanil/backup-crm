import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getMonthStartDate, getMonthEndDate, formatLocalDate } from '@/lib/attendance';
import { isGardenAttendanceController } from '@/lib/gardenAttendance';
import type { Student } from './useStudents';
import type { Activity } from './useActivities';

export interface Enrollment {
  id: string;
  student_id: string;
  activity_id: string;
  teacher_id: string | null;
  custom_price: number | null;
  discount_percent: number | null;
  account_id: string | null; // Payment account for charges (рахунок для нарахувань)
  is_active: boolean;
  enrolled_at: string;
  unenrolled_at: string | null;
  effective_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnrollmentWithRelations extends Enrollment {
  students: Student;
  activities: Activity;
}

export type EnrollmentInsert = Pick<Enrollment, 'student_id' | 'activity_id' | 'custom_price' | 'discount_percent' | 'account_id'>;
export type EnrollmentUpdate = Partial<Omit<Enrollment, 'id' | 'student_id' | 'activity_id' | 'created_at' | 'updated_at'>>;

export function useEnrollments(filters?: { studentId?: string; activityId?: string; activeOnly?: boolean }) {
  return useQuery({
    queryKey: ['enrollments', filters],
    queryFn: async () => {
      let query = supabase
        .from('enrollments')
        .select(`
          *,
          students (
            *,
            groups (
              id,
              name,
              color
            )
          ),
          activities (*)
        `)
        .order('enrolled_at', { ascending: false });
      
      if (filters?.studentId) {
        query = query.eq('student_id', filters.studentId);
      }
      if (filters?.activityId) {
        query = query.eq('activity_id', filters.activityId);
      }
      if (filters?.activeOnly) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as EnrollmentWithRelations[];
    },
  });
}

export function useEnrollment(id: string) {
  return useQuery({
    queryKey: ['enrollments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          *,
          students (
            *,
            groups (
              id,
              name,
              color
            )
          ),
          activities (*)
        `)
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data as EnrollmentWithRelations | null;
    },
    enabled: !!id,
  });
}

export function useCreateEnrollment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (enrollment: EnrollmentInsert) => {
      // Спочатку перевіряємо, чи існує запис з такими student_id та activity_id
      const { data: existing, error: checkError } = await supabase
        .from('enrollments')
        .select('id')
        .eq('student_id', enrollment.student_id)
        .eq('activity_id', enrollment.activity_id)
        .maybeSingle();
      
      if (checkError) throw checkError;

      let result;
      if (existing) {
        // Якщо запис існує - оновлюємо його (ON CONFLICT DO UPDATE)
        const { data, error } = await supabase
          .from('enrollments')
          .update({
            custom_price: enrollment.custom_price,
            discount_percent: enrollment.discount_percent,
            account_id: enrollment.account_id ?? null,
            is_active: true,
            enrolled_at: new Date().toISOString(),
            unenrolled_at: null, // Скидаємо unenrolled_at, якщо повторно записуємо
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      } else {
        // Якщо запис не існує - створюємо новий
        const { data, error } = await supabase
          .from('enrollments')
          .insert({
            ...enrollment,
            account_id: enrollment.account_id ?? null,
            is_active: true,
            enrolled_at: new Date().toISOString(),
          })
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast({ title: 'Дитину записано на активність' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateEnrollment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...enrollment }: { id: string } & EnrollmentUpdate) => {
      // Проверяем, изменилась ли цена или скидка
      const priceChanged = 
        enrollment.custom_price !== undefined || 
        enrollment.discount_percent !== undefined;
      
      let oldEnrollment: Enrollment | null = null;
      if (priceChanged) {
        // Получаем старые значения для создания истории
        const { data: old, error: oldError } = await supabase
          .from('enrollments')
          .select('custom_price, discount_percent')
          .eq('id', id)
          .single();
        
        if (oldError) throw oldError;
        oldEnrollment = old as Enrollment;
      }

      // Обновляем enrollment
      const { data, error } = await supabase
        .from('enrollments')
        .update(enrollment)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // Если изменилась цена или скидка, создаём запись в истории
      if (priceChanged && oldEnrollment) {
        const oldPrice = oldEnrollment.custom_price;
        const oldDiscount = oldEnrollment.discount_percent ?? 0;
        const newPrice = enrollment.custom_price ?? oldPrice;
        const newDiscount = enrollment.discount_percent ?? oldDiscount;

        // Создаём запись только если действительно изменилось значение
        const priceActuallyChanged = 
          oldPrice !== newPrice || oldDiscount !== newDiscount;

        if (priceActuallyChanged) {
          const effectiveFrom = enrollment.effective_from 
            ? formatLocalDate(new Date(enrollment.effective_from))
            : formatLocalDate(new Date()); // Текущая дата по умолчанию

          // Закрываем предыдущую запись истории (устанавливаем effective_to)
          await supabase
            .from('enrollment_price_history')
            .update({ effective_to: effectiveFrom })
            .eq('enrollment_id', id)
            .is('effective_to', null);

          // Создаём новую запись в истории
          await supabase
            .from('enrollment_price_history')
            .insert({
              enrollment_id: id,
              custom_price: newPrice,
              discount_percent: newDiscount,
              effective_from: effectiveFrom,
              effective_to: null,
            });
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment_price_history'] });
      queryClient.invalidateQueries({ queryKey: ['student_account_balances'] });
      queryClient.invalidateQueries({ queryKey: ['payment_allocation'] });
      toast({ title: 'Запись обновлена' });
    },
    onError: (error) => {
      toast({ title: 'Ошибка', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUnenrollStudent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      // Перевіряємо, чи існує запис перед видаленням
      const { data: existing, error: checkError } = await supabase
        .from('enrollments')
        .select('id, student_id, activity_id')
        .eq('id', id)
        .maybeSingle();
      
      if (checkError) throw checkError;
      
      if (!existing) {
        throw new Error('Запис не знайдено');
      }

      // Виконуємо soft delete - встановлюємо is_active = false
      const { data, error } = await supabase
        .from('enrollments')
        .update({
          is_active: false,
          unenrolled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['student_account_balances'] });
      queryClient.invalidateQueries({ queryKey: ['payment_allocation'] });
      toast({ title: 'Дитину відписано від активності' });
    },
    onError: (error) => {
      toast({ title: 'Помилка', description: error.message, variant: 'destructive' });
    },
  });
}

// ============================================
// Enrollment Price History (История изменения цен подписки)
// ============================================

export interface EnrollmentPriceHistory {
  id: string;
  enrollment_id: string;
  custom_price: number | null;
  discount_percent: number | null;
  effective_from: string; // DATE
  effective_to: string | null; // DATE
  created_at: string;
  updated_at: string;
}

/**
 * Получить цену подписки на конкретную дату из истории или текущих значений
 * @param enrollment - подписка с текущими значениями custom_price и discount_percent
 * @param priceHistory - массив записей истории цен (отсортированный по effective_from DESC)
 * @param date - дата в формате YYYY-MM-DD
 * @returns объект с custom_price и discount_percent для указанной даты
 */
export function getEnrollmentPriceForDate(
  enrollment: { custom_price: number | null; discount_percent: number | null },
  priceHistory: EnrollmentPriceHistory[] | undefined,
  date: string, // YYYY-MM-DD
): { custom_price: number | null; discount_percent: number | null } {
  if (!priceHistory || priceHistory.length === 0) {
    // Если истории нет, используем текущие значения
    return {
      custom_price: enrollment.custom_price,
      discount_percent: enrollment.discount_percent ?? 0,
    };
  }

  // Находим запись истории, которая действовала на указанную дату (effective_to — исключающая граница: с этой даты уже новая цена)
  const effectiveRecord = priceHistory.find((record) => {
    const fromDate = record.effective_from;
    const toDate = record.effective_to;
    if (date < fromDate) return false;
    if (toDate && date >= toDate) return false;
    return true;
  });

  if (effectiveRecord) {
    return {
      custom_price: effectiveRecord.custom_price,
      discount_percent: effectiveRecord.discount_percent ?? 0,
    };
  }

  // Если не найдена запись для даты, используем текущие значения
  return {
    custom_price: enrollment.custom_price,
    discount_percent: enrollment.discount_percent ?? 0,
  };
}

/**
 * Чи покриває історія цін запису хоча б один період для місяця (для видимості в балансах)
 */
export function enrollmentHistoryCoversMonth(
  history: EnrollmentPriceHistory[] | undefined,
  year: number,
  month: number,
): boolean {
  if (!history || history.length === 0) return false;
  const firstDay = getMonthStartDate(year, month);
  const lastDay = getMonthEndDate(year, month);
  return history.some((record) => {
    const from = record.effective_from;
    const to = record.effective_to;
    if (from > lastDay) return false;
    if (to != null && to <= firstDay) return false;
    return true;
  });
}

/**
 * Чи потрапляє запис у нарахування балансу для даного місяця.
 * Одна логіка для «Баланс по рахунках» і «Розподіл по послугах» — тільки ці записи показуються.
 */
export function enrollmentInScopeForMonth(
  enrollment: {
    id: string;
    activity_id: string;
    is_active: boolean;
    unenrolled_at: string | null;
    effective_from: string | null;
    enrolled_at: string;
  },
  activity: { id: string; config?: unknown } | null | undefined,
  history: EnrollmentPriceHistory[] | undefined,
  year: number,
  month: number,
): boolean {
  if (activity && isGardenAttendanceController(activity)) return false;
  const isActive = enrollment.is_active === true;
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const isFutureMonth = year > currentYear || (year === currentYear && month > currentMonth);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const unenrolledDate = enrollment.unenrolled_at ? new Date(enrollment.unenrolled_at) : null;

  // Архивний запис (is_active не true): тільки якщо знятий саме в цьому місяці
  if (!isActive) {
    if (!enrollment.unenrolled_at) return false;
    if (unenrolledDate! < monthStart) return false;
    if (unenrolledDate! > monthEnd) return false;
    return true;
  }

  if (unenrolledDate && unenrolledDate < monthStart) return false;
  const coversByHistory = enrollmentHistoryCoversMonth(history, year, month);
  if (history && history.length > 0) {
    if (!coversByHistory) return false;
    if (isFutureMonth) return true;
    return true;
  }
  const effectiveDate = (enrollment.effective_from ?? enrollment.enrolled_at)
    ? new Date(enrollment.effective_from ?? enrollment.enrolled_at)
    : null;
  if (effectiveDate && effectiveDate > monthEnd) return false;
  if (isFutureMonth) return !!effectiveDate && effectiveDate <= monthEnd;
  return true;
}

/**
 * Хук для загрузки истории цен подписки
 */
export function useEnrollmentPriceHistory(enrollmentId: string) {
  return useQuery({
    queryKey: ['enrollment_price_history', enrollmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollment_price_history')
        .select('*')
        .eq('enrollment_id', enrollmentId)
        .order('effective_from', { ascending: false });

      if (error) throw error;
      return (data || []) as EnrollmentPriceHistory[];
    },
    enabled: !!enrollmentId,
  });
}

/**
 * Завантажити історію цін для списку записів (для фільтра «показувати в місяці» по історії)
 */
export function useEnrollmentPriceHistoryMap(enrollmentIds: string[]) {
  const key = enrollmentIds.slice().sort().join(',');
  return useQuery({
    queryKey: ['enrollment_price_history_map', key],
    queryFn: async (): Promise<Map<string, EnrollmentPriceHistory[]>> => {
      if (enrollmentIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from('enrollment_price_history')
        .select('*')
        .in('enrollment_id', enrollmentIds)
        .order('effective_from', { ascending: false });

      if (error) throw error;
      const map = new Map<string, EnrollmentPriceHistory[]>();
      (data || []).forEach((row: EnrollmentPriceHistory) => {
        const id = row.enrollment_id;
        if (!map.has(id)) map.set(id, []);
        map.get(id)!.push(row);
      });
      return map;
    },
    enabled: enrollmentIds.length > 0,
  });
}
