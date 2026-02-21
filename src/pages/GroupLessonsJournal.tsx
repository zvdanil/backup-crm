import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { formatCurrency, formatDateString, getDaysInMonth, getWeekdayShort, isWeekend, WEEKEND_BG_COLOR, filterDaysByPeriod, type PeriodFilter } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

const getInitialDateFromParams = (searchParams: URLSearchParams) => {
  const urlDate = searchParams.get('date');
  if (urlDate) {
    const d = new Date(urlDate);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }
  return new Date();
};

export default function GroupLessonsJournal() {
  const [searchParams] = useSearchParams();
  const initialDate = useMemo(() => getInitialDateFromParams(searchParams), [searchParams]);

  const [year, setYear] = useState(() => initialDate.getFullYear());
  const [month, setMonth] = useState(() => initialDate.getMonth());
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('month');
  const [activityId, setActivityId] = useState<string>('');
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const { data: activities = [], isLoading: activitiesLoading } = useActivities();
  const { data: staff = [] } = useStaff();
  const { data: allGroupLessons = [] } = useGroupLessons();
  const { data: groupLessons = [], isLoading: lessonsLoading } = useGroupLessons(activityId || undefined);
  const { data: sessions = [], isLoading: sessionsLoading } = useGroupLessonSessions({ activityId: activityId || undefined, month, year });
  const { data: rules = [] } = useAllStaffBillingRulesForActivity(activityId || undefined);

  const upsertSession = useUpsertGroupLessonSession();
  const deleteSession = useDeleteGroupLessonSession();
  const upsertStaffEntry = useUpsertStaffJournalEntry();
  const deleteStaffEntry = useDeleteStaffJournalEntry();

  const allDays = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const days = useMemo(() => filterDaysByPeriod(allDays, periodFilter, new Date(year, month)), [allDays, periodFilter, year, month]);

  const activityOptions = useMemo(() => {
    const allowed = activities.filter(
      (activity) => !['expense', 'household_expense', 'salary'].includes(activity.category)
    );
    const activityIdsWithLessons = new Set(allGroupLessons.map((lesson) => lesson.activity_id));
    return allowed.filter((activity) => activityIdsWithLessons.has(activity.id));
  }, [activities, allGroupLessons]);


  useEffect(() => {
    const newInitialDate = getInitialDateFromParams(searchParams);
    setYear(newInitialDate.getFullYear());
    setMonth(newInitialDate.getMonth());

    const urlGroupLessonId = searchParams.get('groupLessonId');
    if (urlGroupLessonId && allGroupLessons.length > 0) {
      const lesson = allGroupLessons.find(l => l.id === urlGroupLessonId);
      if (lesson && lesson.activity_id) {
        setActivityId(lesson.activity_id);
        return;
      }
    }
    
    if (!activityId && activityOptions.length > 0) {
        setActivityId(activityOptions[0].id);
    }

  }, [searchParams, allGroupLessons, activityOptions]);


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

  const syncStaffAccruals = async (lessonId: string, dateStr: string, count: number) => {
    const lesson = groupLessons.find((item) => item.id === lessonId);
    if (!lesson || !activityId) return;

    const staffIds = (lesson.staff || []).map((member) => member.id);
    if (staffIds.length === 0) return;

    // Fetch manual overrides: skip staff who have manual entry for this date
    const { data: manualEntries = [] } = await supabase
      .from('staff_journal_entries')
      .select('staff_id')
      .eq('is_manual_override', true)
      .eq('activity_id', activityId)
      .eq('group_lesson_id', lessonId)
      .eq('date', dateStr)
      .in('staff_id', staffIds);
    const staffIdsWithManual = new Set(manualEntries.map((e: { staff_id: string }) => e.staff_id));

    await Promise.all(staffIds.map(async (staffId) => {
      if (staffIdsWithManual.has(staffId)) return;

      const staffRules = rules.filter((rule) => rule.staff_id === staffId);
      const rule = getStaffBillingRuleForDate(staffRules, dateStr, activityId, lessonId);
      if (!rule) {
        console.warn(`No billing rule found for staff ${staffId} on ${dateStr} for lesson ${lessonId}`);
        return;
      };

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
    if (staffIds.length === 0) return;

    const { data: manualEntries = [] } = await supabase
      .from('staff_journal_entries')
      .select('staff_id')
      .eq('is_manual_override', true)
      .eq('activity_id', activityId)
      .eq('group_lesson_id', lessonId)
      .eq('date', dateStr)
      .in('staff_id', staffIds);
    const staffIdsWithManual = new Set(manualEntries.map((e: { staff_id: string }) => e.staff_id));

    await Promise.all(staffIds.map(async (staffId) => {
      if (staffIdsWithManual.has(staffId)) return;
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
    setEditingCell(null);
    const raw = localValues[key];
    const parsed = raw === undefined || raw === '' ? 0 : Math.max(0, Math.round(Number(raw)));
    
    const existingSession = sessions.find(s => s.group_lesson_id === lessonId && s.session_date === dateStr);
    const existingCount = existingSession ? existingSession.sessions_count : 0;

    if (parsed === existingCount) return;

    if (!parsed) {
      await deleteSession.mutateAsync({ groupLessonId: lessonId, date: dateStr });
      await clearStaffAccruals(lessonId, dateStr);
      toast({ title: "Запис видалено" });
      return;
    }

    await upsertSession.mutateAsync({
      group_lesson_id: lessonId,
      session_date: dateStr,
      sessions_count: parsed,
      notes: null,
    });

    await syncStaffAccruals(lessonId, dateStr, parsed);
    toast({ title: "Дані оновлено", description: `Кількість занять: ${parsed}` });
  };
  
  const handleCellClick = (key: string) => {
    if (editingCell === key) return;
    setEditingCell(key);
  };

  const handleCellDoubleClick = (key: string) => {
    setEditingCell(key);
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
          <div className="w-[140px]">
            <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">День</SelectItem>
                <SelectItem value="week">Тиждень</SelectItem>
                <SelectItem value="month">Місяць</SelectItem>
              </SelectContent>
            </Select>
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
          <div className="border rounded-xl">
            <div className="overflow-x-auto">
              <table className={cn("border-collapse table-fixed", periodFilter === 'month' ? 'w-full' : 'w-auto')} style={{ minWidth: '100%' }}>
                <colgroup>
                  <col style={{ width: '180px', minWidth: '180px' }} />
                  {days.map((day) => (
                    <col key={formatDateString(day)} style={{ width: '40px', minWidth: '40px' }} />
                  ))}
                </colgroup>
                <thead className="bg-muted/50">
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Групове заняття
                    </th>
                    {days.map((day) => (
                      <th
                        key={formatDateString(day)}
                        className={cn(
                          'px-0.5 py-1.5 text-center text-[10px] font-medium',
                          isWeekend(day)
                            ? `text-muted-foreground/50 ${WEEKEND_BG_COLOR}`
                            : 'text-muted-foreground'
                        )}
                        title={`${getWeekdayShort(day)} ${day.getDate()}`}
                      >
                        <div className="font-semibold leading-tight">{day.getDate()}</div>
                        <div className="text-[9px] opacity-70">{getWeekdayShort(day).slice(0, 2)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupLessons.map((lesson) => (
                    <tr key={lesson.id} className="border-t">
                      <td className="sticky left-0 z-10 bg-card px-3 py-2 text-xs font-medium">
                        <div className="truncate">{lesson.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {(lesson.staff || []).map((member) => member.full_name).join(', ') || 'Без викладачів'}
                        </div>
                      </td>
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        const key = `${lesson.id}-${dateStr}`;
                        const value = localValues[key] ?? '';
                        const isEditing = editingCell === key;

                        return (
                          <td
                            key={dateStr}
                            className={cn(
                              'p-0.5 text-center',
                              isWeekend(day) && WEEKEND_BG_COLOR
                            )}
                            onClick={() => handleCellClick(key)}
                            onDoubleClick={() => handleCellDoubleClick(key)}
                          >
                            {isEditing ? (
                               <Input
                                type="number"
                                min="0"
                                step="1"
                                value={value}
                                onChange={(event) => handleValueChange(lesson.id, dateStr, event.target.value)}
                                onBlur={() => handleValueBlur(lesson.id, dateStr)}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                className="h-7 w-full text-xs text-center p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            ) : (
                                <div className={cn("flex items-center justify-center h-7 w-full text-xs rounded-md", value && Number(value) > 0 ? "bg-green-100 hover:bg-green-200 cursor-pointer" : "hover:bg-muted/50 cursor-pointer")}>
                                    {value || ''}
                                </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          Клік на клітинку — редагування кількості занять. Подвійний клік — також редагування.
        </p>
      </div>
    </>
  );
}
