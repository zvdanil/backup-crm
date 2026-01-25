import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Calendar, Phone, Mail, User, Pencil, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { StudentForm } from '@/components/students/StudentForm';
import { EnrollmentForm } from '@/components/enrollments/EnrollmentForm';
import { EditEnrollmentForm } from '@/components/enrollments/EditEnrollmentForm';
import { TransactionForm } from '@/components/finance/TransactionForm';
import { useStudent, useUpdateStudent } from '@/hooks/useStudents';
import { useEnrollments, useCreateEnrollment, useUnenrollStudent, useUpdateEnrollment, type EnrollmentWithRelations } from '@/hooks/useEnrollments';
import { useCreateFinanceTransaction, useStudentAccountBalances, useStudentTotalBalance } from '@/hooks/useFinanceTransactions';
import { formatCurrency, formatDate } from '@/lib/attendance';
import { StudentActivityBalanceRow } from '@/components/students/StudentActivityBalanceRow';
import { StudentPaymentHistory } from '@/components/students/StudentPaymentHistory';
import { EnrollmentPriceDisplay } from '@/components/enrollments/EnrollmentPriceDisplay';
import { cn } from '@/lib/utils';
import { useActivities } from '@/hooks/useActivities';
import { isGardenAttendanceController, type GardenAttendanceConfig } from '@/lib/gardenAttendance';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useParentLinks, useAddParentLink, useRemoveParentLink } from '@/hooks/useParentLinks';
import { useUserProfiles } from '@/hooks/useUserProfiles';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
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
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const now = new Date();
  const [enrollFormOpen, setEnrollFormOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [transactionFormOpen, setTransactionFormOpen] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<EnrollmentWithRelations | null>(null);
  const [unenrollingId, setUnenrollingId] = useState<string | null>(null);
  const [balanceMonth, setBalanceMonth] = useState(now.getMonth());
  const [balanceYear, setBalanceYear] = useState(now.getFullYear());
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const [selectedParentId, setSelectedParentId] = useState<string>('none');

  const { data: student, isLoading: studentLoading } = useStudent(id!);
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useEnrollments({ 
    studentId: id,
    activeOnly: false 
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
    allActivities.forEach(activity => {
      if (isGardenAttendanceController(activity)) {
        const config = (activity.config as GardenAttendanceConfig) || {};
        (config.food_tariff_ids || []).forEach(id => ids.add(id));
      }
    });
    return ids;
  }, [allActivities]);

  const controllerActivityIds = useMemo(() => (
    allActivities.filter(isGardenAttendanceController).map(activity => activity.id)
  ), [allActivities]);

  const { data: accountBalances = [], isLoading: accountBalancesLoading } = useStudentAccountBalances(
    id!,
    balanceMonth,
    balanceYear,
    controllerActivityIds,
    Array.from(foodTariffIds)
  );

  // Filter active/past enrollments
  // В карточке ребёнка показываем ВСЕ активности, включая управляющую
  const activeEnrollments = useMemo(() => {
    return enrollments.filter(e => e.is_active);
  }, [enrollments]);
  
  const pastEnrollments = useMemo(() => {
    // В карточке ребёнка показываем все архивные активности, включая управляющую
    return enrollments.filter(e => !e.is_active);
  }, [enrollments]);

  const balanceEnrollments = useMemo(() => (
    enrollments.filter((enrollment) => {
      const activity = allActivities.find(a => a.id === enrollment.activity_id);
      return activity ? !isGardenAttendanceController(activity) : true;
    })
  ), [enrollments, allActivities]);

  const accountLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((account) => map.set(account.id, account.name));
    return map;
  }, [accounts]);

  const accountBalanceMap = useMemo(() => {
    const map = new Map<string, typeof accountBalances[number]>();
    accountBalances.forEach((balance) => {
      map.set(balance.account_id || 'none', balance);
    });
    return map;
  }, [accountBalances]);

  const parentOptions = useMemo(() => {
    const linkedIds = new Set(parentLinks.map((link) => link.parent_id));
    return userProfiles
      .filter((profile) => profile.role === 'parent' && !linkedIds.has(profile.id))
      .map((profile) => ({
        id: profile.id,
        label: profile.full_name || profile.id,
      }));
  }, [parentLinks, userProfiles]);

  const accountGroups = useMemo(() => {
    const groups = new Map<string, { id: string; label: string; enrollments: EnrollmentWithRelations[] }>();
    balanceEnrollments.forEach((enrollment) => {
      // Приоритет: enrollment.account_id ?? activity.account_id
      const accountId = enrollment.account_id || enrollment.activities.account_id || 'none';
      const label = accountId === 'none'
        ? 'Без рахунку'
        : (accountLabelMap.get(accountId) || 'Без рахунку');
      if (!groups.has(accountId)) {
        groups.set(accountId, { id: accountId, label, enrollments: [] });
      }
      groups.get(accountId)!.enrollments.push(enrollment);
    });
    accountBalances.forEach((balance) => {
      const accountId = balance.account_id || 'none';
      if (!groups.has(accountId)) {
        const label = accountId === 'none'
          ? 'Без рахунку'
          : (accountLabelMap.get(accountId) || 'Без рахунку');
        groups.set(accountId, { id: accountId, label, enrollments: [] });
      }
    });
    return Array.from(groups.values()).sort((a, b) => {
      const aIsNone = a.id === 'none';
      const bIsNone = b.id === 'none';
      if (aIsNone !== bIsNone) return aIsNone ? 1 : -1;
      return a.label.localeCompare(b.label, 'uk-UA');
    });
  }, [balanceEnrollments, accountLabelMap, accountBalances]);

  const handleEnroll = async (data: { activity_id: string; custom_price: number | null; discount_percent: number; account_id: string | null }) => {
    // Используем mutateAsync для ожидания завершения мутации
    await createEnrollment.mutateAsync({
      student_id: id!,
      activity_id: data.activity_id,
      custom_price: data.custom_price,
      discount_percent: data.discount_percent,
      account_id: data.account_id,
    });
  };

  const handleUpdateEnrollment = async (data: { custom_price: number | null; discount_percent: number; effective_from: string | null; account_id: string | null }) => {
    if (editingEnrollment) {
      const oldAccountId = editingEnrollment.account_id;
      const newAccountId = data.account_id;
      
      // Обновляем enrollment
      await updateEnrollment.mutateAsync({
        id: editingEnrollment.id,
        custom_price: data.custom_price,
        discount_percent: data.discount_percent,
        effective_from: data.effective_from,
        account_id: newAccountId,
      });
      
      // Если изменился account_id, пересчитываем finance_transactions
      if (oldAccountId !== newAccountId) {
        // Находим все finance_transactions, связанные с этим enrollment
        const { data: transactions, error: transactionsError } = await supabase
          .from('finance_transactions')
          .select('id, account_id')
          .eq('student_id', editingEnrollment.student_id)
          .eq('activity_id', editingEnrollment.activity_id)
          .eq('type', 'income'); // Только начисления (income)
        
        if (!transactionsError && transactions) {
          // Определяем правильный account_id для обновления
          // Используем приоритет: enrollment.account_id ?? activity.account_id
          const targetAccountId = newAccountId || editingEnrollment.activities.account_id;
          
          // Обновляем account_id во всех связанных транзакциях
          if (transactions.length > 0) {
            const transactionIds = transactions.map(t => t.id);
            await supabase
              .from('finance_transactions')
              .update({ account_id: targetAccountId })
              .in('id', transactionIds);
          }
        }
      }
      
      setEditingEnrollment(null);
    }
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
        <div className="grid gap-4 sm:gap-8 lg:grid-cols-3">
          {/* Student Info */}
          <div className="lg:col-span-1">
            <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft min-w-0 overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold break-words leading-tight">{student.full_name}</h2>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      student.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                    }`}>
                      {student.status === 'active' ? 'Активний' : student.status}
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
                    <span className="break-words">Дата народження: {formatDate(student.birth_date)}</span>
                  </div>
                )}
                
                {student.guardian_name && (
                  <div className="pt-4 border-t">
                    <p className="font-medium text-muted-foreground mb-2">Опікун</p>
                    <p className="font-medium">{student.guardian_name}</p>
                  </div>
                )}
                
                {student.guardian_phone && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="break-words">{student.guardian_phone}</span>
                  </div>
                )}
                
                {student.guardian_email && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="break-words">{student.guardian_email}</span>
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

            {/* Balance Summary */}
            <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft mt-6">
              <h3 className="text-lg font-semibold mb-4">Баланс</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground mb-2">За місяць</p>
                  <StudentBalanceDisplay
                    studentId={id!}
                    month={balanceMonth}
                    year={balanceYear}
                    excludeActivityIds={controllerActivityIds}
                    foodTariffIds={Array.from(foodTariffIds)}
                  />
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground mb-2">Загальний баланс</p>
                  <StudentBalanceDisplay
                    studentId={id!}
                    excludeActivityIds={controllerActivityIds}
                    foodTariffIds={Array.from(foodTariffIds)}
                  />
                </div>
              </div>
            </div>

            {/* Payment History */}
            <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft mt-6">
              <h3 className="text-lg font-semibold mb-4">Історія оплат</h3>
              <StudentPaymentHistory 
                studentId={id!}
                month={balanceMonth}
                year={balanceYear}
              />
            </div>

            {(role === 'owner' || role === 'admin') && (
              <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft mt-6">
                <h3 className="text-lg font-semibold mb-4">Доступ для батьків</h3>
                <div className="space-y-3">
                  {parentLinks.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Немає привʼязаних батьків</div>
                  ) : (
                    <div className="space-y-2">
                      {parentLinks.map((link) => (
                        <div key={link.id} className="flex items-center justify-between text-sm border rounded-md p-2">
                          <span className="font-medium">{link.user_profiles?.full_name || link.parent_id}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeParentLink.mutate({ linkId: link.id, student_id: id! })}
                          >
                            Видалити
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <Select value={selectedParentId} onValueChange={setSelectedParentId}>
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
                        if (selectedParentId === 'none') return;
                        addParentLink.mutate({ parent_id: selectedParentId, student_id: id! });
                        setSelectedParentId('none');
                      }}
                      disabled={selectedParentId === 'none'}
                    >
                      Додати
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Balance by activities */}
            {balanceEnrollments.length > 0 && (
              <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft mt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h3 className="text-lg font-semibold">Баланс по рахунках</h3>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select
                      value={balanceMonth.toString()}
                      onValueChange={(value) => setBalanceMonth(parseInt(value))}
                    >
                      <SelectTrigger className="w-full sm:w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((month, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {month}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={balanceYear}
                      onChange={(e) => setBalanceYear(parseInt(e.target.value))}
                      className="w-full sm:w-24"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium">Баланс по рахунках</div>
                      <div className="text-xs text-muted-foreground">
                        {MONTHS[balanceMonth]} {balanceYear}
                      </div>
                    </div>
                    {accountBalancesLoading ? (
                      <div className="text-sm text-muted-foreground">Завантаження...</div>
                    ) : accountGroups.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Немає нарахувань</div>
                    ) : (
                      <div className="space-y-2">
                        {accountGroups.map((group) => {
                          const accountBalance = accountBalanceMap.get(group.id);
                          const amount = accountBalance?.balance || 0;
                          return (
                            <div key={group.id} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{group.label}</span>
                              <span className={cn(
                                "font-semibold",
                                amount >= 0 ? "text-success" : "text-destructive"
                              )}>
                                {amount >= 0 ? '+' : ''}{formatCurrency(amount)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    {accountGroups.map((group) => {
                      const accountBalance = accountBalanceMap.get(group.id);
                      const amount = accountBalance?.balance || 0;
                      return (
                        <div key={group.id} className="rounded-lg border border-border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <div className="text-sm font-semibold">{group.label}</div>
                            <div className={cn(
                              "text-sm font-semibold",
                              amount >= 0 ? "text-success" : "text-destructive"
                            )}>
                              {amount >= 0 ? '+' : ''}{formatCurrency(amount)}
                            </div>
                          </div>
                          {group.enrollments.length === 0 ? (
                            <div className="text-sm text-muted-foreground">Немає рядків за вибраний період</div>
                          ) : (
                            <div className="space-y-3">
                              {group.enrollments.map((enrollment) => (
                                <StudentActivityBalanceRow
                                  key={enrollment.id}
                                  studentId={id!}
                                  enrollment={enrollment}
                                  month={balanceMonth}
                                  year={balanceYear}
                                />
                              ))}
                            </div>
                          )}
                          {group.id === 'none' && (accountBalanceMap.get('none')?.unassigned_payments || 0) > 0 && (
                            <div className="mt-3 rounded-md border border-dashed border-muted-foreground/40 p-3">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Оплата без активності</span>
                                <span className="font-semibold text-success">
                                  +{formatCurrency(accountBalanceMap.get('none')?.unassigned_payments || 0)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Enrollments */}
          <div className="lg:col-span-2">
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
                  <Button variant="link" onClick={() => setEnrollFormOpen(true)}>
                    Записати на активність
                  </Button>
                </div>
              ) : isMobile ? (
                <div className="space-y-3 p-4">
                  {activeEnrollments.map((enrollment) => {
                    if (!enrollment.activities) return null;
                    const isFoodActivity = foodTariffIds.has(enrollment.activity_id);
                    return (
                      <div key={enrollment.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: enrollment.activities.color }}
                              />
                              <span className="text-sm font-medium break-words">
                                {isFoodActivity ? `+ ${enrollment.activities.name}` : enrollment.activities.name}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(enrollment.enrolled_at)}
                            </div>
                            <div className="mt-2 text-sm">
                              <EnrollmentPriceDisplay enrollment={enrollment} />
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Знижка: {(enrollment.discount_percent ?? 0) > 0 ? `${enrollment.discount_percent}%` : '—'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingEnrollment(enrollment)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setUnenrollingId(enrollment.id)}
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
                      const isFoodActivity = foodTariffIds.has(enrollment.activity_id);
                      return (
                      <TableRow key={enrollment.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: enrollment.activities.color }}
                            />
                            {isFoodActivity ? `+ ${enrollment.activities.name}` : enrollment.activities.name}
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
                            : '—'
                          }
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(enrollment.enrolled_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => setEditingEnrollment(enrollment)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => setUnenrollingId(enrollment.id)}
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
                        const isFoodActivity = foodTariffIds.has(enrollment.activity_id);
                        return (
                        <TableRow key={enrollment.id} className="opacity-60">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: enrollment.activities.color }}
                              />
                              {isFoodActivity ? `+ ${enrollment.activities.name}` : enrollment.activities.name}
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
                              : '—'
                            }
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {enrollment.unenrolled_at && formatDate(enrollment.unenrolled_at)}
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
        </div>
      </div>

      <StudentForm
        open={editProfileOpen}
        onOpenChange={setEditProfileOpen}
        onSubmit={handleUpdateProfile}
        initialData={student}
        isLoading={updateStudent.isPending}
      />

      <EnrollmentForm
        open={enrollFormOpen}
        onOpenChange={setEnrollFormOpen}
        onSubmit={handleEnroll}
        studentName={student.full_name}
        isLoading={createEnrollment.isPending}
        excludeActivityIds={activeEnrollments.map(e => e.activity_id)}
      />

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
      />

      {editingEnrollment && (
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
        />
      )}

      <AlertDialog open={!!unenrollingId} onOpenChange={() => setUnenrollingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Відписати від активності?</AlertDialogTitle>
            <AlertDialogDescription>
              Дитину буде відписано, але історія відвідуваності збережеться для розрахунку балансу.
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
    </>
  );
}

// Component to display student balance
function StudentBalanceDisplay({ 
  studentId, 
  month, 
  year,
  excludeActivityIds = [],
  foodTariffIds = []
}: { 
  studentId: string; 
  month?: number; 
  year?: number;
  excludeActivityIds?: string[];
  foodTariffIds?: string[];
}) {
  const { data: accountBalances, isLoading } = useStudentAccountBalances(
    studentId,
    month,
    year,
    excludeActivityIds,
    foodTariffIds
  );

  if (isLoading) {
    return <span className="text-sm text-muted-foreground">Завантаження...</span>;
  }

  const balance = accountBalances?.reduce((sum, item) => sum + (item.balance || 0), 0) || 0;

  return (
    <p className={cn(
      "text-2xl font-bold",
      balance >= 0 ? "text-success" : "text-destructive"
    )}>
      {balance > 0 ? '+' : ''}{formatCurrency(balance)}
    </p>
  );
}
