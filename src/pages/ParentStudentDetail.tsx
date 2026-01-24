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

  const activeEnrollments = useMemo(() => (
    enrollments.filter(enrollment => enrollment.is_active)
      .filter((enrollment) => {
        const activity = allActivities.find(a => a.id === enrollment.activity_id);
        return activity ? !isGardenAttendanceController(activity) : true;
      })
  ), [enrollments, allActivities]);

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
          <h3 className="text-lg font-semibold mb-4">Баланс</h3>
          {balancesLoading ? (
            <div className="text-sm text-muted-foreground">Завантаження...</div>
          ) : (
            <div className="space-y-3">
              <div className="text-2xl font-bold">
                <span className={cn(totalBalance >= 0 ? 'text-success' : 'text-destructive')}>
                  {totalBalance >= 0 ? '+' : ''}{formatCurrency(totalBalance)}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                {accountBalances.map((account) => {
                  const accountId = account.account_id || 'none';
                  const accountName = accountId !== 'none' ? (accountNameMap.get(accountId) || 'Без рахунку') : 'Без рахунку';
                  const accountDetails = accountId !== 'none' ? accountDetailsMap.get(accountId) : null;
                  const balance = account.balance || 0;
                  const isExpanded = expandedAccountId === accountId;
                  const hasDetails = accountDetails && accountDetails.trim().length > 0;

                  return (
                    <div key={accountId} className="border rounded-lg overflow-hidden">
                      <div 
                        className={cn(
                          "flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                          hasDetails && "cursor-pointer"
                        )}
                        onClick={() => hasDetails && setExpandedAccountId(isExpanded ? null : accountId)}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-muted-foreground">
                            {accountName}
                          </span>
                          {hasDetails && (
                            isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )
                          )}
                        </div>
                        <span className={cn(balance >= 0 ? 'text-success' : 'text-destructive', 'font-medium')}>
                          {balance >= 0 ? '+' : ''}{formatCurrency(balance)}
                        </span>
                      </div>
                      {isExpanded && hasDetails && (
                        <div className="px-3 pb-3 pt-2 border-t bg-muted/30">
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            Сума до оплати: <span className={cn(balance < 0 ? 'text-destructive font-semibold' : 'text-foreground')}>
                              {formatCurrency(Math.abs(balance))}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {accountDetails}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h3 className="text-lg font-semibold">Баланс по активностях</h3>
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
          <div className="space-y-3">
            {activeEnrollments.map((enrollment) => (
              <StudentActivityBalanceRow
                key={enrollment.id}
                studentId={id!}
                enrollment={enrollment}
                month={month}
                year={year}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft">
          <h3 className="text-lg font-semibold mb-4">Історія оплат</h3>
          <StudentPaymentHistory studentId={id!} month={month} year={year} />
        </div>

      </div>
    </>
  );
}
