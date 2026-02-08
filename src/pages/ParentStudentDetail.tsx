import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { useStudent } from '@/hooks/useStudents';
import { useEnrollments } from '@/hooks/useEnrollments';
import { useActivities } from '@/hooks/useActivities';
import { useStudentAccountBalances } from '@/hooks/useFinanceTransactions';
import { StudentPaymentHistory } from '@/components/students/StudentPaymentHistory';
import { StudentActivityBalanceRow } from '@/components/students/StudentActivityBalanceRow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { isGardenAttendanceController, type GardenAttendanceConfig } from '@/lib/gardenAttendance';
import { useAuth } from '@/context/AuthContext';
import { useParentStudents } from '@/hooks/useParentPortal';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

export default function ParentStudentDetail() {
  const { id } = useParams<{ id: string }>();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const { profile } = useAuth();
  const { data: parentStudents = [], isLoading: parentStudentsLoading } = useParentStudents(profile?.id);

  const { data: student, isLoading: studentLoading } = useStudent(id!);
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useEnrollments({ studentId: id, activeOnly: false });
  const { data: allActivities = [] } = useActivities();
  const { data: accounts = [] } = usePaymentAccounts();

  const controllerActivityIds = useMemo(() => (
    allActivities.filter(isGardenAttendanceController).map(activity => activity.id)
  ), [allActivities]);

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

  const { data: accountBalances = [], isLoading: balancesLoading } = useStudentAccountBalances(
    id!,
    month,
    year,
    controllerActivityIds,
    Array.from(foodTariffIds)
  );

  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((account) => map.set(account.id, account.name));
    return map;
  }, [accounts]);

  const accountDetailsMap = useMemo(() => {
    const map = new Map<string, string | null>();
    accounts.forEach((account) => map.set(account.id, account.details));
    return map;
  }, [accounts]);

  const activeEnrollments = useMemo(() => (
    enrollments.filter(enrollment => enrollment.is_active)
      .filter((enrollment) => {
        const activity = allActivities.find(a => a.id === enrollment.activity_id);
        return activity ? !isGardenAttendanceController(activity) : true;
      })
  ), [enrollments, allActivities]);

  const balanceEnrollments = useMemo(() => (
    enrollments.filter((enrollment) => {
      const activity = allActivities.find(a => a.id === enrollment.activity_id);
      return activity ? !isGardenAttendanceController(activity) && !foodTariffIds.has(enrollment.activity_id) : true;
    })
  ), [enrollments, allActivities, foodTariffIds]);

  const accountBalanceMap = useMemo(() => {
    const map = new Map();
    accountBalances.forEach((item) => {
      map.set(item.account_id || 'none', item);
    });
    return map;
  }, [accountBalances]);

  const accountGroups = useMemo(() => {
    const groups = new Map<string, { id: string; label: string; enrollments: typeof balanceEnrollments }>();
    
    balanceEnrollments.forEach((enrollment) => {
      const accountId = enrollment.account_id || 'none';
      if (!groups.has(accountId)) {
        const accountLabel = accountId !== 'none' ? (accountNameMap.get(accountId) || 'Без рахунку') : 'Без рахунку';
        groups.set(accountId, { id: accountId, label: accountLabel, enrollments: [] });
      }
      groups.get(accountId)!.enrollments.push(enrollment);
    });
    
    return Array.from(groups.values()).sort((a, b) => {
      const aIsNone = a.id === 'none';
      const bIsNone = b.id === 'none';
      if (aIsNone !== bIsNone) return aIsNone ? 1 : -1;
      return a.label.localeCompare(b.label, 'uk-UA');
    });
  }, [balanceEnrollments, accountNameMap]);

  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

  const totalBalance = useMemo(() => 
    accountBalances.reduce((sum, item) => sum + (item.balance || 0), 0),
    [accountBalances]
  );

  const hasAccess = useMemo(() => 
    parentStudents.some((s) => s.id === id),
    [parentStudents, id]
  );

  if (studentLoading || enrollmentsLoading || parentStudentsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-muted-foreground">Доступ заборонено</p>
        <Button variant="link" asChild>
          <Link to="/parent">Повернутися</Link>
        </Button>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-muted-foreground">Дитину не знайдено</p>
        <Button variant="link" asChild>
          <Link to="/parent">Повернутися</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={student.full_name}
        actions={(
          <Button variant="outline" asChild>
            <Link to="/parent">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Link>
          </Button>
        )}
      />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h3 className="text-lg font-semibold">Баланс</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={month.toString()} onValueChange={(value) => setMonth(parseInt(value))}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((label, idx) => (
                    <SelectItem key={idx} value={idx.toString()}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-full sm:w-24"
              />
            </div>
          </div>
          {balancesLoading ? (
            <div className="text-sm text-muted-foreground">Завантаження...</div>
          ) : accountGroups.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Немає рядків за вибраний період
            </div>
          ) : (
            <div className="space-y-4">
              {accountGroups.map((group) => {
                const accountBalance = accountBalanceMap.get(group.id);
                const previousBalance = accountBalance?.previous_balance || 0;
                const charges = accountBalance?.charges || 0;
                const payments = accountBalance?.payments || 0;
                const refunds = accountBalance?.refunds || 0;
                const endBalance = previousBalance + payments - charges + refunds;
                const startLabel = previousBalance < 0
                  ? 'Борг на початок'
                  : previousBalance > 0
                    ? 'Залишок на початок'
                    : 'Баланс на початок';
                const accountDetails = group.id !== 'none' ? accountDetailsMap.get(group.id) : null;
                const hasDetails = accountDetails && accountDetails.trim().length > 0;
                const isExpanded = expandedAccountId === group.id;
                
                return (
                  <div key={group.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="text-sm font-semibold">{group.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {MONTHS[month]} {year}
                      </div>
                    </div>

                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{startLabel}</span>
                        <span
                          className={cn(
                            "font-semibold",
                            previousBalance < 0
                              ? "text-destructive"
                              : previousBalance > 0
                                ? "text-success"
                                : "text-muted-foreground"
                          )}
                        >
                          {previousBalance > 0 ? '+' : ''}{formatCurrency(Math.abs(previousBalance))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Нараховано за місяць</span>
                        <span className="font-medium">{formatCurrency(charges)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Оплачено за місяць</span>
                        <span className="font-medium">{formatCurrency(payments)}</span>
                      </div>
                      <div className="border-t border-border my-1"></div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Ітого</span>
                        {endBalance < 0 ? (
                          <span className="font-semibold text-destructive">
                            До сплати: {formatCurrency(Math.abs(endBalance))}
                          </span>
                        ) : endBalance > 0 ? (
                          <span className="font-semibold text-success">
                            Переплата: +{formatCurrency(endBalance)}
                          </span>
                        ) : (
                          <span className="font-semibold text-muted-foreground">
                            {formatCurrency(0)}
                          </span>
                        )}
                      </div>
                    </div>

                    {hasDetails && (
                      <div 
                        className={cn(
                          "cursor-pointer rounded-md border p-3 transition-colors hover:bg-muted/50 mb-3",
                          isExpanded && "bg-muted/30"
                        )}
                        onClick={() => setExpandedAccountId(isExpanded ? null : group.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-medium text-muted-foreground">
                            {isExpanded ? 'Приховати деталі оплати' : 'Показати деталі оплати'}
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t text-xs text-muted-foreground whitespace-pre-wrap">
                            {accountDetails}
                          </div>
                        )}
                      </div>
                    )}

                    {group.enrollments.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Немає активностей за вибраний період</div>
                    ) : (
                      <div className="space-y-3">
                        {group.enrollments.map((enrollment) => (
                          <StudentActivityBalanceRow
                            key={enrollment.id}
                            studentId={id!}
                            enrollment={enrollment}
                            month={month}
                            year={year}
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
          )}
        </div>

        <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft">
          <h3 className="text-lg font-semibold mb-4">Історія оплат</h3>
          <StudentPaymentHistory studentId={id!} month={month} year={year} />
        </div>

      </div>
    </>
  );
}
