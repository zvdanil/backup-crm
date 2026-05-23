import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Calendar,
  Phone,
  Mail,
  User,
  Pencil,
  BadgeDollarSign,
  Wallet,
  History,
  Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentForm } from "@/components/students/StudentForm";
import { EnrollmentForm } from "@/components/enrollments/EnrollmentForm";
import { EditEnrollmentForm } from "@/components/enrollments/EditEnrollmentForm";
import { TransactionForm } from "@/components/finance/TransactionForm";
import { useStudent, useUpdateStudent } from "@/hooks/useStudents";
import {
  useEnrollments,
  useCreateEnrollment,
  useUnenrollStudent,
  useUpdateEnrollment,
  useEnrollmentAccountHistory,
  getEnrollmentAccountForDate,
  type EnrollmentWithRelations,
} from "@/hooks/useEnrollments";
import { EnrollmentPriceHistoryDialog } from "@/components/enrollments/EnrollmentPriceHistoryDialog";
import { EnrollmentAccountHistoryDialog } from "@/components/enrollments/EnrollmentAccountHistoryDialog";
import {
  useCreateFinanceTransaction,
  useStudentAccountBalances,
  useStudentTotalBalance,
} from "@/hooks/useFinanceTransactions";
import { formatCurrency, formatDate, formatLocalDate } from "@/lib/attendance";
import { StudentActivityBalanceRow } from "@/components/students/StudentActivityBalanceRow";
import { StudentPaymentHistory } from "@/components/students/StudentPaymentHistory";
import { StudentAccountBalance } from "@/components/students/StudentAccountBalance";
import { EnrollmentPriceDisplay } from "@/components/enrollments/EnrollmentPriceDisplay";
import { ChangeEnrollmentPriceDialog } from "@/components/enrollments/ChangeEnrollmentPriceDialog";
import { cn } from "@/lib/utils";
import { useActivities } from "@/hooks/useActivities";
import {
  isGardenAttendanceController,
  type GardenAttendanceConfig,
} from "@/lib/gardenAttendance";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePaymentAccounts } from "@/hooks/usePaymentAccounts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import {
  useParentLinks,
  useAddParentLink,
  useRemoveParentLink,
} from "@/hooks/useParentLinks";
import { useUserProfiles } from "@/hooks/useUserProfiles";

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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const now = new Date();
  const [enrollFormOpen, setEnrollFormOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [transactionFormOpen, setTransactionFormOpen] = useState(false);
  const [editingEnrollment, setEditingEnrollment] =
    useState<EnrollmentWithRelations | null>(null);
  const [unenrollingId, setUnenrollingId] = useState<string | null>(null);
  const [priceHistoryEnrollmentId, setPriceHistoryEnrollmentId] = useState<string | null>(null);
  const [accountHistoryEnrollmentId, setAccountHistoryEnrollmentId] = useState<string | null>(null);
  const [changePriceEnrollment, setChangePriceEnrollment] =
    useState<EnrollmentWithRelations | null>(null);
  const [balanceMonth, setBalanceMonth] = useState(now.getMonth());
  const [balanceYear, setBalanceYear] = useState(now.getFullYear());
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const [selectedParentId, setSelectedParentId] = useState<string>("none");

  const { data: student, isLoading: studentLoading } = useStudent(id!);
  const { data: editingEnrollmentAccountHistory = [] } =
    useEnrollmentAccountHistory(editingEnrollment?.id || "");
  const oldAccountForEditing = useMemo(() => {
    if (!editingEnrollment) return null;
    const todayStr = formatLocalDate(new Date());
    const currentAccountId = getEnrollmentAccountForDate(
      editingEnrollment,
      editingEnrollmentAccountHistory,
      todayStr,
    );
    if (!currentAccountId) return null;
    return accounts.find((a) => a.id === currentAccountId) ?? null;
  }, [editingEnrollment, editingEnrollmentAccountHistory, accounts]);
  const { data: enrollments = [], isLoading: enrollmentsLoading } =
    useEnrollments({
      studentId: id,
      activeOnly: false,
    });
  const { data: allActivities = [] } = useActivities();
  const { data: accounts = [] } = usePaymentAccounts();
  const { data: userProfiles = [] } = useUserProfiles();
  const { data: parentLinks = [] } = useParentLinks(id);
  const addParentLink = useAddParentLink();
  const removeParentLink = useRemoveParentLink();
  const createEnrollment = useCreateEnrollment();
  const updateStudent = useUpdateStudent();
  const updateEnrollment = useUpdateEnrollment();
  const unenrollStudent = useUnenrollStudent();
  const createTransaction = useCreateFinanceTransaction();

  // Get food tariff IDs from controller activities
  const foodTariffIds = useMemo(() => {
    const ids = new Set<string>();
    allActivities.forEach((activity) => {
      if (isGardenAttendanceController(activity)) {
        const config = (activity.config as GardenAttendanceConfig) || {};
        (config.food_tariff_ids || []).forEach((id) => ids.add(id));
      }
    });
    return ids;
  }, [allActivities]);

  const controllerActivityIds = useMemo(
    () =>
      allActivities
        .filter(isGardenAttendanceController)
        .map((activity) => activity.id),
    [allActivities],
  );

  const { data: accountBalances = [], isLoading: accountBalancesLoading } =
    useStudentAccountBalances(
      id!,
      balanceMonth,
      balanceYear,
      controllerActivityIds,
      Array.from(foodTariffIds),
    );

  const allocationAccountIds = useMemo(
    () =>
      [...new Set((accountBalances || []).map((b: any) => b.account_id).filter(Boolean))] as string[],
    [accountBalances],
  );

  // Filter active/past enrollments
  // В карточке ребёнка показываем ВСЕ активности, включая управляющую
  const activeEnrollments = useMemo(() => {
    return enrollments.filter((e) => e.is_active);
  }, [enrollments]);

  const pastEnrollments = useMemo(() => {
    // В карточке ребёнка показываем все архивные активности, включая управляющую
    return enrollments.filter((e) => !e.is_active);
  }, [enrollments]);

  const parentOptions = useMemo(() => {
    const linkedIds = new Set(parentLinks.map((link) => link.parent_id));
    return userProfiles
      .filter(
        (profile) => profile.role === "parent" && !linkedIds.has(profile.id),
      )
      .map((profile) => ({
        id: profile.id,
        label: profile.full_name || profile.id,
      }));
  }, [parentLinks, userProfiles]);

  const handleEnroll = async (data: {
    activity_id: string;
    custom_price: number | null;
    discount_percent: number;
    account_id: string | null;
  }) => {
    // Используем mutateAsync для ожидания завершения мутации
    await createEnrollment.mutateAsync({
      student_id: id!,
      activity_id: data.activity_id,
      custom_price: data.custom_price,
      discount_percent: data.discount_percent,
      account_id: data.account_id,
    });
  };

  const handleUpdateEnrollment = async (data: {
    custom_price: number | null;
    discount_percent: number;
    effective_from: string | null;
    account_id: string | null;
    backfill_old_account: boolean;
  }): Promise<boolean> => {
    if (editingEnrollment) {
      const newAccountId = data.account_id;
      const effectiveFrom = data.effective_from || new Date().toISOString().slice(0, 10);

      if (newAccountId !== editingEnrollment.account_id) {
        const covering = editingEnrollmentAccountHistory.find((row: any) => {
          const fromDate = row.effective_from;
          const toDate = row.effective_to;
          if (effectiveFrom < fromDate) return false;
          if (toDate && effectiveFrom >= toDate) return false;
          return true;
        });

        if (covering && (covering.account_id ?? null) !== (newAccountId ?? null)) {
          const confirmed = window.confirm(
            "На вибрану дату вже є інша прив’язка рахунку. Якщо продовжити, усі нарахування в цьому періоді будуть перенесені на новий рахунок. Продовжити?",
          );
          if (!confirmed) return false;
        }
      }

      await updateEnrollment.mutateAsync({
        id: editingEnrollment.id,
        custom_price: data.custom_price,
        discount_percent: data.discount_percent,
        effective_from: effectiveFrom,
        account_id: newAccountId,
        refresh_student_id: id!,
        backfill_old_account: data.backfill_old_account,
      });

      setEditingEnrollment(null);
      return true;
    }
    return false;
  };

  const handleChangeEnrollmentPrice = async (data: {
    custom_price: number | null;
    discount_percent: number;
    effective_from: string;
    apply_mode: "future" | "recalc_range";
    recalc_from?: string;
    recalc_to?: string;
  }) => {
    if (!changePriceEnrollment) return;

    await updateEnrollment.mutateAsync({
      id: changePriceEnrollment.id,
      custom_price: data.custom_price,
      discount_percent: data.discount_percent,
      effective_from: data.effective_from,
      refresh_student_id: id!,
      recalc_from:
        data.apply_mode === "recalc_range" ? data.recalc_from : undefined,
      recalc_to:
        data.apply_mode === "recalc_range" ? data.recalc_to : undefined,
    });

    setChangePriceEnrollment(null);
  };

  const handleUpdateProfile = (data: any) => {
    updateStudent.mutate({ id: id!, ...data });
  };

  const handleUnenroll = () => {
    if (unenrollingId) {
      unenrollStudent.mutate(unenrollingId);
      setUnenrollingId(null);
    }
  };

  if (studentLoading || enrollmentsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-muted-foreground">Дитину не знайдено</p>
        <Button variant="link" asChild>
          <Link to="/students">Повернутися до списку</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={student.full_name}
        actions={
          <Button variant="outline" asChild>
            <Link to="/students">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Link>
          </Button>
        }
      />

      <div className="p-4 sm:p-8 overflow-x-hidden">
        <div className="grid gap-4 sm:gap-8 lg:grid-cols-5">
          {/* Student Info */}
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft min-w-0 overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold break-words leading-tight">
                      {student.full_name}
                    </h2>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        student.status === "active"
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {student.status === "active"
                        ? "Активний"
                        : student.status}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditProfileOpen(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4 text-sm">
                {student.birth_date && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="break-words">
                      Дата народження: {formatDate(student.birth_date)}
                    </span>
                  </div>
                )}

                {student.guardian_name && (
                  <div className="pt-4 border-t">
                    <p className="font-medium text-muted-foreground mb-2">
                      Опікун
                    </p>
                    <p className="font-medium">{student.guardian_name}</p>
                  </div>
                )}

                {student.guardian_phone && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="break-words">
                      {student.guardian_phone}
                    </span>
                  </div>
                )}

                {student.guardian_email && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="break-words">
                      {student.guardian_email}
                    </span>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <Button
                    className="w-full max-w-full whitespace-normal text-center leading-tight text-sm sm:text-base"
                    onClick={() => setTransactionFormOpen(true)}
                  >
                    <Wallet className="h-4 w-4 mr-2" />
                    Внести оплату
                  </Button>
                </div>
              </div>
            </div>

            {/* Parent Access - moved to top */}
            {(role === "owner" || role === "admin") && (
              <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft mt-6">
                <h3 className="text-lg font-semibold mb-4">
                  Доступ для батьків
                </h3>
                <div className="space-y-3">
                  {parentLinks.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Немає привʼязаних батьків
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {parentLinks.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center justify-between text-sm border rounded-md p-2"
                        >
                          <span className="font-medium">
                            {link.user_profiles?.full_name || link.parent_id}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              removeParentLink.mutate({
                                linkId: link.id,
                                student_id: id!,
                              })
                            }
                          >
                            Видалити
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <Select
                      value={selectedParentId}
                      onValueChange={setSelectedParentId}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Обрати батьківський акаунт" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не вибрано</SelectItem>
                        {parentOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => {
                        if (selectedParentId === "none") return;
                        addParentLink.mutate({
                          parent_id: selectedParentId,
                          student_id: id!,
                        });
                        setSelectedParentId("none");
                      }}
                      disabled={selectedParentId === "none"}
                    >
                      Додати
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Payment History */}
            <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft mt-6">
              <StudentPaymentHistory
                studentId={id!}
                month={balanceMonth}
                year={balanceYear}
                title="Історія оплат"
                excludeActivityIds={controllerActivityIds}
                accountIds={allocationAccountIds.length > 0 ? allocationAccountIds : undefined}
              />
            </div>

            {/* Balance by activities */}
            <StudentAccountBalance
              studentId={id!}
              enrollments={enrollments}
              allActivities={allActivities}
              accounts={accounts}
              accountBalances={accountBalances}
              accountBalancesLoading={accountBalancesLoading}
              month={balanceMonth}
              year={balanceYear}
              onMonthChange={setBalanceMonth}
              onYearChange={setBalanceYear}
            />
          </div>

          {/* Enrollments - Hidden for accountant */}
          {role !== "accountant" && (
            <div className="lg:col-span-3">
              <div className="rounded-xl bg-card border border-border shadow-soft">
                <div className="flex items-center justify-between p-4 sm:p-6 border-b">
                  <h3 className="text-lg font-semibold">Активності</h3>
                  <Button size="sm" onClick={() => setEnrollFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Записати
                  </Button>
                </div>

                {activeEnrollments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <p>Немає активних записів</p>
                    <Button
                      variant="link"
                      onClick={() => setEnrollFormOpen(true)}
                    >
                      Записати на активність
                    </Button>
                  </div>
                ) : isMobile ? (
                  <div className="space-y-3 p-4">
                    {activeEnrollments.map((enrollment) => {
                      if (!enrollment.activities) return null;
                      const isFoodActivity = foodTariffIds.has(
                        enrollment.activity_id,
                      );
                      return (
                        <div
                          key={enrollment.id}
                          className="rounded-lg border p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-full"
                                  style={{
                                    backgroundColor:
                                      enrollment.activities.color,
                                  }}
                                />
                                <span className="text-sm font-medium break-words">
                                  {isFoodActivity
                                    ? `+ ${enrollment.activities.name}`
                                    : enrollment.activities.name}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatDate(enrollment.effective_from ?? enrollment.enrolled_at)}
                              </div>
                              <div className="mt-2 text-sm">
                                <EnrollmentPriceDisplay
                                  enrollment={enrollment}
                                />
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Знижка:{" "}
                                {(enrollment.discount_percent ?? 0) > 0
                                  ? `${enrollment.discount_percent}%`
                                  : "—"}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingEnrollment(enrollment)}
                                title="Параметри нарахувань"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setChangePriceEnrollment(enrollment)}
                                title="Змінити ціну"
                              >
                                <BadgeDollarSign className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setPriceHistoryEnrollmentId(enrollment.id)
                                }
                                title="Історія зміни ціни"
                              >
                                <History className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setAccountHistoryEnrollmentId(enrollment.id)
                                }
                                title="Історія прив'язки до рахунку"
                              >
                                <Landmark className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setUnenrollingId(enrollment.id)}
                                title="Відписати"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[560px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Активність</TableHead>
                          <TableHead>Ціна</TableHead>
                          <TableHead>Знижка</TableHead>
                          <TableHead>Дата запису</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeEnrollments.map((enrollment) => {
                          if (!enrollment.activities) return null;
                          const isFoodActivity = foodTariffIds.has(
                            enrollment.activity_id,
                          );
                          return (
                            <TableRow key={enrollment.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-3 h-3 rounded-full"
                                    style={{
                                      backgroundColor:
                                        enrollment.activities.color,
                                    }}
                                  />
                                  {isFoodActivity
                                    ? `+ ${enrollment.activities.name}`
                                    : enrollment.activities.name}
                                </div>
                              </TableCell>
                              <TableCell>
                                <EnrollmentPriceDisplay
                                  enrollment={enrollment}
                                />
                              </TableCell>
                              <TableCell>
                                {(enrollment.discount_percent ?? 0) > 0
                                  ? `${enrollment.discount_percent}%`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatDate(enrollment.effective_from ?? enrollment.enrolled_at)}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setEditingEnrollment(enrollment)
                                    }
                                    title="Параметри нарахувань"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setChangePriceEnrollment(enrollment)
                                    }
                                    title="Змінити ціну"
                                  >
                                    <BadgeDollarSign className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setPriceHistoryEnrollmentId(enrollment.id)
                                    }
                                    title="Історія зміни ціни"
                                  >
                                    <History className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setAccountHistoryEnrollmentId(enrollment.id)
                                    }
                                    title="Історія прив'язки до рахунку"
                                  >
                                    <Landmark className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setUnenrollingId(enrollment.id)
                                    }
                                    title="Відписати"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {pastEnrollments.length > 0 && (
                  <>
                    <div className="px-6 py-3 bg-muted/30 text-sm font-medium text-muted-foreground">
                      Архів
                    </div>
                    <Table>
                      <TableBody>
                        {pastEnrollments.map((enrollment) => {
                          if (!enrollment.activities) return null;
                          const isFoodActivity = foodTariffIds.has(
                            enrollment.activity_id,
                          );
                          return (
                            <TableRow
                              key={enrollment.id}
                              className="opacity-60"
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-3 h-3 rounded-full"
                                    style={{
                                      backgroundColor:
                                        enrollment.activities.color,
                                    }}
                                  />
                                  {isFoodActivity
                                    ? `+ ${enrollment.activities.name}`
                                    : enrollment.activities.name}
                                </div>
                              </TableCell>
                              <TableCell>
                                <EnrollmentPriceDisplay
                                  enrollment={enrollment}
                                />
                              </TableCell>
                              <TableCell>
                                {(enrollment.discount_percent ?? 0) > 0
                                  ? `${enrollment.discount_percent}%`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {enrollment.unenrolled_at &&
                                  formatDate(enrollment.unenrolled_at)}
                              </TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <StudentForm
        open={editProfileOpen}
        onOpenChange={setEditProfileOpen}
        onSubmit={handleUpdateProfile}
        initialData={student}
        isLoading={updateStudent.isPending}
      />

      {role !== "accountant" && (
        <EnrollmentForm
          open={enrollFormOpen}
          onOpenChange={setEnrollFormOpen}
          onSubmit={handleEnroll}
          studentName={student.full_name}
          isLoading={createEnrollment.isPending}
          excludeActivityIds={activeEnrollments.map((e) => e.activity_id)}
        />
      )}

      <TransactionForm
        open={transactionFormOpen}
        onOpenChange={setTransactionFormOpen}
        onSubmit={(data) => {
          createTransaction.mutate({
            ...data,
            student_id: id!,
          });
        }}
        initialStudentId={id}
        isLoading={createTransaction.isPending}
        excludeActivityIds={controllerActivityIds}
      />

      {role !== "accountant" && editingEnrollment && (
        <EditEnrollmentForm
          open={!!editingEnrollment}
          onOpenChange={(open) => !open && setEditingEnrollment(null)}
          onSubmit={handleUpdateEnrollment}
          activityName={editingEnrollment.activities.name}
          initialCustomPrice={editingEnrollment.custom_price}
          initialDiscount={editingEnrollment.discount_percent}
          initialEffectiveFrom={editingEnrollment.effective_from}
          initialAccountId={editingEnrollment.account_id}
          isLoading={updateEnrollment.isPending}
          oldAccountId={oldAccountForEditing?.id ?? null}
          oldAccountName={oldAccountForEditing?.name ?? null}
        />
      )}

      {role !== "accountant" && changePriceEnrollment && (
        <ChangeEnrollmentPriceDialog
          open={!!changePriceEnrollment}
          onOpenChange={(open) => !open && setChangePriceEnrollment(null)}
          activityName={changePriceEnrollment.activities?.name || ""}
          initialCustomPrice={changePriceEnrollment.custom_price}
          initialDiscount={changePriceEnrollment.discount_percent}
          initialEffectiveFrom={changePriceEnrollment.effective_from}
          isLoading={updateEnrollment.isPending}
          onSubmit={handleChangeEnrollmentPrice}
        />
      )}

      {role !== "accountant" && (
        <AlertDialog
          open={!!unenrollingId}
          onOpenChange={() => setUnenrollingId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Відписати від активності?</AlertDialogTitle>
              <AlertDialogDescription>
                Дитину буде відписано, але історія відвідуваності збережеться
                для розрахунку балансу.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Скасувати</AlertDialogCancel>
              <AlertDialogAction onClick={handleUnenroll}>
                Відписати
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {priceHistoryEnrollmentId && (() => {
        const enrollment = enrollments.find(e => e.id === priceHistoryEnrollmentId);
        return enrollment ? (
          <EnrollmentPriceHistoryDialog
            open={!!priceHistoryEnrollmentId}
            onOpenChange={(open) => !open && setPriceHistoryEnrollmentId(null)}
            enrollmentId={priceHistoryEnrollmentId}
            activityName={enrollment.activities?.name || ''}
          />
        ) : null;
      })()}

      {accountHistoryEnrollmentId && (() => {
        const enrollment = enrollments.find(e => e.id === accountHistoryEnrollmentId);
        return enrollment ? (
          <EnrollmentAccountHistoryDialog
            open={!!accountHistoryEnrollmentId}
            onOpenChange={(open) => !open && setAccountHistoryEnrollmentId(null)}
            enrollmentId={accountHistoryEnrollmentId}
            activityName={enrollment.activities?.name || ''}
          />
        ) : null;
      })()}
    </>
  );
}

// Component to display student balance
function StudentBalanceDisplay({
  studentId,
  month,
  year,
  excludeActivityIds = [],
  foodTariffIds = [],
  cumulative = false,
}: {
  studentId: string;
  month?: number;
  year?: number;
  excludeActivityIds?: string[];
  foodTariffIds?: string[];
  cumulative?: boolean; // Если true, считает от начала до выбранного месяца включительно
}) {
  const { data: accountBalances, isLoading } = useStudentAccountBalances(
    studentId,
    month,
    year,
    excludeActivityIds,
    foodTariffIds,
    cumulative,
  );

  if (isLoading) {
    return (
      <span className="text-sm text-muted-foreground">Завантаження...</span>
    );
  }

  const balance =
    accountBalances?.reduce((sum, item) => sum + (item.balance || 0), 0) || 0;

  return (
    <p
      className={cn(
        "text-2xl font-bold",
        balance >= 0 ? "text-success" : "text-destructive",
      )}
    >
      {balance > 0 ? "+" : ""}
      {formatCurrency(balance)}
    </p>
  );
}
