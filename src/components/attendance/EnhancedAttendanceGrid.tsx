import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnhancedAttendanceCell } from "./EnhancedAttendanceCell";
import { RecordInfoContextMenu } from "@/components/shared/RecordInfoContextMenu";
import {
  useEnrollments,
  useCreateEnrollment,
  calculateAttendanceChargeForRecalc,
  useEnrollmentPriceHistoryMap,
} from "@/hooks/useEnrollments";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAttendance,
  useSetAttendance,
  useDeleteAttendance,
} from "@/hooks/useAttendance";
import { useActivity } from "@/hooks/useActivities";
import { useGroups } from "@/hooks/useGroups";
import { useStaff } from "@/hooks/useStaff";
import { useStudents } from "@/hooks/useStudents";
import {
  useUpsertStaffJournalEntry,
  useDeleteStaffJournalEntry,
  useAllStaffBillingRulesForActivity,
  useAllStaffManualRateHistoryForActivity,
  getStaffBillingRuleForDate,
  getTeacherIdForActivityAndDate,
} from "@/hooks/useStaffBilling";
import {
  calculateMonthlyStaffAccruals,
  type AttendanceRecord,
} from "@/lib/salaryCalculator";
import { applyDeductionsToAmount } from "@/lib/staffSalary";
import {
  getDaysInMonth,
  formatShortDate,
  getWeekdayShort,
  isWeekend,
  WEEKEND_BG_COLOR,
  calculateChargedAmount,
  formatCurrency,
  calculateValueFromBillingRules,
  calculateHourlyValueFromRule,
  formatDateString,
  filterDaysByPeriod,
  getMonthStartDate,
  getMonthEndDate,
  type PeriodFilter,
} from "@/lib/attendance";
import type { AttendanceStatus } from "@/lib/attendance";
import {
  useActivityPriceHistory,
  getBillingRulesForDate,
} from "@/hooks/useActivities";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const MONTHS = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];

interface AttendanceGridProps {
  activityId: string;
  initialDate?: Date;
}

export function EnhancedAttendanceGrid({
  activityId,
  initialDate,
}: AttendanceGridProps) {
  const { role } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("month");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(
    new Set(["all"]),
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState(now.getDate() - 1);
  const isMobile = useIsMobile();
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const totalsScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  const { data: activity } = useActivity(activityId);
  const { data: priceHistory } = useActivityPriceHistory(activityId);

  // Debug logging для проверки загрузки activity
  useEffect(() => {
    if (activity) {
      console.log("[EnhancedAttendanceGrid] Activity loaded:", {
        id: activity.id,
        name: activity.name,
        billing_rules: activity.billing_rules,
        custom_statuses: activity.billing_rules?.custom_statuses,
        custom_statuses_length:
          activity.billing_rules?.custom_statuses?.length || 0,
      });
    } else {
      console.log("[EnhancedAttendanceGrid] Activity is null/undefined");
    }
  }, [activity]);
  const { data: allStaffBillingRules = [] } =
    useAllStaffBillingRulesForActivity(activityId);
  const { data: allManualRateHistory = [] } =
    useAllStaffManualRateHistoryForActivity(activityId);
  const { data: groups = [] } = useGroups();
  const { data: students = [] } = useStudents();
  const { data: staff = [] } = useStaff();
  const { data: enrollments = [], isLoading: enrollmentsLoading } =
    useEnrollments({
      activityId,
    });
  const { data: attendanceData = [], isLoading: attendanceLoading } =
    useAttendance({
      activityId,
      month,
      year,
    });
  const queryClient = useQueryClient();
  const enrollmentMarkQueuesRef = useRef(new Map<string, Promise<void>>());
  const attendanceFilters = useMemo(
    () => ({ activityId, month, year }),
    [activityId, month, year],
  );
  const setAttendance = useSetAttendance();
  const deleteAttendance = useDeleteAttendance();
  const upsertStaffJournalEntry = useUpsertStaffJournalEntry();
  const deleteStaffJournalEntry = useDeleteStaffJournalEntry();
  const createEnrollment = useCreateEnrollment();

  const allDays = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const days = useMemo(
    () => filterDaysByPeriod(allDays, periodFilter, now),
    [allDays, periodFilter, now],
  );
  const selectedDay = allDays[selectedDayIndex] || allDays[0];
  const selectedDateStr = selectedDay ? formatDateString(selectedDay) : "";

  useEffect(() => {
    if (!initialDate) return;
    const nextYear = initialDate.getFullYear();
    const nextMonth = initialDate.getMonth();
    const dayIndex = Math.max(0, initialDate.getDate() - 1);
    const daysInTargetMonth = getDaysInMonth(nextYear, nextMonth);
    setYear(nextYear);
    setMonth(nextMonth);
    setSelectedDayIndex(
      Math.min(dayIndex, Math.max(0, daysInTargetMonth.length - 1)),
    );
  }, [initialDate]);

  useEffect(() => {
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth()) {
      setSelectedDayIndex(
        Math.max(0, Math.min(today.getDate() - 1, days.length - 1)),
      );
    } else {
      setSelectedDayIndex(0);
    }
  }, [year, month, days.length]);

  const enrollmentsWithCharges = useMemo(() => {
    const set = new Set<string>();
    if (!attendanceData || !Array.isArray(attendanceData)) return set;
    attendanceData.forEach((entry: any) => {
      const amount = entry.charged_amount ?? 0;
      if (amount > 0) {
        set.add(entry.enrollment_id);
      }
    });
    return set;
  }, [attendanceData]);

  const activeEnrollmentStudentIds = useMemo(() => {
    const ids = new Set<string>();
    enrollments.forEach((enrollment) => {
      if (enrollment.is_active) {
        ids.add(enrollment.student_id);
      }
    });
    return ids;
  }, [enrollments]);

  const eligibleStudents = useMemo(() => {
    return students.filter((student) => {
      if (student.status !== "active") return false;
      return !activeEnrollmentStudentIds.has(student.id);
    });
  }, [students, activeEnrollmentStudentIds]);

  const handleAddStudent = async () => {
    if (!selectedStudentId || selectedStudentId === "none") return;
    await createEnrollment.mutateAsync({
      student_id: selectedStudentId,
      activity_id: activityId,
      custom_price: customPrice.trim() ? parseFloat(customPrice) : null,
      discount_percent: discountPercent.trim()
        ? parseFloat(discountPercent)
        : 0,
    });
    setSelectedStudentId("");
    setCustomPrice("");
    setDiscountPercent("0");
    setIsAddStudentOpen(false);
  };

  const visibleEnrollments = useMemo(
    () =>
      enrollments.filter(
        (enrollment) =>
          enrollment.is_active || enrollmentsWithCharges.has(enrollment.id),
      ),
    [enrollments, enrollmentsWithCharges],
  );
  const visibleEnrollmentIds = useMemo(
    () => visibleEnrollments.map((e) => e.id),
    [visibleEnrollments],
  );
  const {
    data: enrollmentPriceHistoryMap = new Map(),
    isLoading: enrollmentPriceHistoryLoading,
  } = useEnrollmentPriceHistoryMap(visibleEnrollmentIds);

  // Фільтрація записів по групах
  const filteredEnrollments = useMemo(() => {
    if (selectedGroups.has("all")) {
      return visibleEnrollments;
    }

    return visibleEnrollments.filter((enrollment) => {
      const groupId = enrollment.students?.group_id;
      if (!groupId) {
        // Діти без групи показуються, якщо вибрано "Без групи"
        return selectedGroups.has("none");
      }
      return selectedGroups.has(groupId);
    });
  }, [selectedGroups, visibleEnrollments]);

  // Групування та сортування записів
  const groupedEnrollments = useMemo(() => {
    const groupsMap = new Map<string, typeof enrollments>();
    const noGroupEnrollments: typeof enrollments = [];

    filteredEnrollments.forEach((enrollment) => {
      const groupId = enrollment.students?.group_id;
      if (!groupId) {
        noGroupEnrollments.push(enrollment);
      } else {
        if (!groupsMap.has(groupId)) {
          groupsMap.set(groupId, []);
        }
        groupsMap.get(groupId)!.push(enrollment);
      }
    });

    // Сортуємо дітей в алфавітному порядку в кожній групі
    groupsMap.forEach((enrollments, groupId) => {
      enrollments.sort((a, b) =>
        a.students.full_name.localeCompare(b.students.full_name, "uk-UA"),
      );
    });

    // Сортуємо дітей без групи
    noGroupEnrollments.sort((a, b) =>
      a.students.full_name.localeCompare(b.students.full_name, "uk-UA"),
    );

    return { groupsMap, noGroupEnrollments };
  }, [filteredEnrollments]);

  useEffect(() => {
    const header = headerScrollRef.current;
    if (!header) return;
    const sync = () => {
      const left = header.scrollLeft;
      if (totalsScrollRef.current) totalsScrollRef.current.scrollLeft = left;
      if (bodyScrollRef.current) bodyScrollRef.current.scrollLeft = left;
    };
    header.addEventListener("scroll", sync, { passive: true });
    sync();
    return () => header.removeEventListener("scroll", sync);
  }, [days.length, filteredEnrollments.length]);

  // Єдиний colgroup для всіх таблиць
  const tableColGroup = useMemo(
    () => (
      <colgroup>
        <col style={{ width: "200px", minWidth: "200px" }} />
        {days.map((day) => (
          <col
            key={formatDateString(day)}
            style={{ width: "40px", minWidth: "40px" }}
          />
        ))}
        <col style={{ width: "120px", minWidth: "120px" }} />
      </colgroup>
    ),
    [days],
  );

  // Отримуємо список всіх груп, представлених у записах
  const representedGroups = useMemo(() => {
    const groupIds = new Set<string>();
    visibleEnrollments.forEach((enrollment) => {
      if (enrollment.students?.group_id) {
        groupIds.add(enrollment.students.group_id);
      }
    });
    return groups.filter((g) => groupIds.has(g.id));
  }, [visibleEnrollments, groups]);

  const attendanceMap = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string | undefined;
        status: AttendanceStatus | null;
        amount: number;
        value: number | null;
        notes: string | null;
        manual_value_edit: boolean;
      }
    >();
    if (!attendanceData || !Array.isArray(attendanceData)) return map;
    attendanceData.forEach((a: any) => {
      const key = `${a.enrollment_id}-${a.date}`;
      map.set(key, {
        id: a.id,
        status: a.status,
        amount: a.charged_amount || 0,
        value: a.value ?? null,
        notes: a.notes || null,
        manual_value_edit: a.manual_value_edit || false,
      });
    });
    return map;
  }, [attendanceData]);

  // Створюємо мапу staff_billing_rules для швидкого доступу (по staff_id)
  const staffBillingRulesMap = useMemo(() => {
    const map = new Map<string, typeof allStaffBillingRules>();
    allStaffBillingRules.forEach((rule) => {
      const existing = map.get(rule.staff_id) || [];
      existing.push(rule);
      map.set(rule.staff_id, existing);
    });
    return map;
  }, [allStaffBillingRules]);

  const staffMap = useMemo(() => {
    const map = new Map<string, (typeof staff)[number]>();
    staff.forEach((member) => {
      map.set(member.id, member);
    });
    return map;
  }, [staff]);

  // Helper функция: проверяет, должен ли статус учитываться для расчёта ЗП
  const isStatusForSalary = useCallback(
    (status: AttendanceStatus | null): boolean => {
      if (!status) return false;
      if (status === "present") return true;
      // Проверяем кастомные статусы с use_for_salary: true
      if (activity?.billing_rules?.custom_statuses) {
        const customStatus = activity.billing_rules.custom_statuses.find(
          (cs) =>
            cs.id === status &&
            cs.is_active !== false &&
            cs.use_for_salary === true,
        );
        return !!customStatus;
      }
      return false;
    },
    [activity],
  );

  const isMarkedAttendance = useCallback(
    (attendance?: {
      status: AttendanceStatus | null;
      value: number | null;
    }): boolean => {
      if (!attendance) return false;
      if (attendance.status) return true;
      if (attendance.value !== null && attendance.value !== undefined) {
        return attendance.value !== 0;
      }
      return false;
    },
    [],
  );

  const buildAttendanceRecordsFromMap = useCallback(
    (
      mapOverride?: Map<
        string,
        {
          status: AttendanceStatus | null;
          amount: number;
          value: number | null;
          notes: string | null;
          manual_value_edit: boolean;
        }
      >,
    ) => {
      const map = mapOverride ?? attendanceMap;
      const records: AttendanceRecord[] = [];

      filteredEnrollments.forEach((enrollment) => {
        const studentId = enrollment.students?.id || enrollment.student_id;
        const studentName = enrollment.students?.full_name || "";

        days.forEach((day) => {
          const dateStr = formatDateString(day);
          const key = `${enrollment.id}-${dateStr}`;
          const attendance = map.get(key);

          // Учитываем: 'present', кастомные статусы с use_for_salary: true, или "Число" (status=null, value>0)
          const hasValueForSalary =
            (attendance?.status && isStatusForSalary(attendance.status)) ||
            (!attendance?.status &&
              ((attendance?.value ?? 0) > 0 || (attendance?.amount ?? 0) > 0));
          if (hasValueForSalary && studentId) {
            records.push({
              date: dateStr,
              enrollment_id: enrollment.id,
              student_id: studentId,
              student_name: studentName,
              status: attendance.status,
              value: attendance.value ?? attendance.amount ?? 0,
            });
          }
        });
      });

      return records;
    },
    [attendanceMap, days, filteredEnrollments, isStatusForSalary],
  );

  const buildMonthAttendanceRecordsFromMap = useCallback(
    (
      mapOverride?: Map<
        string,
        {
          status: AttendanceStatus | null;
          amount: number;
          value: number | null;
          notes: string | null;
          manual_value_edit: boolean;
        }
      >,
    ) => {
      const map = mapOverride ?? attendanceMap;
      const records: AttendanceRecord[] = [];

      visibleEnrollments.forEach((enrollment) => {
        const studentId = enrollment.students?.id || enrollment.student_id;
        const studentName = enrollment.students?.full_name || "";

        allDays.forEach((day) => {
          const dateStr = formatDateString(day);
          const key = `${enrollment.id}-${dateStr}`;
          const attendance = map.get(key);
          const hasValueForSalary =
            (attendance?.status && isStatusForSalary(attendance.status)) ||
            (!attendance?.status &&
              ((attendance?.value ?? 0) > 0 || (attendance?.amount ?? 0) > 0));

          if (hasValueForSalary && studentId) {
            records.push({
              date: dateStr,
              enrollment_id: enrollment.id,
              student_id: studentId,
              student_name: studentName,
              status: attendance.status,
              value: attendance.value ?? attendance.amount ?? 0,
            });
          }
        });
      });

      return records;
    },
    [attendanceMap, allDays, visibleEnrollments, isStatusForSalary],
  );

  const getTeacherIdForActivity = useCallback(
    (actId: string, date: string): string | null =>
      getTeacherIdForActivityAndDate(
        allStaffBillingRules,
        allManualRateHistory,
        actId,
        date,
      ),
    [allStaffBillingRules, allManualRateHistory],
  );

  const getBillingRuleForDate = useCallback(
    (date: string) => {
      const teacherId = getTeacherIdForActivity(activityId, date);
      if (!teacherId) return null;
      const staffRules = staffBillingRulesMap.get(teacherId) || [];
      return getStaffBillingRuleForDate(staffRules, date, activityId);
    },
    [activityId, getTeacherIdForActivity, staffBillingRulesMap],
  );

  const syncStaffJournalEntriesForMonth = useCallback(
    async (
      mapOverride?: Map<
        string,
        {
          status: AttendanceStatus | null;
          amount: number;
          value: number | null;
          notes: string | null;
          manual_value_edit: boolean;
        }
      >,
    ) => {
      const records = buildMonthAttendanceRecordsFromMap(mapOverride);
      const monthStartDate = getMonthStartDate(year, month);
      const monthEndDate = getMonthEndDate(year, month);
      const fixedRules = allStaffBillingRules.filter(
        (rule) =>
          rule.rate_type === "fixed" &&
          (rule.activity_id === null || rule.activity_id === activityId) &&
          (rule.group_lesson_id == null),
      );

      const accruals = calculateMonthlyStaffAccruals({
        attendanceRecords: records,
        getRuleForDate: getBillingRuleForDate,
        monthStartDate,
        monthEndDate,
        fixedRules,
        customStatuses: activity?.billing_rules?.custom_statuses,
      });

      const dateStrings = allDays.map((day) => formatDateString(day));
      const staffIds = new Set<string>();

      allStaffBillingRules.forEach((rule) => {
        if (
          (rule.activity_id === null || rule.activity_id === activityId) &&
          rule.group_lesson_id == null
        ) {
          staffIds.add(rule.staff_id);
        }
      });

      accruals.forEach((_, staffId) => staffIds.add(staffId));

      // Fetch manual overrides: skip updating auto entries where user has manual override
      const manualOverrideKeys = new Set<string>();
      if (staffIds.size > 0) {
        const { data: manualEntries = [] } = await supabase
          .from("staff_journal_entries")
          .select("staff_id, activity_id, date")
          .eq("is_manual_override", true)
          .eq("activity_id", activityId)
          .is("group_lesson_id", null)
          .in("staff_id", Array.from(staffIds))
          .gte("date", monthStartDate)
          .lte("date", monthEndDate);
        manualEntries.forEach((e: { staff_id: string; activity_id: string; date: string }) => {
          manualOverrideKeys.add(`${e.staff_id}|${e.activity_id}|${e.date}`);
        });
      }

      const promises: Promise<any>[] = [];
      staffIds.forEach((staffId) => {
        dateStrings.forEach((date) => {
          const key = `${staffId}|${activityId}|${date}`;
          if (manualOverrideKeys.has(key)) {
            // If manual override exists for this day, auto entry must not survive.
            // This prevents stale auto accrual after attendance mark deletion.
            promises.push(
              deleteStaffJournalEntry.mutateAsync({
                staff_id: staffId,
                activity_id: activityId,
                group_lesson_id: null,
                date,
                is_manual_override: false,
              }),
            );
            return;
          }

          const dayAccrual = accruals.get(staffId)?.get(date);
          if (dayAccrual && dayAccrual.amount > 0) {
            const staffMember = staffMap.get(staffId);
            const { finalAmount, deductionsApplied } = applyDeductionsToAmount(
              dayAccrual.amount,
              (staffMember?.deductions as any) || [],
            );

            promises.push(
              upsertStaffJournalEntry.mutateAsync({
                staff_id: staffId,
                activity_id: activityId,
                group_lesson_id: null,
                date,
                amount: finalAmount,
                base_amount: dayAccrual.amount,
                deductions_applied: deductionsApplied,
                is_manual_override: false,
                notes: dayAccrual.notes.join("; ") || null,
              }),
            );
          } else {
            promises.push(
              deleteStaffJournalEntry.mutateAsync({
                staff_id: staffId,
                activity_id: activityId,
                group_lesson_id: null,
                date,
                is_manual_override: false,
              }),
            );
          }
        });
      });

      if (promises.length > 0) {
        const results = await Promise.allSettled(promises);
        const rejected = results.filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        if (rejected.length > 0) {
          const firstReason =
            rejected[0].reason instanceof Error
              ? rejected[0].reason.message
              : String(rejected[0].reason || "Unknown error");
          throw new Error(
            `Failed to sync staff journal entries (${rejected.length}/${results.length}): ${firstReason}`,
          );
        }
      }
    },
    [
      activityId,
      allDays,
      allStaffBillingRules,
      buildMonthAttendanceRecordsFromMap,
      deleteStaffJournalEntry,
      getBillingRuleForDate,
      staffMap,
      upsertStaffJournalEntry,
      year,
      month,
    ],
  );

  // Отримуємо billing rules для активності на дату
  const getActivityBillingRulesForDate = useCallback(
    (date: string) => {
      if (!activity) return null;
      return priceHistory
        ? getBillingRulesForDate(activity, priceHistory, date)
        : activity.billing_rules;
    },
    [activity, priceHistory],
  );

  // Auto-journal: автоматично проставляти "П" у робочі дні
  useEffect(() => {
    console.log("[Auto-journal] useEffect triggered", {
      activityId,
      auto_journal: activity?.auto_journal,
      enrollmentsLoading,
      attendanceLoading,
      filteredEnrollmentsCount: filteredEnrollments.length,
      attendanceMapSize: attendanceMap.size,
      daysCount: days.length,
      activity: activity
        ? {
            id: activity.id,
            name: activity.name,
            auto_journal: activity.auto_journal,
          }
        : null,
    });

    if (!activity?.auto_journal) {
      console.log(
        "[Auto-journal] SKIP: auto_journal is false or activity is undefined",
      );
      return;
    }

    if (enrollmentsLoading) {
      console.log("[Auto-journal] SKIP: enrollmentsLoading is true");
      return;
    }

    if (attendanceLoading) {
      console.log("[Auto-journal] SKIP: attendanceLoading is true");
      return;
    }

    console.log("[Auto-journal] Starting auto-fill process");

    const autoFillPromises: Promise<any>[] = [];
    const optimisticMap = new Map(attendanceMap);

    let processedCells = 0;
    let skippedWeekends = 0;
    let skippedExisting = 0;
    let skippedExistingWithStatus = 0;
    let skippedExistingWithValue = 0;
    let addedToPromises = 0;

    filteredEnrollments.forEach((enrollment) => {
      days.forEach((day) => {
        processedCells++;
        if (isWeekend(day)) {
          skippedWeekends++;
          return;
        }

        const dateStr = formatDateString(day);
        const key = `${enrollment.id}-${dateStr}`;
        const existing = attendanceMap.get(key);

        // Не перезаписуємо ручні відмітки (ні статус, ні значення)
        // Якщо є статус або значення - пропускаємо
        if (existing) {
          if (existing.status) {
            skippedExistingWithStatus++;
            return;
          }
          if (
            existing.value !== null &&
            existing.value !== undefined &&
            existing.value !== 0
          ) {
            skippedExistingWithValue++;
            console.log("[Auto-journal] SKIP cell (existing value):", {
              key,
              enrollmentId: enrollment.id,
              date: dateStr,
              existingStatus: existing.status,
              existingValue: existing.value,
            });
            return;
          }
          skippedExisting++;
        }

        if (
          !existing ||
          (!existing.status &&
            (existing.value === null ||
              existing.value === undefined ||
              existing.value === 0))
        ) {
          addedToPromises++;
          // Отримуємо billing_rules для дати (з урахуванням історії)
          const billingRulesForDate =
            activity && priceHistory
              ? getBillingRulesForDate(activity, priceHistory, dateStr)
              : activity?.billing_rules;

          // Розраховуємо value на основі billing_rules для статусу 'present'
          const calculatedValue = calculateValueFromBillingRules(
            dateStr,
            "present",
            null,
            enrollment.custom_price,
            enrollment.discount_percent || 0,
            billingRulesForDate || null,
          );

          // Використовуємо calculatedValue для charged_amount
          const chargedAmount = calculatedValue !== null ? calculatedValue : 0;

          console.log("[Auto-journal] Adding attendance mutation:", {
            key,
            enrollmentId: enrollment.id,
            date: dateStr,
            calculatedValue,
            chargedAmount,
            billingRulesForDate: billingRulesForDate ? "present" : null,
            customPrice: enrollment.custom_price,
          });

          autoFillPromises.push(
            setAttendance
              .mutateAsync({
                enrollment_id: enrollment.id,
                date: dateStr,
                status: "present",
                charged_amount: chargedAmount,
                value: calculatedValue,
                notes: null,
                manual_value_edit: false,
              })
              .then(() => {
                console.log("[Auto-journal] Successfully created attendance:", {
                  key,
                  enrollmentId: enrollment.id,
                  date: dateStr,
                });
              })
              .catch((error) => {
                console.error("[Auto-journal] Failed to create attendance:", {
                  key,
                  enrollmentId: enrollment.id,
                  date: dateStr,
                  error,
                });
              }),
          );

          optimisticMap.set(key, {
            id: undefined,
            status: "present",
            amount: chargedAmount,
            value: calculatedValue,
            manual_value_edit: false,
          });
        }
      });
    });

    // Виконуємо всі запити одночасно
    console.log("[Auto-journal] Processing summary:", {
      processedCells,
      skippedWeekends,
      skippedExisting,
      skippedExistingWithStatus,
      skippedExistingWithValue,
      addedToPromises,
      autoFillPromisesCount: autoFillPromises.length,
    });

    if (autoFillPromises.length > 0) {
      console.log(
        "[Auto-journal] Executing",
        autoFillPromises.length,
        "attendance mutations",
      );
      Promise.allSettled(autoFillPromises).then(async (results) => {
        const fulfilled = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const rejected = results.filter((r) => r.status === "rejected").length;
        console.log("[Auto-journal] Attendance mutations completed:", {
          fulfilled,
          rejected,
          total: results.length,
        });
        if (rejected > 0) {
          console.error(
            "[Auto-journal] Some attendance mutations failed:",
            results.filter((r) => r.status === "rejected"),
          );
        }
        // Refetch to avoid race: use fresh DB state for sync
        await queryClient.refetchQueries({
          queryKey: ["attendance", attendanceFilters],
        });
        const freshData =
          (queryClient.getQueryData([
            "attendance",
            attendanceFilters,
          ]) as any[]) || [];
        const freshMap = new Map<
          string,
          {
            status: AttendanceStatus | null;
            amount: number;
            value: number | null;
            notes: string | null;
            manual_value_edit: boolean;
          }
        >();
        freshData.forEach((a: any) => {
          const key = `${a.enrollment_id}-${a.date}`;
          freshMap.set(key, {
            status: a.status,
            amount: a.charged_amount || 0,
            value: a.value ?? null,
            notes: a.notes ?? null,
            manual_value_edit: a.manual_value_edit || false,
          });
        });
        syncStaffJournalEntriesForMonth(freshMap).catch((error) => {
          console.error(
            "[Auto-journal] Failed to sync staff journal entries:",
            error,
          );
        });
      });
    } else {
      console.log("[Auto-journal] No attendance mutations to execute");
    }
  }, [
    activity?.auto_journal,
    days,
    filteredEnrollments,
    attendanceMap,
    setAttendance,
    enrollmentsLoading,
    attendanceLoading,
    activity,
    getActivityBillingRulesForDate,
    activityId,
    syncStaffJournalEntriesForMonth,
    queryClient,
    attendanceFilters,
  ]);

  // Підсумки для кожного учня
  const studentTotals = useMemo(() => {
    const totals: Record<
      string,
      {
        present: number;
        sick: number;
        absent: number;
        values: number;
        marked: number;
      }
    > = {};

    filteredEnrollments.forEach((enrollment) => {
      totals[enrollment.id] = {
        present: 0,
        sick: 0,
        absent: 0,
        values: 0,
        marked: 0,
      };

      days.forEach((day) => {
        const dateStr = formatDateString(day);
        const key = `${enrollment.id}-${dateStr}`;
        const attendance = attendanceMap.get(key);

        if (isMarkedAttendance(attendance)) {
          totals[enrollment.id].marked++;
        }

        // Якщо є статус - рахуємо статус
        if (attendance?.status) {
          if (attendance.status === "present") totals[enrollment.id].present++;
          else if (attendance.status === "sick") totals[enrollment.id].sick++;
          else if (attendance.status === "absent")
            totals[enrollment.id].absent++;
        }
        // Якщо немає статусу, але є значення - рахуємо значення
        else if (
          attendance?.value !== null &&
          attendance?.value !== undefined &&
          attendance.value !== 0
        ) {
          totals[enrollment.id].values += attendance.value;
        }
      });
    });

    return totals;
  }, [filteredEnrollments, days, attendanceMap, isMarkedAttendance]);

  // Ітоги за день
  const dailyTotals = useMemo(() => {
    const totals: Record<
      string,
      {
        present: number;
        sick: number;
        absent: number;
        values: number;
        marked: number;
      }
    > = {};

    days.forEach((day) => {
      const dateStr = formatDateString(day);
      totals[dateStr] = {
        present: 0,
        sick: 0,
        absent: 0,
        values: 0,
        marked: 0,
      };

      filteredEnrollments.forEach((enrollment) => {
        const key = `${enrollment.id}-${dateStr}`;
        const attendance = attendanceMap.get(key);

        if (isMarkedAttendance(attendance)) {
          totals[dateStr].marked++;
        }

        // Якщо є статус - рахуємо статус
        if (attendance?.status) {
          if (attendance.status === "present") totals[dateStr].present++;
          else if (attendance.status === "sick") totals[dateStr].sick++;
          else if (attendance.status === "absent") totals[dateStr].absent++;
        }
        // Якщо немає статусу, але є значення - рахуємо значення
        else if (
          attendance?.value !== null &&
          attendance?.value !== undefined &&
          attendance.value !== 0
        ) {
          totals[dateStr].values += attendance.value;
        }
      });
    });

    return totals;
  }, [filteredEnrollments, days, attendanceMap, isMarkedAttendance]);

  const visibleGroupRows = useMemo(() => {
    const ids = new Set<string>();

    if (selectedGroups.has("all")) {
      Array.from(groupedEnrollments.groupsMap.keys()).forEach((id) =>
        ids.add(id),
      );
      if (groupedEnrollments.noGroupEnrollments.length > 0) ids.add("none");
    } else {
      selectedGroups.forEach((id) => {
        if (id !== "all") ids.add(id);
      });
    }

    const rows: Array<{ id: string; name: string; color?: string }> = [];
    Array.from(ids.values()).forEach((id) => {
      if (id === "none") {
        rows.push({ id, name: "Без групи", color: "#94a3b8" });
        return;
      }
      const group = groups.find((g) => g.id === id);
      if (group) {
        rows.push({ id, name: group.name, color: group.color });
      }
    });

    return rows;
  }, [groups, groupedEnrollments, selectedGroups]);

  const groupDailyTotals = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {};
    const initDates = (groupId: string) => {
      if (!totals[groupId]) totals[groupId] = {};
      days.forEach((day) => {
        totals[groupId][formatDateString(day)] = 0;
      });
    };

    visibleGroupRows.forEach((row) => initDates(row.id));

    filteredEnrollments.forEach((enrollment) => {
      const groupId = enrollment.students?.group_id || "none";
      if (!totals[groupId]) initDates(groupId);
      days.forEach((day) => {
        const dateStr = formatDateString(day);
        const key = `${enrollment.id}-${dateStr}`;
        const attendance = attendanceMap.get(key);
        // Учитываем любые отметки: статусы, числовые значения, кастомные статусы
        if (isMarkedAttendance(attendance)) {
          totals[groupId][dateStr] = (totals[groupId][dateStr] || 0) + 1;
        }
      });
    });

    return totals;
  }, [
    visibleGroupRows,
    filteredEnrollments,
    days,
    attendanceMap,
    isStatusForSalary,
  ]);

  const monthlyAccruals = useMemo(() => {
    const records = buildAttendanceRecordsFromMap();
    const monthStartDate = getMonthStartDate(year, month);
    const monthEndDate = getMonthEndDate(year, month);
    const fixedRules = allStaffBillingRules.filter(
      (rule) =>
        rule.rate_type === "fixed" &&
        (rule.activity_id === null || rule.activity_id === activityId) &&
        rule.group_lesson_id == null,
    );

    return calculateMonthlyStaffAccruals({
      attendanceRecords: records,
      getRuleForDate: getBillingRuleForDate,
      monthStartDate,
      monthEndDate,
      fixedRules,
      customStatuses: activity?.billing_rules?.custom_statuses,
    });
  }, [
    buildAttendanceRecordsFromMap,
    getBillingRuleForDate,
    year,
    month,
    allStaffBillingRules,
    activityId,
  ]);

  // Оплата педагогу за день - сума нарахувань за правилами
  const teacherPayments = useMemo(() => {
    const payments: Record<string, number> = {};

    days.forEach((day) => {
      const dateStr = formatDateString(day);
      payments[dateStr] = 0;
    });

    monthlyAccruals.forEach((staffMapForDay, staffId) => {
      const staffMember = staffMap.get(staffId);
      const deductions = (staffMember?.deductions as any) || [];

      staffMapForDay.forEach((accrual, date) => {
        const { finalAmount } = applyDeductionsToAmount(
          accrual.amount,
          deductions,
        );
        payments[date] = (payments[date] || 0) + finalAmount;
      });
    });

    return payments;
  }, [days, monthlyAccruals, staffMap]);

  // Собираем уникальных педагогов для активности за месяц
  const teachersForActivity = useMemo(() => {
    const teacherIds = new Set<string>();

    days.forEach((day) => {
      const dateStr = formatDateString(day);
      const teacherId = getTeacherIdForActivity(activityId, dateStr);
      if (teacherId) {
        teacherIds.add(teacherId);
      }
    });

    // Получаем ФИО педагогов
    const teacherNames = Array.from(teacherIds)
      .map((id) => {
        const teacher = staff.find((s) => s.id === id);
        return teacher?.full_name || null;
      })
      .filter((name): name is string => name !== null)
      .sort(); // Сортируем по алфавиту для консистентности

    return teacherNames;
  }, [days, activityId, getTeacherIdForActivity, staff]);

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

  const handleStatusChange = async (
    enrollmentId: string,
    date: string,
    status: AttendanceStatus | null,
    value: number | null,
    notes: string | null = null,
    _activityPrice: number = 0, // Deprecated: не використовується, залишено для сумісності
    customPrice: number | null = null,
    discountPercent: number = 0,
    enrollment?: any,
  ) => {
    // Получаем существующую запись для проверки изменений
    const existing = attendanceMap.get(`${enrollmentId}-${date}`);

    // Если изменяется только примечание (статус и value не изменились), сохраняем только notes
    if (
      existing &&
      existing.status === status &&
      existing.value === value &&
      existing.notes !== notes
    ) {
      try {
        await setAttendance.mutateAsync({
          enrollment_id: enrollmentId,
          date,
          status: existing.status,
          charged_amount: existing.amount,
          value: existing.value,
          notes: notes || null,
          manual_value_edit: existing.manual_value_edit,
        });

        // Обновляем локальную карту
        const updatedMap = new Map(attendanceMap);
        updatedMap.set(`${enrollmentId}-${date}`, {
          ...existing,
          notes: notes || null,
        });
        // Не нужно вызывать syncStaffJournalEntriesForMonth, так как статус и value не изменились
      } catch (error) {
        console.error("Failed to update notes:", error);
      }
      return;
    }

    // Якщо обидва null - видаляємо запис
    if (
      status === null &&
      (value === null || value === undefined || value === 0)
    ) {
      try {
        await deleteAttendance.mutateAsync({ enrollmentId, date });
        await queryClient.refetchQueries({
          queryKey: ["attendance", attendanceFilters],
        });
        const freshData =
          (queryClient.getQueryData([
            "attendance",
            attendanceFilters,
          ]) as any[]) || [];
        const freshMap = new Map<
          string,
          {
            status: AttendanceStatus | null;
            amount: number;
            value: number | null;
            notes: string | null;
            manual_value_edit: boolean;
          }
        >();
        freshData.forEach((a: any) => {
          const key = `${a.enrollment_id}-${a.date}`;
          freshMap.set(key, {
            status: a.status,
            amount: a.charged_amount || 0,
            value: a.value ?? null,
            notes: a.notes ?? null,
            manual_value_edit: a.manual_value_edit || false,
          });
        });
        await syncStaffJournalEntriesForMonth(freshMap);
      } catch (error) {
        console.error("Failed to delete attendance:", error);
        toast({
          title: "Помилка синхронізації",
          description:
            error instanceof Error
              ? error.message
              : "Не вдалося оновити фінансові дані після видалення відмітки",
          variant: "destructive",
        });
      }
      return;
    }

    // Якщо є значення, але немає статусу - зберігаємо тільки значення
    if (
      status === null &&
      value !== null &&
      value !== undefined &&
      value !== 0
    ) {
      // Отримуємо існуючу відмітку для перевірки manual_value_edit
      const existing = attendanceMap.get(`${enrollmentId}-${date}`);

      // Отримуємо billing_rules для дати (з урахуванням історії)
      const billingRulesForDate =
        activity && priceHistory
          ? getBillingRulesForDate(activity, priceHistory, date)
          : activity?.billing_rules;

      // Значение, введённое пользователем (первичка)
      const inputValue = value;

      // Ручний числовий ввід = сума в гривнях без перерахунку
      // Не застосовуємо billing_rules.value, щоб уникнути множників/коефіцієнтів
      const chargedAmount = inputValue;
      const isManualEdit = true;

      try {
        await setAttendance.mutateAsync({
          enrollment_id: enrollmentId,
          date,
          status: null,
          charged_amount: chargedAmount,
          value: inputValue,
          notes: notes || null,
          manual_value_edit: isManualEdit,
        });
        await queryClient.refetchQueries({
          queryKey: ["attendance", attendanceFilters],
        });
        const freshData =
          (queryClient.getQueryData([
            "attendance",
            attendanceFilters,
          ]) as any[]) || [];
        const freshMap = new Map<
          string,
          {
            status: AttendanceStatus | null;
            amount: number;
            value: number | null;
            notes: string | null;
            manual_value_edit: boolean;
          }
        >();
        freshData.forEach((a: any) => {
          const key = `${a.enrollment_id}-${a.date}`;
          freshMap.set(key, {
            status: a.status,
            amount: a.charged_amount || 0,
            value: a.value ?? null,
            notes: a.notes ?? null,
            manual_value_edit: a.manual_value_edit || false,
          });
        });
        await syncStaffJournalEntriesForMonth(freshMap);
      } catch (error) {
        toast({
          title: "Помилка синхронізації",
          description:
            error instanceof Error
              ? error.message
              : "Не вдалося оновити фінансові дані після зміни відмітки",
          variant: "destructive",
        });
      }
      return;
    }

    // Якщо є статус - використовуємо передане value (якщо є) або розраховуємо його
    if (status !== null) {
      // Якщо value вже передано з компонента - використовуємо його
      // Інакше розраховуємо value на основі billing_rules
      let finalValue = value;
      // Для subscription_with_logic: колбек завершення черги відмітки
      let subscriptionMarkComplete: (() => void) | undefined;

      if (finalValue === null || finalValue === undefined) {
        // Отримуємо billing_rules для дати (з урахуванням історії)
        const billingRulesForDate =
          activity && priceHistory
            ? getBillingRulesForDate(activity, priceHistory, date)
            : activity?.billing_rules;

        // Перевіряємо чи це subscription_with_logic
        let visitCountBefore = 0;
        const customStatus = billingRulesForDate?.custom_statuses?.find(
          (cs: any) =>
            cs.id === status &&
            cs.is_active !== false &&
            cs.type === "subscription_with_logic",
        );

        if (customStatus) {
          // Послідовна черга на enrollment: попереджає race condition при паралельних відмітках.
          // Кожна наступна відмітка чекає завершення попередньої (mutateAsync + onSuccess refetch),
          // тому читає свіжий кеш і отримує правильний visitCountBefore.
          const prevQueue =
            enrollmentMarkQueuesRef.current.get(enrollmentId) ??
            Promise.resolve();
          const thisMarkDone = new Promise<void>(
            (resolve) => { subscriptionMarkComplete = resolve; },
          );
          enrollmentMarkQueuesRef.current.set(
            enrollmentId,
            prevQueue.catch(() => {}).then(() => thisMarkDone),
          );
          await prevQueue.catch(() => {});

          // Читаємо свіжий кеш: onSuccess попередньої відмітки вже викликав refetchQueries
          const freshCacheData =
            (queryClient.getQueryData([
              "attendance",
              attendanceFilters,
            ]) as any[]) ?? attendanceData;

          const [dy, dm, dd] = date.split("-").map(Number);
          const dateObj = new Date(dy, dm - 1, dd);
          const monthStart = new Date(dy, dm - 1, 1);

          freshCacheData.forEach((att: any) => {
            if (att.enrollment_id !== enrollmentId) return;
            if (att.status !== status) return;
            const [ay, am, ad] = att.date.split("-").map(Number);
            const attDate = new Date(ay, am - 1, ad);
            if (attDate >= monthStart && attDate < dateObj) visitCountBefore++;
          });
        }

        // Розраховуємо value на основі billing_rules для статусу
        finalValue = calculateValueFromBillingRules(
          date,
          status,
          null, // Для статусу valueInput не потрібен
          customPrice,
          discountPercent,
          billingRulesForDate || null,
          visitCountBefore,
        );
      }

      // Використовуємо finalValue для charged_amount (завжди з billing_rules)
      // Якщо finalValue є null - використовуємо 0 (не має бути fallback на стару логіку)
      const chargedAmount = finalValue !== null ? finalValue : 0;

      // Перевіряємо чи була це ручна зміна (якщо раніше було manual_value_edit)
      // І перевіряємо попередній статус ДО збереження
      const existing = attendanceMap.get(`${enrollmentId}-${date}`);
      const isManualEdit = existing?.manual_value_edit || false;
      const wasPresentForSalary = existing?.status
        ? isStatusForSalary(existing.status)
        : false;

      console.log(
        "[Dashboard Debug] EnhancedAttendanceGrid.handleStatusChange calling mutateAsync",
        {
          enrollmentId,
          date,
          status,
          chargedAmount,
          finalValue,
          isManualEdit,
          timestamp: new Date().toISOString(),
        },
      );

      try {
        const result = await setAttendance.mutateAsync({
          enrollment_id: enrollmentId,
          date,
          status,
          charged_amount: chargedAmount,
          value: finalValue, // Використовуємо передане або розраховане value
          notes: notes || null,
          manual_value_edit: isManualEdit,
        });

        console.log(
          "[Dashboard Debug] EnhancedAttendanceGrid.handleStatusChange mutateAsync success",
          {
            result,
            timestamp: new Date().toISOString(),
          },
        );

        // Refetch attendance before sync to avoid race: at rapid clicks,
        // attendanceMap can be stale; sync must use fresh DB state
        await queryClient.refetchQueries({
          queryKey: ["attendance", attendanceFilters],
        });
        const freshData =
          (queryClient.getQueryData([
            "attendance",
            attendanceFilters,
          ]) as any[]) || [];
        const freshMap = new Map<
          string,
          {
            status: AttendanceStatus | null;
            amount: number;
            value: number | null;
            notes: string | null;
            manual_value_edit: boolean;
          }
        >();
        freshData.forEach((a: any) => {
          const key = `${a.enrollment_id}-${a.date}`;
          freshMap.set(key, {
            status: a.status,
            amount: a.charged_amount || 0,
            value: a.value ?? null,
            notes: a.notes ?? null,
            manual_value_edit: a.manual_value_edit || false,
          });
        });
        await syncStaffJournalEntriesForMonth(freshMap);
      } catch (error) {
        toast({
          title: "Помилка синхронізації",
          description:
            error instanceof Error
              ? error.message
              : "Не вдалося оновити фінансові дані після зміни відмітки",
          variant: "destructive",
        });
      } finally {
        subscriptionMarkComplete?.();
      }
    }
  };

  const isLoading = enrollmentsLoading || attendanceLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleGroupToggle = (groupId: string) => {
    const newSelected = new Set(selectedGroups);

    if (groupId === "all") {
      if (newSelected.has("all")) {
        newSelected.clear();
      } else {
        newSelected.clear();
        newSelected.add("all");
      }
    } else {
      newSelected.delete("all");
      if (newSelected.has(groupId)) {
        newSelected.delete(groupId);
      } else {
        newSelected.add(groupId);
      }

      // Якщо всі групи вибрані окрім 'all', автоматично додаємо 'all'
      if (
        newSelected.size ===
        representedGroups.length +
          (groupedEnrollments.noGroupEnrollments.length > 0 ? 1 : 0)
      ) {
        newSelected.clear();
        newSelected.add("all");
      }
    }

    setSelectedGroups(newSelected);
  };

  // Функція для пересчёту всіх відміток за місяць
  const handleRecalculateMonth = async () => {
    if (!activity || isRecalculating) return;
    if (enrollmentPriceHistoryLoading) {
      toast({
        title: "Дані ще завантажуються",
        description: "Дочекайтесь завантаження історії цін і спробуйте ще раз.",
        variant: "destructive",
      });
      return;
    }

    setIsRecalculating(true);

    try {
      // Групуємо attendance по enrollment_id
      const attendanceByEnrollment = new Map<
        string,
        Array<{ date: string; status: AttendanceStatus | null; key: string }>
      >();

      attendanceMap.forEach((att, key) => {
        const parts = key.split("-");
        const enrollmentId = parts[0];
        const date = parts.slice(1).join("-");

        if (!attendanceByEnrollment.has(enrollmentId)) {
          attendanceByEnrollment.set(enrollmentId, []);
        }
        attendanceByEnrollment.get(enrollmentId)!.push({
          date,
          status: att.status,
          key,
        });
      });

      const updatePromises: Promise<any>[] = [];

      // Для кожного enrollment
      for (const [enrollmentId, records] of attendanceByEnrollment) {
        // Знаходимо enrollment для отримання custom_price та discount
        const enrollment = visibleEnrollments.find(
          (e) => e.id === enrollmentId,
        );
        if (!enrollment) continue;

        // Сортуємо записи по даті
        const sortedRecords = records.sort((a, b) =>
          a.date.localeCompare(b.date),
        );

        // Підраховуємо відвідування для subscription_with_logic по кожному статусу
        const visitCountByStatus = new Map<string, number>();

        for (const record of sortedRecords) {
          const existing = attendanceMap.get(record.key);

          // Пропускаємо записи з ручними правками — їх не перезаписуємо
          if (existing?.manual_value_edit) continue;

          let newValue: number | null = null;
          let chargedAmount = 0;

          if (record.status === null) {
            // Числові відмітки: беремо значення як є і синхронізуємо charged_amount
            newValue = existing?.value ?? null;
            chargedAmount = newValue !== null ? newValue : 0;
          } else {
            // Перевіряємо чи це subscription_with_logic (для visitCountBefore)
            const billingRulesForDate = priceHistory
              ? getBillingRulesForDate(activity, priceHistory, record.date)
              : activity.billing_rules;
            const customStatus = billingRulesForDate?.custom_statuses?.find(
              (cs: any) =>
                cs.id === record.status &&
                cs.is_active !== false &&
                cs.type === "subscription_with_logic",
            );
            let visitCountBefore = 0;
            if (customStatus) {
              visitCountBefore = visitCountByStatus.get(record.status) || 0;
              visitCountByStatus.set(record.status, visitCountBefore + 1);
            }

            const enrollmentPriceHistory =
              enrollmentPriceHistoryMap.get(enrollmentId) || [];
            const result = calculateAttendanceChargeForRecalc({
              date: record.date,
              status: record.status,
              enrollment: {
                custom_price: enrollment.custom_price,
                discount_percent: enrollment.discount_percent,
              },
              activity,
              activityPriceHistory: priceHistory,
              enrollmentPriceHistory,
              visitCountBefore,
            });
            newValue = result.value;
            chargedAmount = result.chargedAmount;
          }

          // Оновлюємо тільки якщо значення змінилось
          if (
            existing &&
            (existing.value !== newValue || existing.amount !== chargedAmount)
          ) {
            updatePromises.push(
              setAttendance.mutateAsync({
                enrollment_id: enrollmentId,
                date: record.date,
                status: record.status,
                charged_amount: chargedAmount,
                value: newValue,
                notes: existing.notes || null,
                manual_value_edit: false,
              }),
            );
          }
        }
      }

      if (updatePromises.length > 0) {
        await Promise.allSettled(updatePromises);
        await queryClient.refetchQueries({
          queryKey: ["attendance", attendanceFilters],
        });
        const freshData =
          (queryClient.getQueryData([
            "attendance",
            attendanceFilters,
          ]) as any[]) || [];
        const freshMap = new Map<
          string,
          {
            status: AttendanceStatus | null;
            amount: number;
            value: number | null;
            notes: string | null;
            manual_value_edit: boolean;
          }
        >();
        freshData.forEach((a: any) => {
          const key = `${a.enrollment_id}-${a.date}`;
          freshMap.set(key, {
            status: a.status,
            amount: a.charged_amount || 0,
            value: a.value ?? null,
            notes: a.notes ?? null,
            manual_value_edit: a.manual_value_edit || false,
          });
        });
        await syncStaffJournalEntriesForMonth(freshMap);
        toast({
          title: "Перерахунок завершено",
          description: `Оновлено ${updatePromises.length} записів`,
        });
      } else {
        toast({
          title: "Перерахунок не потрібен",
          description: "Всі записи вже актуальні",
        });
      }
    } catch (error) {
      console.error("Error recalculating:", error);
      toast({
        title: "Помилка перерахунку",
        description:
          error instanceof Error ? error.message : "Спробуйте ще раз",
        variant: "destructive",
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleRefreshData = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["attendance"] }),
        queryClient.invalidateQueries({ queryKey: ["finance_transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"], exact: false }),
        queryClient.invalidateQueries({ queryKey: ["student_activity_balance"] }),
        queryClient.invalidateQueries({ queryKey: ["student_account_balances"] }),
        queryClient.invalidateQueries({
          queryKey: ["staff-journal-entries"],
          exact: false,
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff-journal-entries-all"],
          exact: false,
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff-journal-entries-filtered"],
          exact: false,
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff-journal-entries-all-cumulative"],
          exact: false,
        }),
      ]);
      await queryClient.refetchQueries({
        queryKey: ["attendance", attendanceFilters],
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>Немає записів на цю активність</p>
        <p className="text-sm">Додайте дітей у картці учня</p>
      </div>
    );
  }

  if (filteredEnrollments.length === 0) {
    return (
      <div className="animate-fade-in">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold flex-1 text-center">
            {MONTHS[month]} {year}
          </h2>
          <div className="flex items-center gap-2">
            <div className="w-[140px]">
              <Select
                value={periodFilter}
                onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}
              >
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshData}
              disabled={isRefreshing}
              title="Оновити дані без змін у базі"
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
              />
              {isRefreshing ? "Оновлення..." : "Оновити"}
            </Button>
          </div>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-4 p-4 border rounded-lg bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <Label className="block font-medium">Фільтр по групах:</Label>
            <Button size="sm" onClick={() => setIsAddStudentOpen(true)}>
              Додати дитину
            </Button>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center space-x-2 cursor-pointer font-normal">
              <Checkbox
                checked={selectedGroups.has("all")}
                onCheckedChange={() => handleGroupToggle("all")}
                aria-label="Всі групи"
              />
              <span>Всі групи</span>
            </label>
            {representedGroups.map((group) => (
              <label
                key={group.id}
                className="flex items-center space-x-2 cursor-pointer font-normal gap-2"
              >
                <Checkbox
                  checked={selectedGroups.has(group.id)}
                  onCheckedChange={() => handleGroupToggle(group.id)}
                  aria-label={group.name}
                />
                <div
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: group.color }}
                />
                <span>{group.name}</span>
              </label>
            ))}
            {groupedEnrollments.noGroupEnrollments.length > 0 && (
              <label className="flex items-center space-x-2 cursor-pointer font-normal">
                <Checkbox
                  checked={selectedGroups.has("none")}
                  onCheckedChange={() => handleGroupToggle("none")}
                  aria-label="Без групи"
                />
                <span>Без групи</span>
              </label>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <p>Немає дітей за обраними фільтрами</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <Button variant="outline" size="icon" onClick={handlePrevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold flex-1 text-center">
          {MONTHS[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
          <div className="w-[140px]">
            <Select
              value={periodFilter}
              onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}
            >
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshData}
            disabled={isRefreshing}
            title="Оновити дані без змін у базі"
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {isRefreshing ? "Оновлення..." : "Оновити"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculateMonth}
            disabled={isRecalculating}
            title="Перерахувати всі відмітки за місяць"
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${isRecalculating ? "animate-spin" : ""}`}
            />
            {isRecalculating ? "Перерахунок..." : "Перерахувати"}
          </Button>
        </div>
        <Button variant="outline" size="icon" onClick={handleNextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 p-4 border rounded-lg bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <Label className="block font-medium">Фільтр по групах:</Label>
          <Button size="sm" onClick={() => setIsAddStudentOpen(true)}>
            Додати дитину
          </Button>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center space-x-2 cursor-pointer font-normal">
            <Checkbox
              checked={selectedGroups.has("all")}
              onCheckedChange={() => handleGroupToggle("all")}
              aria-label="Всі групи"
            />
            <span>Всі групи</span>
          </label>
          {representedGroups.map((group) => (
            <label
              key={group.id}
              className="flex items-center space-x-2 cursor-pointer font-normal gap-2"
            >
              <Checkbox
                checked={selectedGroups.has(group.id)}
                onCheckedChange={() => handleGroupToggle(group.id)}
                aria-label={group.name}
              />
              <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: group.color }}
              />
              <span>{group.name}</span>
            </label>
          ))}
          {groupedEnrollments.noGroupEnrollments.length > 0 && (
            <label className="flex items-center space-x-2 cursor-pointer font-normal">
              <Checkbox
                checked={selectedGroups.has("none")}
                onCheckedChange={() => handleGroupToggle("none")}
                aria-label="Без групи"
              />
              <span>Без групи</span>
            </label>
          )}
        </div>
      </div>

      {/* Grid */}
      {isMobile && (
        <div className="mb-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setSelectedDayIndex((prev) => Math.max(0, prev - 1))
              }
              disabled={selectedDayIndex <= 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="text-sm font-semibold">
                {selectedDay ? formatDateString(selectedDay) : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedDay ? getWeekdayShort(selectedDay) : ""}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setSelectedDayIndex((prev) =>
                  Math.min(days.length - 1, prev + 1),
                )
              }
              disabled={selectedDayIndex >= days.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>П: {dailyTotals[selectedDateStr]?.present || 0}</div>
            <div>Х: {dailyTotals[selectedDateStr]?.sick || 0}</div>
            <div>Н: {dailyTotals[selectedDateStr]?.absent || 0}</div>
            <div>Σ: {dailyTotals[selectedDateStr]?.values || 0}</div>
          </div>
          {role !== "manager" && (
            <div className="mt-2 text-sm font-medium">
              {teachersForActivity.length > 0 ? (
                <>
                  Оплата педагогу{" "}
                  <span className="text-xs font-normal">
                    ({teachersForActivity.join(", ")})
                  </span>
                  :{" "}
                  {teacherPayments[selectedDateStr]
                    ? formatCurrency(teacherPayments[selectedDateStr])
                    : "—"}
                </>
              ) : (
                `Оплата педагогу: ${teacherPayments[selectedDateStr] ? formatCurrency(teacherPayments[selectedDateStr]) : "—"}`
              )}
            </div>
          )}
        </div>
      )}

      {isMobile ? (
        <div className="space-y-4">
          {Array.from(groupedEnrollments.groupsMap.entries()).map(
            ([groupId, groupEnrollments]) => {
              const group = groups.find((g) => g.id === groupId);
              return (
                <div key={groupId} className="rounded-xl border bg-card">
                  <div className="border-b px-4 py-2 text-sm font-semibold">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: group?.color || "#gray" }}
                      />
                      Група: {group?.name || "Невідома група"}
                    </div>
                  </div>
                  <div className="divide-y">
                    {groupEnrollments.map((enrollment) => {
                      const studentId =
                        enrollment.students?.id || enrollment.student_id;
                      const key = `${enrollment.id}-${selectedDateStr}`;
                      const attendance = attendanceMap.get(key);
                      const totals = studentTotals[enrollment.id] || {
                        present: 0,
                        sick: 0,
                        absent: 0,
                        values: 0,
                      };
                      return (
                        <div
                          key={enrollment.id}
                          className={cn(
                            "p-4",
                            !enrollment.is_active &&
                              "bg-muted/40 text-muted-foreground",
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              {studentId ? (
                                <Link
                                  to={`/students/${studentId}`}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {enrollment.students.full_name}
                                </Link>
                              ) : (
                                <p className="font-medium">
                                  {enrollment.students.full_name}
                                </p>
                              )}
                              {!enrollment.is_active && (
                                <span className="mt-1 inline-flex rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide">
                                  Архів
                                </span>
                              )}
                              <p className="text-xs text-muted-foreground">
                                П: {totals.present} · Х: {totals.sick} · Н:{" "}
                                {totals.absent} · Σ: {totals.values}
                              </p>
                            </div>
                            <RecordInfoContextMenu tableName="attendance" recordId={attendance?.id} mode="last_changed" asChild={false}>
                            <EnhancedAttendanceCell
                              status={attendance?.status || null}
                              amount={attendance?.amount || 0}
                              value={attendance?.value || null}
                              notes={attendance?.notes || null}
                              manualValueEdit={
                                attendance?.manual_value_edit || false
                              }
                              isWeekend={
                                selectedDay ? isWeekend(selectedDay) : false
                              }
                              onChange={(status, value, notes) =>
                                handleStatusChange(
                                  enrollment.id,
                                  selectedDateStr,
                                  status,
                                  value,
                                  notes || null,
                                  0,
                                  enrollment.custom_price,
                                  enrollment.discount_percent,
                                  enrollment,
                                )
                              }
                              activityPrice={0}
                              customPrice={enrollment.custom_price}
                              discountPercent={enrollment.discount_percent}
                              date={selectedDateStr}
                              activity={activity}
                              priceHistory={priceHistory}
                            />
                            </RecordInfoContextMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            },
          )}

          {groupedEnrollments.noGroupEnrollments.length > 0 && (
            <div className="rounded-xl border bg-card">
              <div className="border-b px-4 py-2 text-sm font-semibold">
                Без групи
              </div>
              <div className="divide-y">
                {groupedEnrollments.noGroupEnrollments.map((enrollment) => {
                  const studentId =
                    enrollment.students?.id || enrollment.student_id;
                  const key = `${enrollment.id}-${selectedDateStr}`;
                  const attendance = attendanceMap.get(key);
                  const totals = studentTotals[enrollment.id] || {
                    present: 0,
                    sick: 0,
                    absent: 0,
                    values: 0,
                  };
                  return (
                    <div
                      key={enrollment.id}
                      className={cn(
                        "p-4",
                        !enrollment.is_active &&
                          "bg-muted/40 text-muted-foreground",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          {studentId ? (
                            <Link
                              to={`/students/${studentId}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {enrollment.students.full_name}
                            </Link>
                          ) : (
                            <p className="font-medium">
                              {enrollment.students.full_name}
                            </p>
                          )}
                          {!enrollment.is_active && (
                            <span className="mt-1 inline-flex rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide">
                              Архів
                            </span>
                          )}
                          <p className="text-xs text-muted-foreground">
                            П: {totals.present} · Х: {totals.sick} · Н:{" "}
                            {totals.absent} · Σ: {totals.values}
                          </p>
                        </div>
                        <RecordInfoContextMenu tableName="attendance" recordId={attendance?.id} mode="last_changed" asChild={false}>
                        <EnhancedAttendanceCell
                          status={attendance?.status || null}
                          amount={attendance?.amount || 0}
                          value={attendance?.value || null}
                          notes={attendance?.notes || null}
                          manualValueEdit={
                            attendance?.manual_value_edit || false
                          }
                          isWeekend={
                            selectedDay ? isWeekend(selectedDay) : false
                          }
                          onChange={(status, value, notes) =>
                            handleStatusChange(
                              enrollment.id,
                              selectedDateStr,
                              status,
                              value,
                              notes || null,
                              0,
                              enrollment.custom_price,
                              enrollment.discount_percent,
                              enrollment,
                            )
                          }
                          activityPrice={0}
                          customPrice={enrollment.custom_price}
                          discountPercent={enrollment.discount_percent}
                          date={selectedDateStr}
                          activity={activity}
                          priceHistory={priceHistory}
                        />
                        </RecordInfoContextMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-0">
          {/* Заголовок з днями тижня */}
          <div className="sticky top-16 z-30 bg-card">
            <div
              ref={headerScrollRef}
              className={periodFilter === "month" ? "overflow-x-auto" : "overflow-x-hidden"}
            >
              <table
                className={cn(
                  "border-collapse",
                  periodFilter !== "month" && "table-fixed"
                )}
                style={
                  periodFilter !== "month"
                    ? { width: 200 + days.length * 40 + 120 }
                    : { width: "100%" }
                }
              >
                {tableColGroup}
                <thead>
                  {/* Основний заголовок таблиці */}
                  <tr className="bg-muted/50">
                    <th className="sticky left-0 z-20 bg-muted/50 px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      Учень
                    </th>
                    {days.map((day) => (
                      <th
                        key={formatDateString(day)}
                        className={cn(
                          "px-1 py-2 text-center text-xs font-medium",
                          isWeekend(day)
                            ? `text-muted-foreground/50 ${WEEKEND_BG_COLOR}`
                            : "text-muted-foreground",
                        )}
                      >
                        <div>{getWeekdayShort(day)}</div>
                        <div className="font-semibold">
                          {formatShortDate(day)}
                        </div>
                      </th>
                    ))}
                    <th className="sticky right-0 z-20 bg-muted/50 px-4 py-2 text-center text-xs font-medium">
                      Підсумки
                    </th>
                  </tr>
                </thead>
              </table>
            </div>
          </div>

          {/* Таблиця з підсумками */}
          <div
            ref={totalsScrollRef}
            className={periodFilter === "month" ? "overflow-x-auto" : "overflow-x-hidden"}
          >
            <table
              className={cn(
                "w-full border-collapse",
                periodFilter !== "month" && "table-fixed"
              )}
              style={
                periodFilter !== "month"
                  ? { width: 200 + days.length * 40 + 120 }
                  : undefined
              }
            >
              {tableColGroup}
              <thead>
                {/* Рядки підсумків під датами */}
                <tr className="bg-muted/30 border-t-2 font-semibold">
                  <th className="sticky left-0 z-20 bg-muted/30 px-4 py-2 text-sm text-left">
                    Всього дітей
                  </th>
                  {days.map((day) => {
                    const dateStr = formatDateString(day);
                    const totals = dailyTotals[dateStr] || {
                      present: 0,
                      sick: 0,
                      absent: 0,
                      values: 0,
                      marked: 0,
                    };
                    return (
                      <th
                        key={dateStr}
                        className={cn(
                          "px-1 py-1 text-center text-xs font-medium",
                          isWeekend(day) && WEEKEND_BG_COLOR,
                        )}
                      >
                        {totals.marked}
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-20 bg-muted/30 px-2 py-1 text-center text-xs font-medium">
                    {Object.values(studentTotals).reduce(
                      (sum, t) => sum + t.marked,
                      0,
                    )}
                  </th>
                </tr>
                {visibleGroupRows.map((groupRow) => (
                  <tr key={groupRow.id} className="bg-muted/30 font-semibold">
                    <th className="sticky left-0 z-20 bg-muted/30 px-4 py-2 text-sm text-left">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: groupRow.color || "#94a3b8",
                          }}
                        />
                        {groupRow.name}
                      </span>
                    </th>
                    {days.map((day) => {
                      const dateStr = formatDateString(day);
                      const value =
                        groupDailyTotals[groupRow.id]?.[dateStr] || 0;
                      return (
                        <th
                          key={dateStr}
                          className={cn(
                            "px-1 py-1 text-center text-xs font-medium",
                            isWeekend(day) && WEEKEND_BG_COLOR,
                          )}
                        >
                          {value}
                        </th>
                      );
                    })}
                    <th className="sticky right-0 z-20 bg-muted/30 px-2 py-1 text-center text-xs font-medium">
                      {Object.values(
                        groupDailyTotals[groupRow.id] || {},
                      ).reduce((sum, v) => sum + v, 0)}
                    </th>
                  </tr>
                ))}

                {/* Рядок оплати педагогу */}
                {role !== "manager" && (
                  <tr className="bg-primary/10 border-t-2 border-b-2 font-semibold">
                    <th className="sticky left-0 z-20 bg-primary/10 px-4 py-2 text-sm text-left">
                      {teachersForActivity.length > 0 ? (
                        <>
                          Оплата педагогу:{" "}
                          <span className="text-xs font-normal">
                            {teachersForActivity.join(", ")}
                          </span>
                        </>
                      ) : (
                        "Оплата педагогу"
                      )}
                    </th>
                    {days.map((day) => {
                      const dateStr = formatDateString(day);
                      const payment = teacherPayments[dateStr] || 0;
                      return (
                        <th
                          key={dateStr}
                          className={cn(
                            "px-1 py-1 text-center text-xs font-medium",
                            isWeekend(day) && WEEKEND_BG_COLOR,
                          )}
                        >
                          {payment > 0 ? formatCurrency(payment) : ""}
                        </th>
                      );
                    })}
                    <th className="sticky right-0 z-20 bg-primary/10 px-2 py-1 text-center text-xs font-medium">
                      {formatCurrency(
                        Object.values(teacherPayments).reduce(
                          (sum, p) => sum + p,
                          0,
                        ),
                      )}
                    </th>
                  </tr>
                )}
              </thead>
            </table>
          </div>

          {/* Тіло таблиці з даними учнів */}
          <div
            ref={bodyScrollRef}
            className={periodFilter === "month" ? "overflow-x-auto" : "overflow-x-hidden"}
          >
            <table
              className={cn(
                "border-collapse",
                periodFilter !== "month" && "table-fixed"
              )}
              style={
                periodFilter !== "month"
                  ? { width: 200 + days.length * 40 + 120 }
                  : { width: "100%" }
              }
            >
              {tableColGroup}
              <tbody>
                {/* Рядки учнів з групуванням */}
                {Array.from(groupedEnrollments.groupsMap.entries()).map(
                  ([groupId, groupEnrollments]) => {
                    const group = groups.find((g) => g.id === groupId);
                    return (
                      <React.Fragment key={groupId}>
                        {/* Заголовок групи */}
                        <tr className="bg-muted/50 border-t-2 border-b">
                          <td
                            colSpan={days.length + 2}
                            className="px-4 py-2 font-semibold text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="h-4 w-4 rounded-full"
                                style={{
                                  backgroundColor: group?.color || "#gray",
                                }}
                              />
                              Група: {group?.name || "Невідома група"}
                            </div>
                          </td>
                        </tr>
                        {/* Діти в групі */}
                        {groupEnrollments.map((enrollment) => {
                          const totals = studentTotals[enrollment.id] || {
                            present: 0,
                            sick: 0,
                            absent: 0,
                            values: 0,
                          };

                          const studentId =
                            enrollment.students?.id || enrollment.student_id;
                          return (
                            <tr
                              key={enrollment.id}
                              className={cn(
                                "border-t hover:bg-muted/20",
                                !enrollment.is_active &&
                                  "bg-muted/40 text-muted-foreground",
                              )}
                            >
                              <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium text-sm">
                                <div className="flex items-center gap-2">
                                  {studentId ? (
                                    <Link
                                      to={`/students/${studentId}`}
                                      className="text-primary hover:underline"
                                    >
                                      {enrollment.students.full_name}
                                    </Link>
                                  ) : (
                                    <span>{enrollment.students.full_name}</span>
                                  )}
                                  {!enrollment.is_active && (
                                    <span className="rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide">
                                      Архів
                                    </span>
                                  )}
                                </div>
                                {role !== "manager" &&
                                  (enrollment.custom_price ||
                                    enrollment.discount_percent > 0) && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {enrollment.custom_price &&
                                      `${enrollment.custom_price} ₴`}
                                    {enrollment.discount_percent > 0 &&
                                      ` -${enrollment.discount_percent}%`}
                                  </span>
                                )}
                              </td>
                              {days.map((day) => {
                                const dateStr = formatDateString(day);
                                const key = `${enrollment.id}-${dateStr}`;
                                const attendance = attendanceMap.get(key);

                                return (
                                  <RecordInfoContextMenu key={dateStr} tableName="attendance" recordId={attendance?.id} mode="last_changed">
                                  <td
                                    className={cn(
                                      "p-0.5 text-center",
                                      isWeekend(day) && WEEKEND_BG_COLOR,
                                    )}
                                  >
                                    <EnhancedAttendanceCell
                                      status={attendance?.status || null}
                                      amount={attendance?.amount || 0}
                                      value={attendance?.value || null}
                                      notes={attendance?.notes || null}
                                      manualValueEdit={
                                        attendance?.manual_value_edit || false
                                      }
                                      isWeekend={isWeekend(day)}
                                      onChange={(status, value, notes) =>
                                        handleStatusChange(
                                          enrollment.id,
                                          dateStr,
                                          status,
                                          value,
                                          notes || null,
                                          0, // activityPrice не використовується - залишаємо для сумісності
                                          enrollment.custom_price,
                                          enrollment.discount_percent,
                                          enrollment,
                                        )
                                      }
                                      activityPrice={0} // Не використовується - залишаємо для сумісності типів
                                      customPrice={enrollment.custom_price}
                                      discountPercent={
                                        enrollment.discount_percent
                                      }
                                      date={dateStr}
                                      activity={activity}
                                      priceHistory={priceHistory}
                                    />
                                  </td>
                                  </RecordInfoContextMenu>
                                );
                              })}
                              <td className="sticky right-0 z-10 bg-card px-2 py-2 text-xs text-center">
                                <div>П: {totals.present}</div>
                                <div>Х: {totals.sick}</div>
                                <div>Н: {totals.absent}</div>
                                <div className="mt-1 font-semibold">
                                  Σ: {totals.values}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  },
                )}

                {/* Діти без групи */}
                {groupedEnrollments.noGroupEnrollments.length > 0 && (
                  <React.Fragment>
                    <tr className="bg-muted/50 border-t-2 border-b">
                      <td
                        colSpan={days.length + 2}
                        className="px-4 py-2 font-semibold text-sm"
                      >
                        Без групи
                      </td>
                    </tr>
                    {groupedEnrollments.noGroupEnrollments.map((enrollment) => {
                      const totals = studentTotals[enrollment.id] || {
                        present: 0,
                        sick: 0,
                        absent: 0,
                        values: 0,
                      };

                      const studentId =
                        enrollment.students?.id || enrollment.student_id;
                      return (
                        <tr
                          key={enrollment.id}
                          className={cn(
                            "border-t hover:bg-muted/20",
                            !enrollment.is_active &&
                              "bg-muted/40 text-muted-foreground",
                          )}
                        >
                          <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium text-sm">
                            <div className="flex items-center gap-2">
                              {studentId ? (
                                <Link
                                  to={`/students/${studentId}`}
                                  className="text-primary hover:underline"
                                >
                                  {enrollment.students.full_name}
                                </Link>
                              ) : (
                                <span>{enrollment.students.full_name}</span>
                              )}
                              {!enrollment.is_active && (
                                <span className="rounded-full border border-dashed border-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wide">
                                  Архів
                                </span>
                              )}
                            </div>
                            {role !== "manager" &&
                              (enrollment.custom_price ||
                                enrollment.discount_percent > 0) && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {enrollment.custom_price &&
                                  `${enrollment.custom_price} ₴`}
                                {enrollment.discount_percent > 0 &&
                                  ` -${enrollment.discount_percent}%`}
                              </span>
                            )}
                          </td>
                          {days.map((day) => {
                            const dateStr = formatDateString(day);
                            const key = `${enrollment.id}-${dateStr}`;
                            const attendance = attendanceMap.get(key);

                            return (
                              <RecordInfoContextMenu key={dateStr} tableName="attendance" recordId={attendance?.id} mode="last_changed">
                              <td
                                className={cn(
                                  "p-0.5 text-center",
                                  isWeekend(day) && WEEKEND_BG_COLOR,
                                )}
                              >
                                <EnhancedAttendanceCell
                                  status={attendance?.status || null}
                                  amount={attendance?.amount || 0}
                                  value={attendance?.value || null}
                                  notes={attendance?.notes || null}
                                  manualValueEdit={
                                    attendance?.manual_value_edit || false
                                  }
                                  isWeekend={isWeekend(day)}
                                  onChange={(status, value, notes) =>
                                    handleStatusChange(
                                      enrollment.id,
                                      dateStr,
                                      status,
                                      value,
                                      notes || null,
                                      0, // activityPrice не використовується - залишаємо для сумісності
                                      enrollment.custom_price,
                                      enrollment.discount_percent,
                                      enrollment,
                                    )
                                  }
                                  activityPrice={0} // Не використовується - залишаємо для сумісності типів
                                  customPrice={enrollment.custom_price}
                                  discountPercent={enrollment.discount_percent}
                                  date={dateStr}
                                  activity={activity}
                                  priceHistory={priceHistory}
                                />
                              </td>
                              </RecordInfoContextMenu>
                            );
                          })}
                          <td className="sticky right-0 z-10 bg-card px-2 py-2 text-xs text-center">
                            <div>П: {totals.present}</div>
                            <div>Х: {totals.sick}</div>
                            <div>Н: {totals.absent}</div>
                            <div className="mt-1 font-semibold">
                              Σ: {totals.values}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Додати дитину до активності</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Дитина</Label>
              <Select
                value={selectedStudentId}
                onValueChange={setSelectedStudentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Оберіть дитину" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleStudents.length === 0 && (
                    <SelectItem value="none" disabled>
                      Немає доступних дітей
                    </SelectItem>
                  )}
                  {eligibleStudents.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Індивідуальна ціна (опціонально)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={customPrice}
                onChange={(event) => setCustomPrice(event.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Знижка (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={discountPercent}
                onChange={(event) => setDiscountPercent(event.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsAddStudentOpen(false)}
              >
                Скасувати
              </Button>
              <Button
                onClick={handleAddStudent}
                disabled={
                  !selectedStudentId ||
                  selectedStudentId === "none" ||
                  createEnrollment.isPending
                }
              >
                Додати
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
