import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { PageHeader } from '@/components/layout/PageHeader';
import { useActivities } from '@/hooks/useActivities';
import { useGroupLessons } from '@/hooks/useGroupLessons';
import { useGroupLessonSessions, useUpsertGroupLessonSession, useDeleteGroupLessonSession } from '@/hooks/useGroupLessonSessions';
import { useAllStaffBillingRulesForActivity, getStaffBillingRuleForDate, useDeleteStaffJournalEntry, useUpsertStaffJournalEntry } from '@/hooks/useStaffBilling';
import { useStaff } from '@/hooks/useStaff';
import { applyDeductionsToAmount } from '@/lib/staffSalary';
import { formatCurrency, formatDateString, getDaysInMonth, getWeekdayShort, isWeekend } from '@/lib/attendance';
import { cn } from '@/lib/utils';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

export default function GroupLessonsJournal() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [activityId, setActivityId] = useState<string>('');
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  const { data: activities = [], isLoading: activitiesLoading } = useActivities();
  const { data: staff = [] } = useStaff();
  const { data: groupLessons = [], isLoading: lessonsLoading } = useGroupLessons(activityId || undefined);
  const { data: sessions = [], isLoading: sessionsLoading } = useGroupLessonSessions({ activityId: activityId || undefined, month, year });
  const { data: rules = [] } = useAllStaffBillingRulesForActivity(activityId || undefined);

  const upsertSession = useUpsertGroupLessonSession();
  const deleteSession = useDeleteGroupLessonSession();
  const upsertStaffEntry = useUpsertStaffJournalEntry();
  const deleteStaffEntry = useDeleteStaffJournalEntry();

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const activityOptions = useMemo(
    () => activities.filter((activity) => !['expense', 'household_expense', 'salary'].includes(activity.category)),
    [activities]
  );

  useEffect(() => {
    if (!activityId && activityOptions.length > 0) {
      setActivityId(activityOptions[0].id);
    }
  }, [activityId, activityOptions]);

  useEffect(() => {
    const map: Record<string, string> = {};
    sessions.forEach((session) => {
      map[`${session.group_lesson_id}-${session.session_date}`] = String(session.sessions_count);
    });
    setLocalValues(map);
  }, [sessions]);

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const getStaffName = (id: string) => staff.find((member) => member.id === id)?.full_name || 'Невідомий';

  const syncStaffAccruals = async (lessonId: string, dateStr: string, count: number) => {
    const lesson = groupLessons.find((item) => item.id === lessonId);
    if (!lesson || !activityId) return;

    const staffIds = (lesson.staff || []).map((member) => member.id);
    if (staffIds.length === 0) return;

    await Promise.all(staffIds.map(async (staffId) => {
      const staffRules = rules.filter((rule) => rule.staff_id === staffId);
      const rule = getStaffBillingRuleForDate(staffRules, dateStr, activityId, lessonId);
      if (!rule) return;

      let baseAmount = 0;
      if (rule.rate_type === 'per_session' || rule.rate_type === 'per_student') {
        baseAmount = rule.rate * count;
      } else if (rule.rate_type === 'fixed') {
        baseAmount = count > 0 ? rule.rate : 0;
      } else {
        return;
      }

      const { finalAmount, deductionsApplied } = applyDeductionsToAmount(
        baseAmount,
        staff.find((member) => member.id === staffId)?.deductions || []
      );

      await upsertStaffEntry.mutateAsync({
        staff_id: staffId,
        activity_id: activityId,
        group_lesson_id: lessonId,
        date: dateStr,
        amount: finalAmount,
        base_amount: baseAmount,
        deductions_applied: deductionsApplied,
        is_manual_override: false,
        notes: `Групове заняття: ${lesson.name} · ${count} зан.`,
      });
    }));
  };

  const clearStaffAccruals = async (lessonId: string, dateStr: string) => {
    const lesson = groupLessons.find((item) => item.id === lessonId);
    if (!lesson || !activityId) return;
    const staffIds = (lesson.staff || []).map((member) => member.id);
    await Promise.all(staffIds.map(async (staffId) => {
      await deleteStaffEntry.mutateAsync({
        staff_id: staffId,
        activity_id: activityId,
        group_lesson_id: lessonId,
        date: dateStr,
        is_manual_override: false,
      });
    }));
  };

  const handleValueChange = (lessonId: string, dateStr: string, value: string) => {
    setLocalValues((prev) => ({
      ...prev,
      [`${lessonId}-${dateStr}`]: value,
    }));
  };

  const handleValueBlur = async (lessonId: string, dateStr: string) => {
    const key = `${lessonId}-${dateStr}`;
    const raw = localValues[key];
    const parsed = raw === undefined || raw === '' ? 0 : Math.max(0, Math.round(Number(raw)));

    if (!parsed) {
      await deleteSession.mutateAsync({ groupLessonId: lessonId, date: dateStr });
      await clearStaffAccruals(lessonId, dateStr);
      return;
    }

    await upsertSession.mutateAsync({
      group_lesson_id: lessonId,
      session_date: dateStr,
      sessions_count: parsed,
      notes: null,
    });

    await syncStaffAccruals(lessonId, dateStr, parsed);
  };

  const isLoading = activitiesLoading || lessonsLoading || sessionsLoading;

  return (
    <>
      <PageHeader
        title="Журнал групових занять"
        description="Фіксація кількості проведених занять по днях"
      />

      <div className="p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold">
              {MONTHS[month]} {year}
            </h2>
            <Button variant="outline" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground">Активність:</Label>
            <Select value={activityId} onValueChange={setActivityId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Оберіть активність" />
              </SelectTrigger>
              <SelectContent>
                {activityOptions.map((activity) => (
                  <SelectItem key={activity.id} value={activity.id}>
                    {activity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : groupLessons.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Немає групових занять для обраної активності</p>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full border-collapse">
              <thead className="bg-muted/50">
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left text-sm font-medium text-muted-foreground min-w-[220px]">
                    Групове заняття
                  </th>
                  {days.map((day) => (
                    <th
                      key={formatDateString(day)}
                      className={cn(
                        'px-1 py-2 text-center text-xs font-medium min-w-[52px]',
                        isWeekend(day)
                          ? 'text-muted-foreground/50 bg-amber-50/70 dark:bg-amber-900/20'
                          : 'text-muted-foreground'
                      )}
                    >
                      <div>{getWeekdayShort(day)}</div>
                      <div className="font-semibold">{day.getDate()}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupLessons.map((lesson) => (
                  <tr key={lesson.id} className="border-t">
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 text-sm font-medium">
                      <div>{lesson.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(lesson.staff || []).map((member) => member.full_name).join(', ') || 'Без викладачів'}
                      </div>
                    </td>
                    {days.map((day) => {
                      const dateStr = formatDateString(day);
                      const key = `${lesson.id}-${dateStr}`;
                      const value = localValues[key] ?? '';
                      return (
                        <td
                          key={dateStr}
                          className={cn(
                            'px-1 py-1 text-center',
                            isWeekend(day) && 'bg-amber-50/70 dark:bg-amber-900/20'
                          )}
                        >
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={value}
                            onChange={(event) => handleValueChange(lesson.id, dateStr, event.target.value)}
                            onBlur={() => handleValueBlur(lesson.id, dateStr)}
                            className="h-8 w-14 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          Кількість занять у клітинці множиться на ставку педагога. Поточна ставка береться з індивідуальних правил для цієї активності та групового заняття.
        </p>
      </div>
    </>
  );
}
