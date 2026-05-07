import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getMonthStartDate, getMonthEndDate, formatLocalDate, calculateValueFromBillingRules } from '@/lib/attendance';
import { isGardenAttendanceController } from '@/lib/gardenAttendance';
import type { Student } from './useStudents';
import type { Activity, ActivityPriceHistory } from './useActivities';
import { getBillingRulesForDate } from './useActivities';
import type { AttendanceStatus } from '@/lib/attendance';

const supabaseAny = supabase as any;

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

type UpdateEnrollmentMutationInput = { id: string } &
  EnrollmentUpdate & {
    refresh_student_id?: string;
    recalc_from?: string;
    recalc_to?: string;
  };

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

  const getMonthsInRange = (from: string, to: string): Array<{ month: number; year: number }> => {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const out: Array<{ month: number; year: number }> = [];
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endMonth) {
      out.push({ month: cursor.getMonth(), year: cursor.getFullYear() });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  };

  const toMonthKey = (month: number, year: number) => `${year}-${month}`;

  const recalcAttendanceInRange = async (options: {
    enrollment: {
      id: string;
      student_id: string;
      activity_id: string;
      account_id: string | null;
      custom_price: number | null;
      discount_percent: number | null;
    };
    activity: { account_id: string | null; billing_rules: any | null };
    activityPriceHistory: ActivityPriceHistory[];
    enrollmentPriceHistory: EnrollmentPriceHistory[];
    accountHistory: Array<{
      account_id: string | null;
      effective_from: string;
      effective_to: string | null;
    }>;
    rangeFrom: string;
    rangeTo: string;
  }) => {
    const {
      enrollment,
      activity,
      activityPriceHistory,
      enrollmentPriceHistory,
      accountHistory,
      rangeFrom,
      rangeTo,
    } = options;

    const months = getMonthsInRange(rangeFrom, rangeTo);
    if (months.length === 0) return;

    const rangeStart = getMonthStartDate(months[0].year, months[0].month);
    const rangeEnd = getMonthEndDate(
      months[months.length - 1].year,
      months[months.length - 1].month,
    );

    const { data: attendanceRows, error: attendanceError } = await supabaseAny
      .from('attendance')
      .select('id, enrollment_id, date, status, charged_amount, value, notes, manual_value_edit')
      .eq('enrollment_id', enrollment.id)
      .gte('date', rangeStart)
      .lte('date', rangeEnd)
      .order('date', { ascending: true });
    if (attendanceError) throw attendanceError;

    if (!attendanceRows || attendanceRows.length === 0) return;

    const { data: existingTransactions, error: txError } = await supabaseAny
      .from('finance_transactions')
      .select('id, date')
      .eq('student_id', enrollment.student_id)
      .eq('activity_id', enrollment.activity_id)
      .eq('type', 'income')
      .gte('date', rangeStart)
      .lte('date', rangeEnd);
    if (txError) throw txError;

    const txByDate = new Map<string, string>();
    (existingTransactions || []).forEach((tx: { id: string; date: string }) => {
      txByDate.set(tx.date, tx.id);
    });

    const resolveAccountIdForDate = (date: string) => {
      const row = accountHistory.find((h) => {
        if (date < h.effective_from) return false;
        if (h.effective_to && date >= h.effective_to) return false;
        return true;
      });
      return row?.account_id ?? enrollment.account_id ?? activity.account_id ?? null;
    };

    const attendanceByMonth = new Map<string, typeof attendanceRows>();
    attendanceRows.forEach((row: any) => {
      const dateObj = new Date(`${row.date}T00:00:00`);
      const key = toMonthKey(dateObj.getMonth(), dateObj.getFullYear());
      const list = attendanceByMonth.get(key);
      if (list) list.push(row);
      else attendanceByMonth.set(key, [row]);
    });

    const updates: Array<{
      attendance_id: string;
      date: string;
      status: AttendanceStatus | null;
      charged_amount: number;
      value: number | null;
      notes: string | null;
    }> = [];

    attendanceByMonth.forEach((rows) => {
      const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const visitCountByStatus = new Map<string, number>();

      for (const record of sortedRows) {
        const billingRulesForDate = activityPriceHistory
          ? getBillingRulesForDate(activity as any, activityPriceHistory, record.date)
          : activity.billing_rules;

        const customStatus = billingRulesForDate?.custom_statuses?.find(
          (cs: any) =>
            cs.id === record.status &&
            cs.is_active !== false &&
            cs.type === 'subscription_with_logic',
        );

        let visitCountBefore = 0;
        if (customStatus) {
          visitCountBefore = visitCountByStatus.get(record.status) || 0;
          visitCountByStatus.set(record.status, visitCountBefore + 1);
        }

        if (record.date < rangeFrom || record.date > rangeTo) {
          continue;
        }

        // Пропускаємо записи з ручними правками — їх не перезаписуємо
        if (record.manual_value_edit) continue;

        let newValue: number | null = null;
        let chargedAmount = 0;

        if (record.status === null) {
          // Числові відмітки: використовуємо поточне value як джерело
          newValue = record.value ?? null;
          chargedAmount = newValue !== null ? newValue : 0;
        } else {
          const result = calculateAttendanceChargeForRecalc({
            date: record.date,
            status: record.status as AttendanceStatus | null,
            enrollment: {
              custom_price: enrollment.custom_price,
              discount_percent: enrollment.discount_percent,
            },
            activity,
            activityPriceHistory,
            enrollmentPriceHistory,
            visitCountBefore,
          });
          newValue = result.value;
          chargedAmount = result.chargedAmount;
        }

        const currentAmount = record.charged_amount ?? 0;

        if (currentAmount !== chargedAmount || record.value !== newValue) {
          updates.push({
            attendance_id: record.id,
            date: record.date,
            status: record.status,
            charged_amount: chargedAmount,
            value: newValue,
            notes: record.notes ?? null,
          });
        }
      }
    });

    if (updates.length === 0) return;

    const updateAttendancePromises = updates.map((u) =>
      supabaseAny
        .from('attendance')
        .update({
          charged_amount: u.charged_amount,
          value: u.value,
          manual_value_edit: false,
        })
        .eq('enrollment_id', enrollment.id)
        .eq('date', u.date),
    );

    const updateAttendanceResults = await Promise.allSettled(updateAttendancePromises);
    const attendanceErrors = updateAttendanceResults.filter((r) => r.status === 'rejected');
    if (attendanceErrors.length > 0) {
      throw new Error('Failed to update attendance during recalculation');
    }

    const txPromises: Promise<any>[] = [];
    updates.forEach((u) => {
      const txId = txByDate.get(u.date);
      const accountId = resolveAccountIdForDate(u.date);

      if (u.charged_amount > 0) {
        if (txId) {
          txPromises.push(
            supabaseAny
              .from('finance_transactions')
              .update({
                amount: u.charged_amount,
                account_id: accountId,
                description: 'Нарахування за відвідування',
                attendance_id: u.attendance_id,
              })
              .eq('id', txId),
          );
        } else {
          txPromises.push(
            supabaseAny.from('finance_transactions').insert({
              type: 'income',
              student_id: enrollment.student_id,
              activity_id: enrollment.activity_id,
              account_id: accountId,
              amount: u.charged_amount,
              date: u.date,
              description: 'Нарахування за відвідування',
              attendance_id: u.attendance_id,
            }),
          );
        }
      } else if (txId) {
        txPromises.push(
          supabaseAny.from('finance_transactions').delete().eq('id', txId),
        );
      }
    });

    if (txPromises.length > 0) {
      const txResults = await Promise.allSettled(txPromises);
      const txErrors = txResults.filter((r) => r.status === 'rejected');
      if (txErrors.length > 0) {
        throw new Error('Failed to update finance transactions during recalculation');
      }
    }
  };

  const buildTargetMonths = (variables: UpdateEnrollmentMutationInput) => {
    if (variables.recalc_from && variables.recalc_to) {
      return getMonthsInRange(variables.recalc_from, variables.recalc_to);
    }
    if (variables.effective_from) {
      const d = new Date(`${variables.effective_from}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        return [{ month: d.getMonth(), year: d.getFullYear() }];
      }
    }
    return [];
  };

  const runTargetedRecalcRefresh = async (
    studentId: string,
    variables: UpdateEnrollmentMutationInput,
  ) => {
    const months = buildTargetMonths(variables);
    const monthKeySet = new Set(months.map(({ month, year }) => toMonthKey(month, year)));
    const hasMonthFilter = monthKeySet.size > 0;

    const matchesMonthFilter = (month: unknown, year: unknown) => {
      if (!hasMonthFilter) return true;
      if (typeof month !== 'number' || typeof year !== 'number') return false;
      return monthKeySet.has(toMonthKey(month, year));
    };

    const recalcPredicates = {
      balances: (query: { queryKey: unknown[] }) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key[0] === 'student_account_balances' &&
          key[1] === studentId &&
          matchesMonthFilter(key[2], key[3])
        );
      },
      total: (query: { queryKey: unknown[] }) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key[0] === 'student_total_balance' &&
          key[1] === studentId &&
          matchesMonthFilter(key[2], key[3])
        );
      },
      allocation: (query: { queryKey: unknown[] }) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key[0] === 'payment_allocation' &&
          key[1] === studentId &&
          matchesMonthFilter(key[2], key[3])
        );
      },
    };

    const invalidationResults = await Promise.allSettled([
      queryClient.invalidateQueries({ predicate: recalcPredicates.balances }),
      queryClient.invalidateQueries({ predicate: recalcPredicates.total }),
      queryClient.invalidateQueries({ predicate: recalcPredicates.allocation }),
    ]);

    const refetchResults = await Promise.allSettled([
      queryClient.refetchQueries({
        predicate: recalcPredicates.balances,
        type: 'active',
      }),
      queryClient.refetchQueries({
        predicate: recalcPredicates.total,
        type: 'active',
      }),
      queryClient.refetchQueries({
        predicate: recalcPredicates.allocation,
        type: 'active',
      }),
    ]);

    const rejected = [...invalidationResults, ...refetchResults].filter(
      (result) => result.status === 'rejected',
    );

    if (rejected.length > 0) {
      const rejectedReasons = rejected.map((result) =>
        result.status === 'rejected'
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : '',
      );
      console.error('[useUpdateEnrollment] Targeted recalc refresh failed', {
        studentId,
        months,
        failedOperations: rejected.length,
        reasons: rejectedReasons,
      });
      toast({
        title: 'Ціну збережено, але перерахунок частково не оновився',
        description: 'Оновіть сторінку або перевірте баланс пізніше.',
        variant: 'destructive',
      });
    }
  };
  
  return useMutation({
    mutationFn: async ({ id, refresh_student_id: _refreshStudentId, recalc_from: _recalcFrom, recalc_to: _recalcTo, ...enrollment }: UpdateEnrollmentMutationInput) => {
      const { effective_from, ...enrollmentPatch } = enrollment;
      // Use the YYYY-MM-DD string directly — converting through new Date() triggers UTC parse
      // and shifts the date by one day in UTC+N timezones (project rule 2).
      const effectiveFromDate = effective_from ?? formatLocalDate(new Date());

      const { data: enrollmentMeta, error: enrollmentMetaError } = await supabaseAny
        .from('enrollments')
        .select(`
          id,
          student_id,
          activity_id,
          enrolled_at,
          effective_from,
          account_id,
          custom_price,
          discount_percent,
          activities (
            account_id
          )
        `)
        .eq('id', id)
        .single();
      if (enrollmentMetaError) throw enrollmentMetaError;

      const priceChanged =
        enrollmentPatch.custom_price !== undefined ||
        enrollmentPatch.discount_percent !== undefined;
      const currentEffectiveFrom =
        enrollmentMeta.effective_from ??
        enrollmentMeta.enrolled_at ??
        formatLocalDate(new Date());
      const effectiveFromChanged = Boolean(effective_from) && effectiveFromDate !== currentEffectiveFrom;
      // Persist effective_from to the enrollments table so enrollmentInScopeForMonth
      // respects the backdated start when there is no price-history entry yet.
      if (effectiveFromChanged) {
        enrollmentPatch.effective_from = effectiveFromDate;
      }
      const accountChanged =
        enrollmentPatch.account_id !== undefined &&
        enrollmentPatch.account_id !== (enrollmentMeta.account_id ?? null);
      const accountRebindRequested =
        enrollmentPatch.account_id !== undefined &&
        (accountChanged || effectiveFromChanged);

      if (priceChanged) {
        const oldPrice = enrollmentMeta.custom_price;
        const oldDiscount = enrollmentMeta.discount_percent ?? 0;
        const newPrice = enrollmentPatch.custom_price ?? oldPrice;
        const newDiscount = enrollmentPatch.discount_percent ?? oldDiscount;
        const priceActuallyChanged = oldPrice !== newPrice || oldDiscount !== newDiscount;

        if (priceActuallyChanged) {
          const { error: rpcError } = await supabaseAny.rpc('set_enrollment_price', {
            p_enrollment_id: id,
            p_custom_price: newPrice,
            p_discount_percent: newDiscount,
            p_effective_from: effectiveFromDate,
          });
          if (rpcError) throw rpcError;
        }
      }

      if (accountRebindRequested) {
        const { error: accountRpcError } = await supabaseAny.rpc('set_enrollment_account', {
          p_enrollment_id: id,
          p_account_id: enrollmentPatch.account_id ?? null,
          p_effective_from: effectiveFromDate,
        });
        if (accountRpcError) throw accountRpcError;

        const { data: intervalRow, error: intervalError } = await supabaseAny
          .from('enrollment_account_history')
          .select('effective_to')
          .eq('enrollment_id', id)
          .eq('effective_from', effectiveFromDate)
          .maybeSingle();
        if (intervalError && intervalError.code !== 'PGRST116') throw intervalError;

        const targetAccountId =
          enrollmentPatch.account_id ??
          enrollmentMeta.activities?.account_id ??
          null;

        let txUpdateQuery = supabaseAny
          .from('finance_transactions')
          .update({ account_id: targetAccountId })
          .eq('student_id', enrollmentMeta.student_id)
          .eq('activity_id', enrollmentMeta.activity_id)
          .eq('type', 'income')
          .gte('date', effectiveFromDate);

        if (intervalRow?.effective_to) {
          const toDate = new Date(`${intervalRow.effective_to}T00:00:00`);
          toDate.setDate(toDate.getDate() - 1);
          txUpdateQuery = txUpdateQuery.lte('date', formatLocalDate(toDate));
        }

        const { error: txUpdateError } = await txUpdateQuery;
        if (txUpdateError) throw txUpdateError;

        const today = formatLocalDate(new Date());
        const { data: currentAccountRow, error: currentAccountError } = await supabaseAny
          .from('enrollment_account_history')
          .select('account_id')
          .eq('enrollment_id', id)
          .lte('effective_from', today)
          .or(`effective_to.is.null,effective_to.gt.${today}`)
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (currentAccountError && currentAccountError.code !== 'PGRST116') {
          throw currentAccountError;
        }

        enrollmentPatch.account_id = currentAccountRow?.account_id ?? enrollmentMeta.account_id ?? null;
      }

      if (_recalcFrom && _recalcTo) {
        const { data: activityRow, error: activityError } = await supabaseAny
          .from('activities')
          .select('id, billing_rules, account_id')
          .eq('id', enrollmentMeta.activity_id)
          .single();
        if (activityError) throw activityError;

        const { data: activityPriceHistory, error: activityHistoryError } = await supabaseAny
          .from('activity_price_history')
          .select('id, activity_id, billing_rules, effective_from, effective_to, created_at')
          .eq('activity_id', enrollmentMeta.activity_id)
          .order('effective_from', { ascending: false });
        if (activityHistoryError) throw activityHistoryError;

        const { data: enrollmentPriceHistory, error: enrollmentHistoryError } = await supabaseAny
          .from('enrollment_price_history')
          .select('id, enrollment_id, custom_price, discount_percent, effective_from, effective_to, created_at, updated_at')
          .eq('enrollment_id', id)
          .order('effective_from', { ascending: false });
        if (enrollmentHistoryError) throw enrollmentHistoryError;

        const { data: accountHistory, error: accountHistoryError } = await supabaseAny
          .from('enrollment_account_history')
          .select('account_id, effective_from, effective_to')
          .eq('enrollment_id', id)
          .lte('effective_from', _recalcTo)
          .or(`effective_to.is.null,effective_to.gt.${_recalcFrom}`)
          .order('effective_from', { ascending: false });
        if (accountHistoryError) throw accountHistoryError;

        await recalcAttendanceInRange({
          enrollment: {
            id,
            student_id: enrollmentMeta.student_id,
            activity_id: enrollmentMeta.activity_id,
            account_id: enrollmentMeta.account_id ?? null,
            custom_price: enrollmentPatch.custom_price ?? enrollmentMeta.custom_price ?? null,
            discount_percent: enrollmentPatch.discount_percent ?? enrollmentMeta.discount_percent ?? null,
          },
          activity: activityRow,
          activityPriceHistory: (activityPriceHistory || []) as ActivityPriceHistory[],
          enrollmentPriceHistory: (enrollmentPriceHistory || []) as EnrollmentPriceHistory[],
          accountHistory: (accountHistory || []) as Array<{
            account_id: string | null;
            effective_from: string;
            effective_to: string | null;
          }>,
          rangeFrom: _recalcFrom,
          rangeTo: _recalcTo,
        });
      }

      const { data, error } = await supabase
        .from('enrollments')
        .update(enrollmentPatch)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment_price_history'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment_price_history_map'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['enrollment_account_history'] });
      queryClient.invalidateQueries({ queryKey: ['enrollment_account_history_map'], exact: false });

      const studentId = variables.refresh_student_id;
      if (studentId) {
        await runTargetedRecalcRefresh(studentId, variables);

        // Deterministic refresh sequence after price update:
        // 1) enrollments + price history, 2) balances, 3) payment allocation.
        await Promise.all([
          queryClient.refetchQueries({
            queryKey: ['enrollments'],
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['enrollment_price_history'],
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['enrollment_price_history_map'],
            exact: false,
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['enrollment_account_history'],
            exact: false,
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['enrollment_account_history_map'],
            exact: false,
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['student_account_balances', studentId],
            exact: false,
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['student_total_balance', studentId],
            exact: false,
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['payment_allocation', studentId],
            exact: false,
            type: 'active',
          }),
        ]);
      } else {
        queryClient.invalidateQueries({ queryKey: ['student_account_balances'] });
        queryClient.invalidateQueries({ queryKey: ['payment_allocation'] });
        await Promise.all([
          queryClient.refetchQueries({
            queryKey: ['enrollments'],
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['enrollment_price_history'],
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['enrollment_price_history_map'],
            exact: false,
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['enrollment_account_history'],
            exact: false,
            type: 'active',
          }),
          queryClient.refetchQueries({
            queryKey: ['enrollment_account_history_map'],
            exact: false,
            type: 'active',
          }),
        ]);
      }
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

export interface EnrollmentAccountHistory {
  id: string;
  enrollment_id: string;
  account_id: string | null;
  effective_from: string;
  effective_to: string | null;
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
 * Унифицированный расчёт суммы начисления для одной записи посещения.
 * Используется в месячном перерасчёте (журнал) и в recalcAttendanceInRange (при смене цены).
 * Поддерживает историю цен активности и подписки.
 */
export function calculateAttendanceChargeForRecalc(params: {
  date: string;
  status: AttendanceStatus | null;
  enrollment: { custom_price: number | null; discount_percent: number | null };
  activity: { billing_rules: any } | null;
  activityPriceHistory?: ActivityPriceHistory[];
  enrollmentPriceHistory?: EnrollmentPriceHistory[];
  visitCountBefore: number;
}): { value: number | null; chargedAmount: number } {
  const {
    date,
    status,
    enrollment,
    activity,
    activityPriceHistory,
    enrollmentPriceHistory,
    visitCountBefore,
  } = params;

  const billingRulesForDate =
    activityPriceHistory && activity
      ? getBillingRulesForDate(activity as Activity, activityPriceHistory, date)
      : activity?.billing_rules ?? null;

  const priceForDate =
    enrollmentPriceHistory && enrollmentPriceHistory.length > 0
      ? getEnrollmentPriceForDate(enrollment, enrollmentPriceHistory, date)
      : {
          custom_price: enrollment.custom_price,
          discount_percent: enrollment.discount_percent ?? 0,
        };

  const value = calculateValueFromBillingRules(
    date,
    status,
    null,
    priceForDate.custom_price,
    priceForDate.discount_percent ?? 0,
    billingRulesForDate,
    visitCountBefore,
  );
  const chargedAmount = value !== null ? value : 0;
  return { value, chargedAmount };
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

  // Архивний запис: показувати в місяцях до та в місяці відписання включно.
  // У місяці відписання показуємо завжди — щоб була видна кнопка корзини.
  if (!isActive) {
    if (!enrollment.unenrolled_at) return false;
    if (unenrolledDate! < monthStart) return false; // місяць після відписання — не показувати
    // unenrolledDate >= monthStart: місяць відписання або раніше — показувати
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

export function getEnrollmentAccountForDate(
  enrollment: { account_id: string | null },
  accountHistory: EnrollmentAccountHistory[] | undefined,
  date: string,
): string | null {
  if (!accountHistory || accountHistory.length === 0) {
    return enrollment.account_id ?? null;
  }

  const effectiveRecord = accountHistory.find((record) => {
    const fromDate = record.effective_from;
    const toDate = record.effective_to;
    if (date < fromDate) return false;
    if (toDate && date >= toDate) return false;
    return true;
  });

  if (effectiveRecord) return effectiveRecord.account_id ?? null;
  return enrollment.account_id ?? null;
}

export function useEnrollmentAccountHistory(enrollmentId: string) {
  return useQuery({
    queryKey: ['enrollment_account_history', enrollmentId],
    queryFn: async () => {
      const { data, error } = await supabaseAny
        .from('enrollment_account_history')
        .select('*')
        .eq('enrollment_id', enrollmentId)
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return (data || []) as EnrollmentAccountHistory[];
    },
    enabled: !!enrollmentId,
  });
}

export function useEnrollmentAccountHistoryMap(enrollmentIds: string[]) {
  const key = enrollmentIds.slice().sort().join(',');
  return useQuery({
    queryKey: ['enrollment_account_history_map', key],
    queryFn: async (): Promise<Map<string, EnrollmentAccountHistory[]>> => {
      if (enrollmentIds.length === 0) return new Map();
      const { data, error } = await supabaseAny
        .from('enrollment_account_history')
        .select('*')
        .in('enrollment_id', enrollmentIds)
        .order('effective_from', { ascending: false });
      if (error) throw error;
      const map = new Map<string, EnrollmentAccountHistory[]>();
      (data || []).forEach((row: EnrollmentAccountHistory) => {
        const id = row.enrollment_id;
        if (!map.has(id)) map.set(id, []);
        map.get(id)!.push(row);
      });
      return map;
    },
    enabled: enrollmentIds.length > 0,
  });
}
