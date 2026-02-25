import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  User,
  Wallet,
  Calendar,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { StaffForm } from "@/components/staff/StaffForm";
import { useStaffMember, useUpdateStaff } from "@/hooks/useStaff";
import {
  formatCurrency,
  formatDate,
  formatLocalDate,
  getDaysInMonth,
  formatShortDate,
  getWeekdayShort,
  isWeekend,
  formatDateString,
  WEEKEND_BG_COLOR,
  getMonthStartDate,
  getMonthEndDate,
} from "@/lib/attendance";
import { getWorkingDaysInMonthWithHolidays } from "@/hooks/useHolidays";
import { calculateManualRateAmount } from "@/lib/attendance";
import { StaffBillingEditorNew } from "@/components/staff/StaffBillingEditorNew";
import { StaffManualRateHistoryEditor } from "@/components/staff/StaffManualRateHistoryEditor";
import { DeductionsEditor } from "@/components/staff/DeductionsEditor";
import {
  useStaffBillingRules,
  useCreateStaffBillingRule,
  useDeleteStaffBillingRule,
  useStaffManualRateHistory,
  useCreateStaffManualRateHistory,
  useDeleteStaffManualRateHistory,
  useStaffJournalEntries,
  useStaffPayouts,
  useCreateStaffPayout,
  useUpdateStaffPayout,
  useDeleteStaffPayout,
  useUpsertStaffJournalEntry,
  getStaffBillingRuleForDate,
  getStaffManualRateForDate,
  type StaffBillingRule,
  type StaffManualRateHistory,
  type Deduction,
} from "@/hooks/useStaffBilling";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { useActivities } from "@/hooks/useActivities";
import { useGroupLessons } from "@/hooks/useGroupLessons";
import { useMemo } from "react";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { usePaymentAccounts } from "@/hooks/usePaymentAccounts";
import {
  useStaffOpeningBalancesForMonth,
  useStaffOpeningBalancesCumulativeUpToMonth,
  useCreateStaffOpeningBalance,
  useUpdateStaffOpeningBalance,
  useDeleteStaffOpeningBalance,
  type StaffOpeningBalance,
} from "@/hooks/useStaffOpeningBalances";
import { StaffOpeningBalanceDialog } from "@/components/staff/StaffOpeningBalanceDialog";
import { PayrollPayoutDialog } from "@/components/staff/PayrollPayoutDialog";
import {
  resolvePayrollPayoutPrefill,
  type ResolvedPayrollPayoutPrefill,
} from "@/lib/payrollPayoutContract";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommissionEntry, useCommissionsForSalaryTransactions } from "@/hooks/useCommissionEntry";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: staff, isLoading: staffLoading } = useStaffMember(id!);
  const updateStaff = useUpdateStaff();
  const { data: billingRules = [] } = useStaffBillingRules(id);
  const { data: manualRateHistory = [] } = useStaffManualRateHistory(id);
  const createBillingRule = useCreateStaffBillingRule();
  const deleteBillingRule = useDeleteStaffBillingRule();
  const createManualRateHistory = useCreateStaffManualRateHistory();
  const deleteManualRateHistory = useDeleteStaffManualRateHistory();

  type StaffBillingRuleInput = Omit<
    StaffBillingRule,
    "id" | "staff_id" | "created_at" | "updated_at"
  >;
  type StaffManualRateHistoryInput = Omit<
    StaffManualRateHistory,
    "id" | "staff_id" | "created_at" | "updated_at"
  >;

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [financialTab, setFinancialTab] = useState<
    "rules" | "manual-rates" | "deductions" | "history"
  >("rules");
  const [billingRulesState, setBillingRulesState] = useState<
    StaffBillingRuleInput[]
  >([]);
  const [manualRateHistoryState, setManualRateHistoryState] = useState<
    StaffManualRateHistoryInput[]
  >([]);
  const [deductionsState, setDeductionsState] = useState<Deduction[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(
    formatLocalDate(new Date()),
  );

  // Financial Calendar state
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [auditMode, setAuditMode] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedPayoutDate, setSelectedPayoutDate] = useState<string | null>(
    null,
  );
  const [payoutPrefill, setPayoutPrefill] =
    useState<ResolvedPayrollPayoutPrefill>({
      source: "financial-history",
      staffId: id || undefined,
      payoutDate: undefined,
      accountId: undefined,
      subcategoryId: null,
      lockStaff: true,
    });
  const [isPayoutDialogOpen, setIsPayoutDialogOpen] = useState(false);
  const [editingPayoutId, setEditingPayoutId] = useState<string | null>(null);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [editingBalance, setEditingBalance] = useState<StaffOpeningBalance | null>(null);

  // Financial Calendar data
  const { data: journalEntries = [] } = useStaffJournalEntries(
    id,
    calendarMonth,
    calendarYear,
  );
  const { data: allJournalEntries = [] } = useStaffJournalEntries(id);
  const { data: payouts = [] } = useStaffPayouts(id);
  const payoutIds = useMemo(() => payouts.map((p) => p.id), [payouts]);
  const payoutIdsKey = useMemo(
    () => [...payoutIds].sort().join(","),
    [payoutIds],
  );
  const { data: salaryTxByPayoutId = new Map<string, string>() } = useQuery({
    queryKey: ["salary-tx-for-payouts", payoutIdsKey],
    queryFn: async () => {
      if (payoutIds.length === 0) return new Map<string, string>();
      const { data, error } = await supabase
        .from("finance_transactions")
        .select("id, staff_payout_id")
        .in("staff_payout_id", payoutIds);
      if (error) return new Map<string, string>();
      const map = new Map<string, string>();
      (data || []).forEach((row: any) => {
        if (row.staff_payout_id) map.set(row.staff_payout_id, row.id);
      });
      return map;
    },
    enabled: payoutIds.length > 0,
  });
  const salaryTxIds = useMemo(
    () => Array.from(salaryTxByPayoutId.values()),
    [salaryTxByPayoutId]
  );
  const { data: commissionsMap = new Map<string, { amount: number; id: string }>() } =
    useCommissionsForSalaryTransactions(salaryTxIds);
  const syncCommission = useCommissionEntry();
  const { data: staffBalancesForMonth = [] } = useStaffOpeningBalancesForMonth(id, calendarMonth, calendarYear);
  const { data: staffBalancesCumulative = [] } = useStaffOpeningBalancesCumulativeUpToMonth(id, calendarMonth, calendarYear);
  const createStaffBalance = useCreateStaffOpeningBalance();
  const updateStaffBalance = useUpdateStaffOpeningBalance();
  const deleteStaffBalance = useDeleteStaffOpeningBalance();
  const { data: activities = [] } = useActivities();
  const salaryActivity = useMemo(
    () => activities.find((activity) => activity.category === "salary") || null,
    [activities],
  );
  const { data: salaryExpenseCategories = [] } = useExpenseCategories(
    salaryActivity?.id,
  );
  const { data: allGroupLessons = [] } = useGroupLessons(); // Получаем все групповые занятия для получения названий
  const { data: accounts = [] } = usePaymentAccounts();
  const createPayout = useCreateStaffPayout();
  const updatePayout = useUpdateStaffPayout();
  const deletePayout = useDeleteStaffPayout();
  const upsertJournalEntry = useUpsertStaffJournalEntry();

  // State for editing journal entries in financial calendar
  const [editingCell, setEditingCell] = useState<{
    activityId: string;
    date: string;
  } | null>(null);
  const [popoverOpenKey, setPopoverOpenKey] = useState<string | null>(null); // Key: "rowKey:date"
  const [manualValue, setManualValue] = useState<string>("");
  // State for per_working_day popup
  const [perWorkingDayState, setPerWorkingDayState] = useState<{
    attendanceStatus: "present" | "absent" | "manual" | null;
    manualAmount: string;
    bonus: string;
    bonusNotes: string;
    description: string;
  }>({
    attendanceStatus: null,
    manualAmount: "",
    bonus: "",
    bonusNotes: "",
    description: "",
  });

  const payoutSchema = z.object({
    staff_id: z.string().min(1, "Оберіть співробітника"),
    amount: z.number().min(0.01, "Сума має бути більше 0"),
    payout_date: z.string().min(1, "Оберіть дату"),
    notes: z.string().optional(),
    account_id: z.string().min(1, "Оберіть рахунок"),
    commission: z.preprocess(
      (value) => {
        if (value === "" || value === null || value === undefined) return 0;
        const parsed = Number(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      },
      z.number().min(0),
    ),
    expense_category_id: z.string().optional(),
  });

  type PayoutFormData = z.infer<typeof payoutSchema>;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PayoutFormData>({
    resolver: zodResolver(payoutSchema),
    defaultValues: {
      staff_id: id || "",
      amount: 0,
      payout_date: formatLocalDate(new Date()),
      notes: "",
      account_id: "",
      commission: 0,
      expense_category_id: "none",
    },
  });

  useEffect(() => {
    if (staff) {
      setDeductionsState((staff.deductions as Deduction[]) || []);
    }
  }, [staff]);

  useEffect(() => {
    setPayoutPrefill((prev) => ({
      ...prev,
      source: "financial-history",
      staffId: id || undefined,
      lockStaff: true,
    }));
  }, [id]);

  useEffect(() => {
    // Initialize with empty array for new rules
    setBillingRulesState([]);
    setManualRateHistoryState([]);
  }, []);

  const handleUpdateProfile = (data: any) => {
    if (!id) return;
    updateStaff.mutate({ id, ...data });
    setEditProfileOpen(false);
  };

  const handleSaveBillingRules = () => {
    if (!id) return;
    const autoActivityIds = new Set(
      billingRulesState.map(
        (rule) =>
          (rule.activity_id === "null" ? null : rule.activity_id) ?? "all",
      ),
    );

    // Save each new rule
    billingRulesState.forEach((rule) => {
      const activityId = rule.activity_id === "null" ? null : rule.activity_id;
      createBillingRule.mutate({
        staff_id: id,
        activity_id: activityId,
        group_lesson_id: rule.group_lesson_id ?? null, // Важно: сохраняем group_lesson_id
        rate_type: rule.rate_type,
        rate: rule.rate,
        lesson_limit: rule.lesson_limit ?? null,
        penalty_trigger_percent: rule.penalty_trigger_percent ?? null,
        penalty_percent: rule.penalty_percent ?? null,
        extra_lesson_rate: rule.extra_lesson_rate ?? null,
        effective_from: effectiveFrom,
        effective_to: null,
      });
    });

    // Reset state after saving
    setBillingRulesState([]);
  };

  const handleSaveManualRateHistory = () => {
    if (!id) return;

    // Save each new entry
    manualRateHistoryState.forEach((entry) => {
      createManualRateHistory.mutate({
        staff_id: id,
        activity_id: entry.activity_id ?? null,
        manual_rate_type: entry.manual_rate_type,
        manual_rate_value: entry.manual_rate_value,
        effective_from: effectiveFrom,
        effective_to: null,
      });
    });

    // Reset state after saving
    setManualRateHistoryState([]);
  };

  const handleSaveDeductions = () => {
    if (!id) return;
    updateStaff.mutate({
      id,
      deductions: deductionsState,
    });
  };

  const handleDeleteBillingRule = (ruleId: string) => {
    if (!id) return;
    deleteBillingRule.mutate({ id: ruleId, staffId: id });
  };

  const handleDeleteManualRateHistory = (entryId: string) => {
    if (!id) return;
    deleteManualRateHistory.mutate({ id: entryId, staffId: id });
  };

  // Financial Calendar handlers
  const handlePrevMonth = () => {
    // Close popover when changing month
    setEditingCell(null);
    setPopoverOpenKey(null);
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleNextMonth = () => {
    // Close popover when changing month
    setEditingCell(null);
    setPopoverOpenKey(null);
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const monthSummary = useMemo(() => {
    const startDate = getMonthStartDate(calendarYear, calendarMonth);
    const endDate = getMonthEndDate(calendarYear, calendarMonth);
    const accrued = journalEntries.reduce(
      (sum, entry) => sum + (Number(entry.amount) || 0),
      0,
    );
    const paid = payouts
      .filter(
        (payout) =>
          payout.payout_date >= startDate && payout.payout_date <= endDate,
      )
      .reduce((sum, payout) => sum + (Number(payout.amount) || 0), 0);
    const openingForMonth = staffBalancesForMonth.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    return { accrued, paid, balance: accrued - paid + openingForMonth };
  }, [journalEntries, payouts, staffBalancesForMonth, calendarMonth, calendarYear]);

  // Создаем Map для быстрого доступа к названиям групповых занятий
  const groupLessonsMap = useMemo(() => {
    const map = new Map<string, string>();
    allGroupLessons.forEach((lesson) => {
      map.set(lesson.id, lesson.name);
    });
    return map;
  }, [allGroupLessons]);

  // Группировка записей по статьям выплат для детализации
  const paymentItemsSummary = useMemo(() => {
    const itemsMap = new Map<
      string,
      {
        name: string;
        totalAmount: number;
        totalHours: number | null;
        entriesCount: number;
        hasHours: boolean;
      }
    >();

    journalEntries.forEach((entry) => {
      const activityId = entry.activity_id || "none";
      const mode = entry.is_manual_override ? "manual" : "auto";
      const isGroup =
        entry.group_lesson_id !== null && entry.group_lesson_id !== undefined;

      // Формируем ключ с учетом типа журнала
      const rowKey = isGroup
        ? `${activityId}:${mode}:group:${entry.group_lesson_id}`
        : `${activityId}:${mode}:regular`;

      const activity = activities.find((a) => a.id === activityId);
      const baseName = activity ? activity.name : "Без активності";

      let name: string;
      if (activityId === "none") {
        name =
          mode === "manual"
            ? "Ручні записи (без активності)"
            : "Авто нарахування (без активності)";
      } else if (isGroup) {
        // Для групповых занятий добавляем название группового занятия
        const groupLessonName = entry.group_lesson_id
          ? groupLessonsMap.get(entry.group_lesson_id)
          : "Невідоме заняття";
        name = `${baseName} — ${groupLessonName}${mode === "manual" ? " (ручні)" : " (авто)"}`;
      } else {
        // Обычные записи
        name = `${baseName}${mode === "manual" ? " — ручні" : ""}`;
      }

      if (!itemsMap.has(rowKey)) {
        itemsMap.set(rowKey, {
          name,
          totalAmount: 0,
          totalHours: null,
          entriesCount: 0,
          hasHours: false,
          isGroup,
        });
      }

      const item = itemsMap.get(rowKey)!;
      item.totalAmount += Number(entry.amount) || 0;
      item.entriesCount += 1;

      // Если есть hours_worked, суммируем часы
      if (entry.hours_worked !== null && entry.hours_worked !== undefined) {
        if (item.totalHours === null) {
          item.totalHours = 0;
        }
        item.totalHours += Number(entry.hours_worked) || 0;
        item.hasHours = true;
      }
    });

    // Преобразуем в массив и сортируем: сначала обычные, потом групповые, внутри каждой группы - по алфавиту
    return Array.from(itemsMap.values())
      .filter((item) => item.totalAmount > 0) // Показываем только статьи с начислениями
      .sort((a, b) => {
        // Сначала обычные (isGroup = false), потом групповые (isGroup = true)
        if (a.isGroup !== b.isGroup) {
          return a.isGroup ? 1 : -1;
        }
        // Внутри каждой группы - по алфавиту
        return a.name.localeCompare(b.name, "uk-UA");
      });
  }, [journalEntries, activities, groupLessonsMap]);

  const totalSummary = useMemo(() => {
    const accrued = allJournalEntries.reduce(
      (sum, entry) => sum + (Number(entry.amount) || 0),
      0,
    );
    const paid = payouts.reduce(
      (sum, payout) => sum + (Number(payout.amount) || 0),
      0,
    );
    const openingCumulative = staffBalancesCumulative.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    return { accrued, paid, balance: accrued - paid + openingCumulative };
  }, [allJournalEntries, payouts, staffBalancesCumulative]);

  const handleBalanceSubmit = async (data: { amount: number }) => {
    if (!id) return;
    const balanceDate = getMonthStartDate(calendarYear, calendarMonth);
    if (editingBalance) {
      await updateStaffBalance.mutateAsync({ id: editingBalance.id, amount: data.amount });
    } else {
      await createStaffBalance.mutateAsync({
        staff_id: id,
        balance_date: balanceDate,
        amount: data.amount,
      });
    }
    setBalanceDialogOpen(false);
    setEditingBalance(null);
  };

  const handlePayoutCellClick = (date: string) => {
    const prefill = resolvePayrollPayoutPrefill({
      source: "financial-history",
      staffId: id || undefined,
      payoutDate: date,
    });
    setPayoutPrefill(prefill);
    setSelectedPayoutDate(date);
    setIsPayoutDialogOpen(true);
    setEditingPayoutId(null);
    reset({
      staff_id: prefill.staffId || "",
      amount: 0,
      payout_date: prefill.payoutDate || date,
      notes: "",
      account_id: prefill.accountId || "",
      expense_category_id: prefill.subcategoryId || "none",
    });
  };

  const handlePayoutSubmit = async (data: PayoutFormData) => {
    if (!id || !staff) return;

    try {
      let salaryTransactionId: string;
      const selectedCategoryId =
        data.expense_category_id && data.expense_category_id !== "none"
          ? data.expense_category_id
          : null;
      if (editingPayoutId) {
        await updatePayout.mutateAsync({
          id: editingPayoutId,
          staff_id: data.staff_id,
          amount: data.amount,
          payout_date: data.payout_date,
          notes: data.notes || null,
          account_id: data.account_id,
          expense_category_id: selectedCategoryId,
        });
        salaryTransactionId = salaryTxByPayoutId.get(editingPayoutId) || "";
      } else {
        const result = await createPayout.mutateAsync({
          staff_id: data.staff_id,
          amount: data.amount,
          payout_date: data.payout_date,
          notes: data.notes || null,
          account_id: data.account_id,
          expense_category_id: selectedCategoryId,
        });
        salaryTransactionId = (result as any).salaryTransactionId || "";
      }
      const commissionAmount = Number(data.commission ?? 0);
      if (salaryTransactionId) {
        await syncCommission.mutateAsync({
          salaryTransactionId,
          amount: commissionAmount,
          date: data.payout_date,
          accountId: data.account_id || null,
          staffName: staff.full_name || "невідомий",
        });
      }
      reset();
      closePayoutDialog();
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  const closePayoutDialog = () => {
    setIsPayoutDialogOpen(false);
    setSelectedPayoutDate(null);
    setEditingPayoutId(null);
  };

  const payoutsForSelectedDate = useMemo(() => {
    if (!selectedPayoutDate) return [];
    return payouts.filter(
      (payout) => payout.payout_date === selectedPayoutDate,
    );
  }, [payouts, selectedPayoutDate]);

  // Handle cell click for editing journal entries
  // rowKey format: "{activityId}:{mode}:{type}[:groupLessonId]" e.g. "abc123:auto:regular" or "none:manual:regular"
  const handleJournalEntryCellClick = async (rowKey: string, date: string) => {
    if (!id) return;

    // Extract realActivityId from rowKey
    const parts = rowKey.split(":");
    const activityIdPart = parts[0]; // "abc123" or "none"
    const realActivityId = activityIdPart === "none" ? null : activityIdPart;

    // Check if date is in current month/year
    const dateObj = new Date(date);
    if (
      dateObj.getMonth() !== calendarMonth ||
      dateObj.getFullYear() !== calendarYear
    ) {
      // Date is not in current month, don't open popover
      return;
    }

    // Use rowKey as unique identifier for editing state and popover key
    setEditingCell({ activityId: rowKey, date });
    setPopoverOpenKey(`${rowKey}:${date}`);

    // Find existing entry - check both manual and auto entries
    const existing = journalEntries.find(
      (entry) =>
        (entry.activity_id === realActivityId ||
          (entry.activity_id === null && realActivityId === null)) &&
        entry.date === date &&
        entry.is_manual_override === true,
    );

    // Get manual rate for this date and activity
    const currentRate = getStaffManualRateForDate(
      manualRateHistory,
      date,
      realActivityId,
    );
    const rateType = currentRate?.manual_rate_type || null;

    if (rateType === "per_working_day") {
      // For per_working_day, initialize popup state
      const dateObj = new Date(date);
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth() + 1;
      const rateValue = currentRate?.manual_rate_value || 0;
      const dailyRate = await calculateManualRateAmount({
        rateValue,
        year,
        month,
        getWorkingDaysInMonthWithHolidaysFn: getWorkingDaysInMonthWithHolidays,
      });

      // Determine attendance status from existing entry
      let attendanceStatus: "present" | "absent" | "manual" | null = null;
      let manualAmount = "";
      const bonus = existing?.bonus?.toString() || "";
      const bonusNotes = existing?.bonus_notes || "";

      if (existing) {
        const baseAmount = existing.amount - (existing.bonus || 0);
        if (Math.abs(baseAmount - 0) < 0.01) {
          attendanceStatus = "absent";
        } else if (Math.abs(baseAmount - dailyRate) < 0.01) {
          attendanceStatus = "present";
        } else {
          attendanceStatus = "manual";
          manualAmount = baseAmount.toString();
        }
      }

      setPerWorkingDayState({
        attendanceStatus,
        manualAmount,
        bonus,
        bonusNotes,
        description: existing?.description || "",
      });
    } else if (rateType === "hourly") {
      if (
        existing?.hours_worked !== null &&
        existing?.hours_worked !== undefined
      ) {
        setManualValue(existing.hours_worked.toString());
      } else {
        setManualValue(existing?.amount.toString() || "");
      }
      setPerWorkingDayState({
        ...perWorkingDayState,
        description: existing?.description || "",
      });
    } else if (rateType === "per_session") {
      // For per_session, calculate number of sessions from amount and rate
      const rateValue = currentRate?.manual_rate_value || 0;
      if (existing && rateValue > 0) {
        const sessions = existing.amount / rateValue;
        setManualValue(sessions.toString());
      } else {
        setManualValue(existing?.amount.toString() || "");
      }
      setPerWorkingDayState({
        ...perWorkingDayState,
        description: existing?.description || "",
      });
    } else {
      setManualValue(existing?.amount.toString() || "");
      setPerWorkingDayState({
        ...perWorkingDayState,
        description: existing?.description || "",
      });
    }
  };

  // Handle save manual entry
  const handleSaveManualEntry = () => {
    if (!editingCell || !id) return;

    // Extract realActivityId and mode from rowKey (editingCell.activityId is now rowKey)
    const parts = editingCell.activityId.split(":");
    const activityIdPart = parts[0]; // "abc123" or "none"
    const mode = parts[1]; // "auto" or "manual"
    const realActivityId = activityIdPart === "none" ? null : activityIdPart;
    const isEditingAutoEntry = mode === "auto";

    // Get manual rate for this date and activity
    const currentRate = getStaffManualRateForDate(
      manualRateHistory,
      editingCell.date,
      realActivityId,
    );
    const rateType = currentRate?.manual_rate_type || null;
    const rateValue = currentRate?.manual_rate_value || 0;

    // Find existing auto entry (to zero out if editing auto row)
    const existingAutoEntry = journalEntries.find(
      (entry) =>
        (entry.activity_id === realActivityId ||
          (entry.activity_id === null && realActivityId === null)) &&
        entry.date === editingCell.date &&
        entry.is_manual_override === false,
    );

    // Find existing manual entry (to update)
    const existingManualEntry = journalEntries.find(
      (entry) =>
        (entry.activity_id === realActivityId ||
          (entry.activity_id === null && realActivityId === null)) &&
        entry.date === editingCell.date &&
        entry.is_manual_override === true,
    );

    // Use manual entry for update, or auto entry if editing auto row and no manual exists
    const existing =
      existingManualEntry || (isEditingAutoEntry ? null : existingAutoEntry);

    // Function to zero out auto entry when creating manual override
    const zeroOutAutoEntry = () => {
      if (
        isEditingAutoEntry &&
        existingAutoEntry &&
        existingAutoEntry.amount !== 0
      ) {
        upsertJournalEntry.mutate({
          id: existingAutoEntry.id,
          staff_id: id,
          activity_id: realActivityId,
          date: editingCell.date,
          amount: 0,
          base_amount: existingAutoEntry.base_amount,
          hours_worked: 0,
          deductions_applied: existingAutoEntry.deductions_applied || [],
          is_manual_override: false, // Keep as auto entry
          notes: "Обнулено (є ручне коригування)",
        });
      }
    };

    if (rateType === "hourly") {
      // Hourly: input hours, amount = hours * rate
      if (!manualValue || manualValue.trim() === "") {
        // If empty, set to 0
        setManualValue("0");
      }

      const hours = parseFloat(manualValue || "0");
      if (isNaN(hours) || hours < 0) return;

      const amount = hours * rateValue;

      upsertJournalEntry.mutate(
        {
          id: existing?.id,
          staff_id: id,
          activity_id: realActivityId,
          date: editingCell.date,
          amount,
          base_amount: rateValue,
          hours_worked: hours,
          deductions_applied: [],
          is_manual_override: true,
          notes: `${hours} год. × ${rateValue} ₴`,
          description: perWorkingDayState.description || null,
        },
        {
          onSuccess: () => {
            zeroOutAutoEntry();
            setEditingCell(null);
            setPopoverOpenKey(null);
            setManualValue("");
          },
        },
      );
    } else if (rateType === "per_working_day") {
      // Per working day: calculate amount based on attendance status, add bonus
      if (!editingCell || !id) return;

      const dateObj = new Date(editingCell.date);
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth() + 1;

      getWorkingDaysInMonthWithHolidays(year, month).then((workingDays) => {
        const dailyRate = workingDays > 0 ? rateValue / workingDays : 0;
        let baseAmount = 0;

        if (perWorkingDayState.attendanceStatus === "present") {
          baseAmount = dailyRate;
        } else if (perWorkingDayState.attendanceStatus === "absent") {
          baseAmount = 0;
        } else if (perWorkingDayState.attendanceStatus === "manual") {
          baseAmount = parseFloat(perWorkingDayState.manualAmount) || 0;
        }

        const bonus = parseFloat(perWorkingDayState.bonus) || 0;
        const totalAmount = baseAmount + bonus;

        upsertJournalEntry.mutate(
          {
            id: existing?.id,
            staff_id: id,
            activity_id: realActivityId,
            date: editingCell.date,
            amount: totalAmount,
            base_amount: dailyRate,
            deductions_applied: [],
            is_manual_override: true,
            notes:
              perWorkingDayState.attendanceStatus === "present"
                ? `Присутній (${formatCurrency(dailyRate)})`
                : perWorkingDayState.attendanceStatus === "absent"
                  ? "Відсутній"
                  : `Ручне введення (${formatCurrency(baseAmount)})`,
            description: perWorkingDayState.description || null,
            bonus: bonus !== 0 ? bonus : null,
            bonus_notes: perWorkingDayState.bonusNotes || null,
          },
          {
            onSuccess: () => {
              zeroOutAutoEntry();
              setEditingCell(null);
              setPopoverOpenKey(null);
              setPerWorkingDayState({
                attendanceStatus: null,
                manualAmount: "",
                bonus: "",
                bonusNotes: "",
                description: "",
              });
            },
          },
        );
      });
    } else if (rateType === "per_session") {
      // Per session: input sessions, amount = sessions * rate
      if (!manualValue || manualValue.trim() === "") {
        setManualValue("0");
      }

      const sessions = parseFloat(manualValue || "0");
      if (isNaN(sessions) || sessions < 0) return;

      const amount = sessions * rateValue;

      upsertJournalEntry.mutate(
        {
          id: existing?.id,
          staff_id: id,
          activity_id: realActivityId,
          date: editingCell.date,
          amount,
          base_amount: rateValue,
          deductions_applied: [],
          is_manual_override: true,
          notes: `${sessions} зан. × ${rateValue} ₴`,
          description: perWorkingDayState.description || null,
        },
        {
          onSuccess: () => {
            zeroOutAutoEntry();
            setEditingCell(null);
            setPopoverOpenKey(null);
            setManualValue("");
          },
        },
      );
    } else {
      // Fixed amount: input amount directly
      if (!manualValue || manualValue.trim() === "") {
        setManualValue("0");
      }

      const amount = parseFloat(manualValue || "0");
      if (isNaN(amount) || amount < 0) return;

      upsertJournalEntry.mutate(
        {
          id: existing?.id,
          staff_id: id,
          activity_id: realActivityId,
          date: editingCell.date,
          amount,
          base_amount: amount,
          deductions_applied: [],
          is_manual_override: true,
          description: perWorkingDayState.description || null,
        },
        {
          onSuccess: () => {
            zeroOutAutoEntry();
            setEditingCell(null);
            setPopoverOpenKey(null);
            setManualValue("");
            setPerWorkingDayState({
              attendanceStatus: null,
              manualAmount: "",
              bonus: "",
              bonusNotes: "",
              description: "",
            });
          },
        },
      );
    }
  };

  if (staffLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Співробітника не знайдено</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/staff">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад до списку
          </Link>
        </Button>
      </div>
    );
  }

  const formatRateTypeLabel = (rateType: StaffBillingRule["rate_type"]) => {
    switch (rateType) {
      case "fixed":
        return "Фіксована";
      case "percent":
        return "Відсоток";
      case "per_session":
        return "За заняття";
      case "subscription":
        return "Абонемент";
      case "per_student":
        return "За учня";
      default:
        return "—";
    }
  };

  return (
    <>
      <PageHeader
        title={staff.full_name}
        actions={
          <Button variant="outline" asChild>
            <Link to="/staff">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Link>
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        {/* Staff Info - compact horizontal bar under header */}
        <Card className="py-3">
          <CardContent className="flex flex-wrap items-center gap-6 py-0">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{staff.full_name}</h3>
                <p className="text-sm text-muted-foreground">{staff.position}</p>
              </div>
            </div>
            <Badge
              variant={staff.is_active ? "default" : "secondary"}
            >
              {staff.is_active ? "Активний" : "Неактивний"}
            </Badge>
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Дата створення:</span> {formatDate(staff.created_at)}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditProfileOpen(true)}
              className="ml-auto"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Financial Conditions - full width */}
        <div className="w-full">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Фінансові умови
                </CardTitle>
                <CardDescription>
                  Налаштуйте індивідуальні ставки та комісії для співробітника
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={financialTab}
                  onValueChange={(v) =>
                    setFinancialTab(
                      v as "rules" | "manual-rates" | "deductions" | "history",
                    )
                  }
                >
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="rules">
                      Індивідуальні ставки (auto)
                    </TabsTrigger>
                    <TabsTrigger value="manual-rates">
                      Ставки для ручного режиму
                    </TabsTrigger>
                    <TabsTrigger value="deductions">
                      Динамічні комісії
                    </TabsTrigger>
                    <TabsTrigger value="history">Фінансова історія</TabsTrigger>
                  </TabsList>

                  <TabsContent value="rules" className="mt-6">
                    <StaffBillingEditorNew
                      rules={billingRulesState}
                      onChange={setBillingRulesState}
                      effectiveFrom={effectiveFrom}
                      onEffectiveFromChange={setEffectiveFrom}
                    />
                    <div className="mt-4 flex justify-end gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setBillingRulesState([])}
                      >
                        Скасувати
                      </Button>
                      <Button
                        onClick={handleSaveBillingRules}
                        disabled={billingRulesState.length === 0}
                      >
                        Зберегти ставки
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="manual-rates" className="mt-6">
                    <StaffManualRateHistoryEditor
                      history={manualRateHistoryState}
                      onChange={setManualRateHistoryState}
                      effectiveFrom={effectiveFrom}
                      onEffectiveFromChange={setEffectiveFrom}
                    />
                    <div className="mt-4 flex justify-end gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setManualRateHistoryState([])}
                      >
                        Скасувати
                      </Button>
                      <Button
                        onClick={handleSaveManualRateHistory}
                        disabled={manualRateHistoryState.length === 0}
                      >
                        Зберегти ставки
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="deductions" className="mt-6">
                    <DeductionsEditor
                      deductions={deductionsState}
                      onChange={setDeductionsState}
                    />
                    <div className="mt-4 flex justify-end gap-3">
                      <Button
                        variant="outline"
                        onClick={() =>
                          setDeductionsState(
                            (staff.deductions as Deduction[]) || [],
                          )
                        }
                      >
                        Скасувати
                      </Button>
                      <Button onClick={handleSaveDeductions}>
                        Зберегти комісії
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-6">
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">
                              Баланс за місяць
                            </CardTitle>
                            <CardDescription>
                              {
                                [
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
                                ][calendarMonth]
                              }{" "}
                              {calendarYear}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div
                              className={cn(
                                "text-2xl font-semibold",
                                monthSummary.balance >= 0
                                  ? "text-success"
                                  : "text-destructive",
                              )}
                            >
                              {formatCurrency(monthSummary.balance)}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              Нараховано: {formatCurrency(monthSummary.accrued)}{" "}
                              · Виплачено: {formatCurrency(monthSummary.paid)}
                            </div>

                            {/* Кнопка + залишок та список залишків */}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingBalance(null);
                                  setBalanceDialogOpen(true);
                                }}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                залишок
                              </Button>
                              {staffBalancesForMonth.map((b) => (
                                <div
                                  key={b.id}
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-1 rounded text-sm",
                                    b.amount >= 0 ? "bg-muted" : "bg-destructive/10",
                                  )}
                                >
                                  <span>
                                    {b.amount >= 0 ? "" : "−"} {formatCurrency(Math.abs(b.amount))}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      setEditingBalance(b);
                                      setBalanceDialogOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={async () => {
                                      if (window.confirm("Видалити залишок?")) {
                                        await deleteStaffBalance.mutateAsync(b.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>

                            {/* Детализация по статьям выплат */}
                            {paymentItemsSummary.length > 0 && (
                              <div className="mt-4 pt-4 border-t">
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  Деталізація по статтях:
                                </p>
                                <div className="space-y-1.5">
                                  {paymentItemsSummary.map((item, index) => (
                                    <div
                                      key={index}
                                      className="flex items-center justify-between text-xs"
                                    >
                                      <span className="text-muted-foreground">
                                        {item.name}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">
                                          {formatCurrency(item.totalAmount)}
                                        </span>
                                        {item.hasHours &&
                                        item.totalHours !== null &&
                                        item.totalHours > 0 ? (
                                          <span className="text-muted-foreground">
                                            ({item.totalHours.toFixed(1)}{" "}
                                            {item.totalHours === 1
                                              ? "година"
                                              : item.totalHours < 5
                                                ? "години"
                                                : "годин"}
                                            )
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground">
                                            ({item.entriesCount}{" "}
                                            {item.entriesCount === 1
                                              ? "заняття"
                                              : item.entriesCount < 5
                                                ? "заняття"
                                                : "занять"}
                                            )
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">
                              Баланс за весь період
                            </CardTitle>
                            <CardDescription>
                              Від початку співпраці
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div
                              className={cn(
                                "text-2xl font-semibold",
                                totalSummary.balance >= 0
                                  ? "text-success"
                                  : "text-destructive",
                              )}
                            >
                              {formatCurrency(totalSummary.balance)}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              Нараховано: {formatCurrency(totalSummary.accrued)}{" "}
                              · Виплачено: {formatCurrency(totalSummary.paid)}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">
                            Фінансова історія
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Нарахування по активностях та виплати за місяць
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Switch
                              checked={auditMode}
                              onCheckedChange={setAuditMode}
                            />
                            Режим перевірки
                          </label>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={handlePrevMonth}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-medium min-w-[150px] text-center">
                              {
                                [
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
                                ][calendarMonth]
                              }{" "}
                              {calendarYear}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={handleNextMonth}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <FinancialCalendarTable
                        staffId={id!}
                        month={calendarMonth}
                        year={calendarYear}
                        journalEntries={journalEntries}
                        payouts={payouts}
                        activities={activities}
                        auditMode={auditMode}
                        onPayoutCellClick={handlePayoutCellClick}
                        groupLessonsMap={groupLessonsMap}
                        manualRateHistory={manualRateHistory}
                        editingCell={editingCell}
                        manualValue={manualValue}
                        onCellClick={handleJournalEntryCellClick}
                        onSave={handleSaveManualEntry}
                        onCancel={() => {
                          setEditingCell(null);
                          setPopoverOpenKey(null);
                          setManualValue("");
                          setPerWorkingDayState({
                            attendanceStatus: null,
                            manualAmount: "",
                            bonus: "",
                            bonusNotes: "",
                            description: "",
                          });
                        }}
                        onManualValueChange={setManualValue}
                        perWorkingDayState={perWorkingDayState}
                        onPerWorkingDayStateChange={setPerWorkingDayState}
                        popoverOpenKey={popoverOpenKey}
                        setPopoverOpenKey={setPopoverOpenKey}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Billing Rules History */}
            {billingRules.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Історія ставок (автоматичний режим)</CardTitle>
                  <CardDescription>
                    Список усіх налаштованих ставок з датами дії для
                    автоматичного режиму
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Активність</TableHead>
                        <TableHead>Журнал</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>Значення</TableHead>
                        <TableHead>Діє з</TableHead>
                        <TableHead>Діє до</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billingRules.map((rule) => {
                        // Определяем принадлежность к журналу на основе явно указанного group_lesson_id
                        // Если group_lesson_id указан - это групповой журнал, иначе - обычный
                        const isGroup =
                          rule.group_lesson_id != null &&
                          rule.group_lesson_id !== "";
                        const groupLessonName =
                          isGroup && rule.group_lesson_id
                            ? groupLessonsMap.get(rule.group_lesson_id)
                            : null;

                        return (
                          <TableRow key={rule.id}>
                            <TableCell>
                              {rule.activity_id ? (
                                <Badge variant="outline" className="bg-blue-50">
                                  {rule.activity?.name ||
                                    "Конкретна активність"}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  Всі активності (глобально)
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {isGroup && groupLessonName ? (
                                <span className="text-sm text-muted-foreground">
                                  Журнал групи: {groupLessonName}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  Журнал списки
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {formatRateTypeLabel(rule.rate_type)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span>
                                  {rule.rate_type === "percent"
                                    ? `${rule.rate}%`
                                    : formatCurrency(rule.rate)}
                                </span>
                                {rule.rate_type === "subscription" && (
                                  <span className="text-xs text-muted-foreground">
                                    Лім: {rule.lesson_limit ?? "—"}, Поріг:{" "}
                                    {rule.penalty_trigger_percent ?? "—"}% ,
                                    Штраф: {rule.penalty_percent ?? "—"}%,
                                    Понад:{" "}
                                    {rule.extra_lesson_rate != null
                                      ? formatCurrency(rule.extra_lesson_rate)
                                      : "—"}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {formatDate(rule.effective_from)}
                            </TableCell>
                            <TableCell>
                              {rule.effective_to
                                ? formatDate(rule.effective_to)
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteBillingRule(rule.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Manual Rate History */}
            {manualRateHistory.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Історія ставок (ручний режим)</CardTitle>
                  <CardDescription>
                    Список усіх налаштованих ставок з датами дії для ручного
                    режиму
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Активність</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>Значення</TableHead>
                        <TableHead>Діє з</TableHead>
                        <TableHead>Діє до</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {manualRateHistory.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            {entry.activity_id ? (
                              <Badge variant="outline" className="bg-blue-50">
                                {activities.find(
                                  (activity) =>
                                    activity.id === entry.activity_id,
                                )?.name || "Активність"}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Всі активності</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry.manual_rate_type === "hourly"
                              ? "Почасово"
                              : "За заняття"}
                          </TableCell>
                          <TableCell>
                            {formatCurrency(entry.manual_rate_value)}
                            {entry.manual_rate_type === "hourly"
                              ? " / год"
                              : " / заняття"}
                          </TableCell>
                          <TableCell>
                            {formatDate(entry.effective_from)}
                          </TableCell>
                          <TableCell>
                            {entry.effective_to
                              ? formatDate(entry.effective_to)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                handleDeleteManualRateHistory(entry.id)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
      </div>

      <PayrollPayoutDialog
        open={isPayoutDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsPayoutDialogOpen(true);
          } else {
            closePayoutDialog();
          }
        }}
        onSubmit={handleSubmit(handlePayoutSubmit)}
        register={register}
        errors={errors}
        watch={watch}
        setValue={setValue}
        accounts={accounts}
        onCancel={closePayoutDialog}
        isSaving={
          createPayout.isPending ||
          updatePayout.isPending ||
          syncCommission.isPending
        }
        payoutsForSelectedDate={payoutsForSelectedDate}
        salaryTxByPayoutId={salaryTxByPayoutId}
        commissionsMap={commissionsMap}
        formatCurrency={formatCurrency}
        onEditPayout={(payout, commissionAmount) => {
          setEditingPayoutId(payout.id);
          reset({
            staff_id: payout.staff_id || id || "",
            amount: payout.amount,
            payout_date: payout.payout_date,
            notes: payout.notes || "",
            account_id: payout.account_id || "",
            commission: commissionAmount,
            expense_category_id: "none",
          });
        }}
        onDeletePayout={async (payout) => {
          const note = window.prompt("Причина видалення (обовʼязково):");
          if (!note || !note.trim()) return;
          await deletePayout.mutateAsync({
            id: payout.id,
            staffId: staff?.id || "",
            deleteNote: note.trim(),
          });
        }}
        staffOptions={
          staff ? [{ id: staff.id, name: staff.full_name || "—" }] : []
        }
        staffFieldValue={watch("staff_id") || ""}
        onStaffFieldChange={(value) => setValue("staff_id", value)}
        staffFieldDisabled={payoutPrefill.lockStaff}
        subcategoryOptions={salaryExpenseCategories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
        subcategoryFieldValue={watch("expense_category_id") || "none"}
        onSubcategoryFieldChange={(value) =>
          setValue("expense_category_id", value)
        }
      />

      <StaffForm
        open={editProfileOpen}
        onOpenChange={setEditProfileOpen}
        onSubmit={handleUpdateProfile}
        initialData={staff}
        isLoading={updateStaff.isPending}
      />

      <StaffOpeningBalanceDialog
        open={balanceDialogOpen}
        onOpenChange={setBalanceDialogOpen}
        month={calendarMonth}
        year={calendarYear}
        editingBalance={editingBalance}
        onSubmit={handleBalanceSubmit}
        isLoading={createStaffBalance.isPending || updateStaffBalance.isPending}
      />
    </>
  );
}

// Financial Calendar Table Component
interface FinancialCalendarTableProps {
  staffId: string;
  month: number;
  year: number;
  journalEntries: any[];
  payouts: any[];
  activities: any[];
  auditMode: boolean;
  onPayoutCellClick: (date: string) => void;
  groupLessonsMap: Map<string, string>;
  manualRateHistory: StaffManualRateHistory[];
  editingCell: { activityId: string; date: string } | null;
  manualValue: string;
  onCellClick: (activityId: string, date: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onManualValueChange: (value: string) => void;
  perWorkingDayState: {
    attendanceStatus: "present" | "absent" | "manual" | null;
    manualAmount: string;
    bonus: string;
    bonusNotes: string;
    description: string;
  };
  onPerWorkingDayStateChange: (state: {
    attendanceStatus: "present" | "absent" | "manual" | null;
    manualAmount: string;
    bonus: string;
    bonusNotes: string;
    description: string;
  }) => void;
  popoverOpenKey: string | null;
  setPopoverOpenKey: (key: string | null) => void;
}

function FinancialCalendarTable({
  staffId,
  month,
  year,
  journalEntries,
  payouts,
  activities,
  auditMode,
  onPayoutCellClick,
  groupLessonsMap,
  manualRateHistory,
  editingCell,
  manualValue,
  onCellClick,
  onSave,
  onCancel,
  onManualValueChange,
  perWorkingDayState,
  onPerWorkingDayStateChange,
  popoverOpenKey,
  setPopoverOpenKey,
}: FinancialCalendarTableProps) {
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const salaryActivityId = useMemo(
    () =>
      activities.find((activity) => activity.category === "salary")?.id || null,
    [activities],
  );

  // Group journal entries by activity + mode (auto/manual) + journal type (regular/group)
  const entriesByRow = useMemo(() => {
    const map = new Map<string, Map<string, number>>(); // rowKey -> date -> amount

    journalEntries.forEach((entry) => {
      const activityId = entry.activity_id || "none";
      const mode = entry.is_manual_override ? "manual" : "auto";
      const isGroup =
        entry.group_lesson_id !== null && entry.group_lesson_id !== undefined;

      // Формируем ключ с учетом типа журнала
      const rowKey = isGroup
        ? `${activityId}:${mode}:group:${entry.group_lesson_id}`
        : `${activityId}:${mode}:regular`;

      if (!map.has(rowKey)) {
        map.set(rowKey, new Map());
      }
      const activityMap = map.get(rowKey)!;
      const dateStr = entry.date;
      const currentAmount = activityMap.get(dateStr) || 0;
      activityMap.set(dateStr, currentAmount + (Number(entry.amount) || 0));
    });

    // Add empty entries for manual rates that don't have journal entries yet
    const startDate = getMonthStartDate(year, month);
    const endDate = getMonthEndDate(year, month);

    manualRateHistory.forEach((rate) => {
      const effectiveFrom = new Date(rate.effective_from);
      const effectiveTo = rate.effective_to
        ? new Date(rate.effective_to)
        : null;
      const monthStart = new Date(startDate);
      const monthEnd = new Date(endDate);

      // Check if rate is active for this month
      if (
        effectiveFrom <= monthEnd &&
        (!effectiveTo || effectiveTo >= monthStart)
      ) {
        const activityId = rate.activity_id || "none";
        const rowKey = `${activityId}:manual:regular`;

        // Create empty map for this row if it doesn't exist
        if (!map.has(rowKey)) {
          map.set(rowKey, new Map());
        }
      }
    });

    return map;
  }, [journalEntries, manualRateHistory, year, month]);

  const entryDetailsByRow = useMemo(() => {
    const map = new Map<string, Map<string, any[]>>();
    journalEntries.forEach((entry) => {
      const activityId = entry.activity_id || "none";
      const mode = entry.is_manual_override ? "manual" : "auto";
      const isGroup =
        entry.group_lesson_id !== null && entry.group_lesson_id !== undefined;

      // Формируем ключ с учетом типа журнала
      const rowKey = isGroup
        ? `${activityId}:${mode}:group:${entry.group_lesson_id}`
        : `${activityId}:${mode}:regular`;

      if (!map.has(rowKey)) {
        map.set(rowKey, new Map());
      }
      const dateMap = map.get(rowKey)!;
      const dateStr = entry.date;
      const list = dateMap.get(dateStr) || [];
      list.push(entry);
      dateMap.set(dateStr, list);
    });
    return map;
  }, [journalEntries]);

  // Group payouts by date (filter by month) with notes, dates and amounts
  const payoutsByDate = useMemo(() => {
    const amountMap = new Map<string, number>();
    const notesMap = new Map<
      string,
      Array<{ note: string; date: string; amount: number }>
    >(); // date -> array of { note, date, amount }

    const startDate = getMonthStartDate(year, month);
    const endDate = getMonthEndDate(year, month);

    payouts.forEach((payout) => {
      if (payout.payout_date >= startDate && payout.payout_date <= endDate) {
        const currentAmount = amountMap.get(payout.payout_date) || 0;
        amountMap.set(payout.payout_date, currentAmount + payout.amount);

        // Collect notes with dates and amounts for this date
        const existingNotes = notesMap.get(payout.payout_date) || [];
        notesMap.set(payout.payout_date, [
          ...existingNotes,
          {
            note: payout.notes ? payout.notes.trim() : "",
            date: payout.payout_date,
            amount: payout.amount,
          },
        ]);
      }
    });
    return { amounts: amountMap, notes: notesMap };
  }, [payouts, month, year]);

  // Build rows for auto/manual entries per activity, with separate rows for group lessons
  const activityRows = useMemo(() => {
    const rowsMap = new Map<
      string,
      {
        id: string;
        realActivityId: string | null;
        name: string;
        source: "staff-expenses";
        isGroup: boolean;
        isManual: boolean;
      }
    >();

    // First, add rows from existing journal entries
    Array.from(entriesByRow.keys()).forEach((rowKey) => {
      const parts = rowKey.split(":");
      const activityId = parts[0];
      const mode = parts[1];
      const isManual = mode === "manual";
      const isGroup = parts[2] === "group";

      // Extract real activity ID (remove mode and type suffixes)
      const realActivityId = activityId === "none" ? null : activityId;
      const groupLessonId = isGroup ? parts[3] : null;

      const activity = activities.find((a) => a.id === activityId);
      const baseName = activity ? activity.name : "Без активності";

      let name: string;
      if (activityId === "none") {
        name = isManual
          ? "Ручні записи (без активності)"
          : "Авто нарахування (без активності)";
      } else if (isGroup && groupLessonId) {
        // Для групповых занятий добавляем название группового занятия
        const groupLessonName =
          groupLessonsMap.get(groupLessonId) || "Невідоме заняття";
        name = `${baseName} — ${groupLessonName} (${isManual ? "ручні" : "авто"})`;
      } else {
        // Обычные записи
        name = `${baseName} — ${isManual ? "ручні" : "авто"}`;
      }

      rowsMap.set(rowKey, {
        id: rowKey,
        realActivityId: realActivityId,
        name,
        source: "staff-expenses" as const,
        isGroup,
        isManual,
      });
    });

    // Add rows for manual rates that don't have entries yet
    const startDate = getMonthStartDate(year, month);
    const endDate = getMonthEndDate(year, month);

    manualRateHistory.forEach((rate) => {
      const effectiveFrom = new Date(rate.effective_from);
      const effectiveTo = rate.effective_to
        ? new Date(rate.effective_to)
        : null;
      const monthStart = new Date(startDate);
      const monthEnd = new Date(endDate);

      // Check if rate is active for this month
      if (
        effectiveFrom <= monthEnd &&
        (!effectiveTo || effectiveTo >= monthStart)
      ) {
        const activityId = rate.activity_id || "none";
        const rowKey = `${activityId}:manual:regular`;

        // Only add if row doesn't exist yet
        if (!rowsMap.has(rowKey)) {
          const activity = activities.find((a) => a.id === activityId);
          const baseName = activity ? activity.name : "Всі активності";
          const name = `${baseName} — ручні`;

          rowsMap.set(rowKey, {
            id: rowKey,
            realActivityId: rate.activity_id,
            name,
            source: "staff-expenses" as const,
            isGroup: false,
            isManual: true,
          });
        }
      }
    });

    const rows = Array.from(rowsMap.values());

    // Сортируем: сначала обычные, потом групповые, внутри каждой группы - по алфавиту
    rows.sort((a, b) => {
      if (a.isGroup !== b.isGroup) {
        return a.isGroup ? 1 : -1;
      }
      return a.name.localeCompare(b.name, "uk-UA");
    });
    return rows;
  }, [
    entriesByRow,
    activities,
    groupLessonsMap,
    manualRateHistory,
    year,
    month,
  ]);

  const getDateString = (date: Date) => {
    return formatDateString(date);
  };

  const buildAuditLink = (
    target: "staff-expenses" | "salary-expenses",
    dateStr: string,
  ) => {
    if (target === "salary-expenses" && salaryActivityId) {
      return `/activities/${salaryActivityId}/expenses?date=${dateStr}&staffId=${staffId}`;
    }
    return `/staff-expenses?date=${dateStr}&staffId=${staffId}`;
  };

  return (
    <TooltipProvider>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px] sticky left-0 bg-background z-10">
                Активність / Виплати
              </TableHead>
              {days.map((date, index) => {
                const dateStr = getDateString(date);
                const isWeekendDay = isWeekend(date);
                return (
                  <TableHead
                    key={dateStr}
                    className={cn(
                      "text-center min-w-[60px]",
                      isWeekendDay && WEEKEND_BG_COLOR,
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">
                        {getWeekdayShort(date)}
                      </span>
                      <span className="text-sm font-medium">
                        {date.getDate()}
                      </span>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Activity rows */}
            {activityRows.length > 0 ? (
              activityRows.map((activity) => {
                const activityEntries =
                  entriesByRow.get(activity.id) || new Map();
                return (
                  <TableRow key={activity.id}>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">
                      {activity.name}
                    </TableCell>
                    {days.map((date) => {
                      const dateStr = getDateString(date);
                      const amount = activityEntries.get(dateStr) || 0;
                      const details =
                        entryDetailsByRow.get(activity.id)?.get(dateStr) || [];
                      const hasDetails = details.length > 0;

                      // Find entry to check if it's manually edited
                      // Use realActivityId and match is_manual_override based on activity.isManual
                      const entry = journalEntries.find(
                        (e) =>
                          e.activity_id === activity.realActivityId &&
                          e.date === dateStr &&
                          (e.is_manual_override === true) === activity.isManual,
                      );
                      const isManuallyEdited =
                        entry?.is_manual_override === true;
                      const hasEntry = entry !== undefined; // Check if entry exists (even with 0 amount)
                      const hasBonus = (entry?.bonus || 0) > 0; // Check if entry has bonus

                      // Get hours or sessions for display
                      const hours = entry?.hours_worked;
                      const currentRate = getStaffManualRateForDate(
                        manualRateHistory,
                        dateStr,
                        activity.realActivityId,
                      );
                      const rateType = currentRate?.manual_rate_type || null;
                      const rateValue = currentRate?.manual_rate_value || 0;
                      let sessions: number | null = null;
                      if (
                        rateType === "per_session" &&
                        rateValue > 0 &&
                        entry
                      ) {
                        sessions = entry.amount / rateValue;
                      }

                      // Compare with activity.id (rowKey) for unique identification
                      const isEditing =
                        editingCell?.activityId === activity.id &&
                        editingCell?.date === dateStr;

                      // Use activity.id (rowKey) for popover key to ensure uniqueness
                      const currentPopoverKey = `${activity.id}:${dateStr}`;
                      const isPopoverOpen =
                        popoverOpenKey === currentPopoverKey;
                      const isWeekendDay = isWeekend(date);

                      return (
                        <TableCell
                          key={dateStr}
                          className={cn(
                            "text-center p-0.5",
                            isWeekendDay && WEEKEND_BG_COLOR,
                          )}
                        >
                          {hasEntry || amount > 0 ? (
                            <Popover
                              open={isPopoverOpen || isEditing}
                              onOpenChange={(open) => {
                                if (!open) {
                                  onCancel();
                                } else if (isEditing && !isPopoverOpen) {
                                  setPopoverOpenKey(currentPopoverKey);
                                }
                              }}
                            >
                              <PopoverTrigger asChild>
                                <button
                                  onClick={() =>
                                    onCellClick(activity.id, dateStr)
                                  }
                                  className={cn(
                                    "w-full h-8 text-xs rounded hover:bg-muted transition-colors flex flex-col items-center justify-center",
                                    hasBonus
                                      ? "bg-green-100 text-green-700 font-medium dark:bg-green-900/20 dark:text-green-400"
                                      : isManuallyEdited
                                        ? "bg-orange-100 text-orange-700 font-medium dark:bg-orange-900/20 dark:text-orange-400"
                                        : "bg-primary/10 text-primary font-medium",
                                  )}
                                >
                                  <div>{formatCurrency(amount)}</div>
                                  {hours !== null && hours !== undefined && (
                                    <div className="text-[10px] text-muted-foreground/80">
                                      {hours.toFixed(1)} год.
                                    </div>
                                  )}
                                  {sessions !== null &&
                                    sessions !== undefined && (
                                      <div className="text-[10px] text-muted-foreground/80">
                                        {sessions.toFixed(0)} зан.
                                      </div>
                                    )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64">
                                <div className="space-y-3">
                                  <div className="pb-2 border-b">
                                    <h3 className="text-sm font-semibold">
                                      Нарахування для {activity.name}
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      на {formatDate(dateStr)}
                                    </p>
                                  </div>

                                  {rateType === "hourly" ? (
                                    <>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Кількість годин
                                        </label>
                                        <Input
                                          type="number"
                                          step="0.5"
                                          min="0"
                                          value={manualValue}
                                          onChange={(e) =>
                                            onManualValueChange(e.target.value)
                                          }
                                          placeholder="0"
                                          className="mt-1"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Ставка: {rateValue} ₴/год
                                        </p>
                                        {manualValue &&
                                          !isNaN(parseFloat(manualValue)) && (
                                            <p className="text-xs font-medium text-primary mt-1">
                                              Нарахування:{" "}
                                              {formatCurrency(
                                                parseFloat(manualValue) *
                                                  rateValue,
                                              )}
                                            </p>
                                          )}
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Коментар (причина зміни)
                                        </label>
                                        <Textarea
                                          value={perWorkingDayState.description}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              description: e.target.value,
                                            })
                                          }
                                          placeholder="Вкажіть причину зміни автоначислення..."
                                          rows={2}
                                          className="mt-1"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={onSave}
                                          className="flex-1"
                                          disabled={
                                            manualValue === "" ||
                                            manualValue === null ||
                                            isNaN(parseFloat(manualValue)) ||
                                            parseFloat(manualValue) < 0
                                          }
                                        >
                                          Зберегти
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={onCancel}
                                        >
                                          Скасувати
                                        </Button>
                                      </div>
                                    </>
                                  ) : rateType === "per_working_day" ? (
                                    <>
                                      <div>
                                        <label className="text-sm font-medium mb-2 block">
                                          Статус присутності
                                        </label>
                                        <div className="space-y-2">
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              id={`present-${dateStr}`}
                                              name={`attendance-${dateStr}`}
                                              checked={
                                                perWorkingDayState.attendanceStatus ===
                                                "present"
                                              }
                                              onChange={() =>
                                                onPerWorkingDayStateChange({
                                                  ...perWorkingDayState,
                                                  attendanceStatus: "present",
                                                  manualAmount: "", // сброс значения при выборе "Присутній"
                                                })
                                              }
                                              className="h-4 w-4"
                                            />
                                            <label
                                              htmlFor={`present-${dateStr}`}
                                              className="text-sm"
                                            >
                                              Присутній
                                            </label>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              id={`absent-${dateStr}`}
                                              name={`attendance-${dateStr}`}
                                              checked={
                                                perWorkingDayState.attendanceStatus ===
                                                "absent"
                                              }
                                              onChange={() =>
                                                onPerWorkingDayStateChange({
                                                  ...perWorkingDayState,
                                                  attendanceStatus: "absent",
                                                  manualAmount: "", // сброс значения при выборе "Відсутній"
                                                })
                                              }
                                              className="h-4 w-4"
                                            />
                                            <label
                                              htmlFor={`absent-${dateStr}`}
                                              className="text-sm"
                                            >
                                              Відсутній
                                            </label>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              id={`manual-${dateStr}`}
                                              name={`attendance-${dateStr}`}
                                              checked={
                                                perWorkingDayState.attendanceStatus ===
                                                "manual"
                                              }
                                              onChange={() =>
                                                onPerWorkingDayStateChange({
                                                  ...perWorkingDayState,
                                                  attendanceStatus: "manual",
                                                  // manualAmount не сбрасываем, пользователь может продолжить ввод
                                                })
                                              }
                                              className="h-4 w-4"
                                            />
                                            <label
                                              htmlFor={`manual-${dateStr}`}
                                              className="text-sm"
                                            >
                                              Ручне введення
                                            </label>
                                          </div>
                                        </div>
                                      </div>

                                      {perWorkingDayState.attendanceStatus ===
                                        "manual" && (
                                        <div>
                                          <label className="text-sm font-medium">
                                            Сума (₴)
                                          </label>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={
                                              perWorkingDayState.manualAmount
                                            }
                                            onChange={(e) =>
                                              onPerWorkingDayStateChange({
                                                ...perWorkingDayState,
                                                manualAmount: e.target.value,
                                              })
                                            }
                                            placeholder="0"
                                            className="mt-1"
                                          />
                                        </div>
                                      )}

                                      <div>
                                        <label className="text-sm font-medium">
                                          Бонус (₴)
                                        </label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={perWorkingDayState.bonus}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              bonus: e.target.value,
                                            })
                                          }
                                          placeholder="0"
                                          className="mt-1"
                                        />
                                      </div>

                                      <div>
                                        <label className="text-sm font-medium">
                                          Примітка для бонусу
                                        </label>
                                        <Textarea
                                          value={perWorkingDayState.bonusNotes}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              bonusNotes: e.target.value,
                                            })
                                          }
                                          placeholder="Примітка..."
                                          rows={2}
                                          className="mt-1"
                                        />
                                      </div>

                                      <div>
                                        <label className="text-sm font-medium">
                                          Коментар (причина зміни)
                                        </label>
                                        <Textarea
                                          value={perWorkingDayState.description}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              description: e.target.value,
                                            })
                                          }
                                          placeholder="Вкажіть причину зміни автоначислення..."
                                          rows={2}
                                          className="mt-1"
                                        />
                                      </div>

                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={onSave}
                                          className="flex-1"
                                          disabled={
                                            perWorkingDayState.attendanceStatus ===
                                              null ||
                                            (perWorkingDayState.attendanceStatus ===
                                              "manual" &&
                                              (!perWorkingDayState.manualAmount ||
                                                isNaN(
                                                  parseFloat(
                                                    perWorkingDayState.manualAmount,
                                                  ),
                                                )))
                                          }
                                        >
                                          Зберегти
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={onCancel}
                                        >
                                          Скасувати
                                        </Button>
                                      </div>
                                    </>
                                  ) : rateType === "per_session" ? (
                                    <>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Кількість занять
                                        </label>
                                        <Input
                                          type="number"
                                          step="1"
                                          min="0"
                                          value={manualValue}
                                          onChange={(e) =>
                                            onManualValueChange(e.target.value)
                                          }
                                          placeholder="0"
                                          className="mt-1"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Ставка: {formatCurrency(rateValue)} /
                                          заняття
                                        </p>
                                        {manualValue &&
                                          !isNaN(parseFloat(manualValue)) && (
                                            <p className="text-xs font-medium text-primary mt-1">
                                              Нарахування:{" "}
                                              {formatCurrency(
                                                parseFloat(manualValue) *
                                                  rateValue,
                                              )}
                                            </p>
                                          )}
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Коментар (причина зміни)
                                        </label>
                                        <Textarea
                                          value={perWorkingDayState.description}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              description: e.target.value,
                                            })
                                          }
                                          placeholder="Вкажіть причину зміни автоначислення..."
                                          rows={2}
                                          className="mt-1"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={onSave}
                                          className="flex-1"
                                          disabled={
                                            manualValue === "" ||
                                            manualValue === null ||
                                            isNaN(parseFloat(manualValue)) ||
                                            parseFloat(manualValue) < 0
                                          }
                                        >
                                          Зберегти
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={onCancel}
                                        >
                                          Скасувати
                                        </Button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Сума (₴)
                                        </label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={manualValue}
                                          onChange={(e) =>
                                            onManualValueChange(e.target.value)
                                          }
                                          placeholder="0"
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Коментар (причина зміни)
                                        </label>
                                        <Textarea
                                          value={perWorkingDayState.description}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              description: e.target.value,
                                            })
                                          }
                                          placeholder="Вкажіть причину зміни автоначислення..."
                                          rows={2}
                                          className="mt-1"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={onSave}
                                          className="flex-1"
                                          disabled={
                                            !manualValue ||
                                            isNaN(parseFloat(manualValue)) ||
                                            parseFloat(manualValue) < 0
                                          }
                                        >
                                          Зберегти
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={onCancel}
                                        >
                                          Скасувати
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Popover
                              open={isPopoverOpen || isEditing}
                              onOpenChange={(open) => {
                                if (!open) {
                                  onCancel();
                                } else if (isEditing && !isPopoverOpen) {
                                  setPopoverOpenKey(currentPopoverKey);
                                }
                              }}
                            >
                              <PopoverTrigger asChild>
                                <button
                                  onClick={() =>
                                    onCellClick(activity.id, dateStr)
                                  }
                                  className={cn(
                                    "w-full h-8 text-xs rounded hover:bg-muted transition-colors text-muted-foreground",
                                    isWeekendDay && WEEKEND_BG_COLOR,
                                  )}
                                >
                                  —
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64">
                                <div className="space-y-3">
                                  <div className="pb-2 border-b">
                                    <h3 className="text-sm font-semibold">
                                      Нарахування для {activity.name}
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      на {formatDate(dateStr)}
                                    </p>
                                  </div>

                                  {rateType === "hourly" ? (
                                    <>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Кількість годин
                                        </label>
                                        <Input
                                          type="number"
                                          step="0.5"
                                          min="0"
                                          value={manualValue}
                                          onChange={(e) =>
                                            onManualValueChange(e.target.value)
                                          }
                                          placeholder="0"
                                          className="mt-1"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Ставка: {rateValue} ₴/год
                                        </p>
                                        {manualValue &&
                                          !isNaN(parseFloat(manualValue)) && (
                                            <p className="text-xs font-medium text-primary mt-1">
                                              Нарахування:{" "}
                                              {formatCurrency(
                                                parseFloat(manualValue) *
                                                  rateValue,
                                              )}
                                            </p>
                                          )}
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Коментар (причина зміни)
                                        </label>
                                        <Textarea
                                          value={perWorkingDayState.description}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              description: e.target.value,
                                            })
                                          }
                                          placeholder="Вкажіть причину зміни автоначислення..."
                                          rows={2}
                                          className="mt-1"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={onSave}
                                          className="flex-1"
                                          disabled={
                                            manualValue === "" ||
                                            manualValue === null ||
                                            isNaN(parseFloat(manualValue)) ||
                                            parseFloat(manualValue) < 0
                                          }
                                        >
                                          Зберегти
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={onCancel}
                                        >
                                          Скасувати
                                        </Button>
                                      </div>
                                    </>
                                  ) : rateType === "per_working_day" ? (
                                    <>
                                      <div>
                                        <label className="text-sm font-medium mb-2 block">
                                          Статус присутності
                                        </label>
                                        <div className="space-y-2">
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              id={`present-empty-${dateStr}`}
                                              name={`attendance-empty-${dateStr}`}
                                              checked={
                                                perWorkingDayState.attendanceStatus ===
                                                "present"
                                              }
                                              onChange={() =>
                                                onPerWorkingDayStateChange({
                                                  ...perWorkingDayState,
                                                  attendanceStatus: "present",
                                                })
                                              }
                                              className="h-4 w-4"
                                            />
                                            <label
                                              htmlFor={`present-empty-${dateStr}`}
                                              className="text-sm"
                                            >
                                              Присутній
                                            </label>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              id={`absent-empty-${dateStr}`}
                                              name={`attendance-empty-${dateStr}`}
                                              checked={
                                                perWorkingDayState.attendanceStatus ===
                                                "absent"
                                              }
                                              onChange={() =>
                                                onPerWorkingDayStateChange({
                                                  ...perWorkingDayState,
                                                  attendanceStatus: "absent",
                                                })
                                              }
                                              className="h-4 w-4"
                                            />
                                            <label
                                              htmlFor={`absent-empty-${dateStr}`}
                                              className="text-sm"
                                            >
                                              Відсутній
                                            </label>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              id={`manual-empty-${dateStr}`}
                                              name={`attendance-empty-${dateStr}`}
                                              checked={
                                                perWorkingDayState.attendanceStatus ===
                                                "manual"
                                              }
                                              onChange={() =>
                                                onPerWorkingDayStateChange({
                                                  ...perWorkingDayState,
                                                  attendanceStatus: "manual",
                                                })
                                              }
                                              className="h-4 w-4"
                                            />
                                            <label
                                              htmlFor={`manual-empty-${dateStr}`}
                                              className="text-sm"
                                            >
                                              Ручне введення
                                            </label>
                                          </div>
                                        </div>
                                      </div>

                                      {perWorkingDayState.attendanceStatus ===
                                        "manual" && (
                                        <div>
                                          <label className="text-sm font-medium">
                                            Сума (₴)
                                          </label>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={
                                              perWorkingDayState.manualAmount
                                            }
                                            onChange={(e) =>
                                              onPerWorkingDayStateChange({
                                                ...perWorkingDayState,
                                                manualAmount: e.target.value,
                                              })
                                            }
                                            placeholder="0"
                                            className="mt-1"
                                          />
                                        </div>
                                      )}

                                      <div>
                                        <label className="text-sm font-medium">
                                          Бонус (₴)
                                        </label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={perWorkingDayState.bonus}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              bonus: e.target.value,
                                            })
                                          }
                                          placeholder="0"
                                          className="mt-1"
                                        />
                                      </div>

                                      <div>
                                        <label className="text-sm font-medium">
                                          Примітка для бонусу
                                        </label>
                                        <Textarea
                                          value={perWorkingDayState.bonusNotes}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              bonusNotes: e.target.value,
                                            })
                                          }
                                          placeholder="Примітка..."
                                          rows={2}
                                          className="mt-1"
                                        />
                                      </div>

                                      <div>
                                        <label className="text-sm font-medium">
                                          Коментар (причина зміни)
                                        </label>
                                        <Textarea
                                          value={perWorkingDayState.description}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              description: e.target.value,
                                            })
                                          }
                                          placeholder="Вкажіть причину зміни автоначислення..."
                                          rows={2}
                                          className="mt-1"
                                        />
                                      </div>

                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={onSave}
                                          className="flex-1"
                                          disabled={
                                            perWorkingDayState.attendanceStatus ===
                                              null ||
                                            (perWorkingDayState.attendanceStatus ===
                                              "manual" &&
                                              (!perWorkingDayState.manualAmount ||
                                                isNaN(
                                                  parseFloat(
                                                    perWorkingDayState.manualAmount,
                                                  ),
                                                )))
                                          }
                                        >
                                          Зберегти
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={onCancel}
                                        >
                                          Скасувати
                                        </Button>
                                      </div>
                                    </>
                                  ) : rateType === "per_session" ? (
                                    <>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Кількість занять
                                        </label>
                                        <Input
                                          type="number"
                                          step="1"
                                          min="0"
                                          value={manualValue}
                                          onChange={(e) =>
                                            onManualValueChange(e.target.value)
                                          }
                                          placeholder="0"
                                          className="mt-1"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Ставка: {formatCurrency(rateValue)} /
                                          заняття
                                        </p>
                                        {manualValue &&
                                          !isNaN(parseFloat(manualValue)) && (
                                            <p className="text-xs font-medium text-primary mt-1">
                                              Нарахування:{" "}
                                              {formatCurrency(
                                                parseFloat(manualValue) *
                                                  rateValue,
                                              )}
                                            </p>
                                          )}
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Коментар (причина зміни)
                                        </label>
                                        <Textarea
                                          value={perWorkingDayState.description}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              description: e.target.value,
                                            })
                                          }
                                          placeholder="Вкажіть причину зміни автоначислення..."
                                          rows={2}
                                          className="mt-1"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={onSave}
                                          className="flex-1"
                                          disabled={
                                            manualValue === "" ||
                                            manualValue === null ||
                                            isNaN(parseFloat(manualValue)) ||
                                            parseFloat(manualValue) < 0
                                          }
                                        >
                                          Зберегти
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={onCancel}
                                        >
                                          Скасувати
                                        </Button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Сума (₴)
                                        </label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={manualValue}
                                          onChange={(e) =>
                                            onManualValueChange(e.target.value)
                                          }
                                          placeholder="0"
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">
                                          Коментар (причина зміни)
                                        </label>
                                        <Textarea
                                          value={perWorkingDayState.description}
                                          onChange={(e) =>
                                            onPerWorkingDayStateChange({
                                              ...perWorkingDayState,
                                              description: e.target.value,
                                            })
                                          }
                                          placeholder="Вкажіть причину зміни автоначислення..."
                                          rows={2}
                                          className="mt-1"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={onSave}
                                          className="flex-1"
                                          disabled={
                                            !manualValue ||
                                            isNaN(parseFloat(manualValue)) ||
                                            parseFloat(manualValue) < 0
                                          }
                                        >
                                          Зберегти
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={onCancel}
                                        >
                                          Скасувати
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={days.length + 1}
                  className="text-center text-muted-foreground py-4"
                >
                  Немає нарахувань по активностях за цей місяць
                </TableCell>
              </TableRow>
            )}

            {/* Payouts row - always visible */}
            <TableRow className="bg-muted/20 font-semibold">
              <TableCell className="font-semibold sticky left-0 bg-muted/20 z-10">
                Виплати
              </TableCell>
              {days.map((date) => {
                const dateStr = getDateString(date);
                const amount = payoutsByDate.amounts.get(dateStr) || 0;
                const notes = payoutsByDate.notes.get(dateStr) || [];
                const hasNotes = notes.length > 0;

                const cellContent =
                  amount > 0 ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-red-600 font-semibold">
                        {formatCurrency(amount)}
                      </span>
                      {auditMode && (
                        <Link
                          to={buildAuditLink("salary-expenses", dateStr)}
                          className="text-xs text-muted-foreground hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          журнал
                        </Link>
                      )}
                      {auditMode && (hasNotes || notes.length > 0) && (
                        <Tooltip>
                          <TooltipTrigger
                            className="text-xs text-muted-foreground"
                            onClick={(event) => event.stopPropagation()}
                          >
                            i
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1 text-xs">
                              {notes.map((item, idx) => (
                                <div key={`${item.date}-${idx}`}>
                                  <div>{formatCurrency(item.amount)}</div>
                                  {item.note && (
                                    <div className="text-muted-foreground">
                                      {item.note}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  );

                return (
                  <TableCell
                    key={dateStr}
                    className={cn(
                      "text-center cursor-pointer hover:bg-primary/10",
                      isWeekend(date) && WEEKEND_BG_COLOR,
                    )}
                    onClick={() => onPayoutCellClick(dateStr)}
                  >
                    {hasNotes ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>{cellContent}</div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-2">
                            <p className="font-semibold">Виплати:</p>
                            {notes.map((item, index) => (
                              <div
                                key={index}
                                className="space-y-0.5 border-b border-border/50 pb-1 last:border-0 last:pb-0"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs text-muted-foreground">
                                    {formatDate(item.date)}
                                  </p>
                                  <p className="text-sm font-semibold text-red-600">
                                    {formatCurrency(item.amount)}
                                  </p>
                                </div>
                                {item.note && (
                                  <p className="text-sm">{item.note}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      cellContent
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
