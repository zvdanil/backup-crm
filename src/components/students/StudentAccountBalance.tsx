import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { isGardenAttendanceController } from '@/lib/gardenAttendance';
import { StudentActivityBalanceRow } from './StudentActivityBalanceRow';
import type { EnrollmentWithRelations } from '@/hooks/useEnrollments';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

interface StudentAccountBalanceProps {
  studentId: string;
  enrollments: EnrollmentWithRelations[];
  allActivities: any[];
  accounts: any[];
  accountBalances: any[];
  accountBalancesLoading: boolean;
  month: number;
  year: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
}

export function StudentAccountBalance({
  studentId,
  enrollments,
  allActivities,
  accounts,
  accountBalances,
  accountBalancesLoading,
  month,
  year,
  onMonthChange,
  onYearChange,
}: StudentAccountBalanceProps) {
  const balanceEnrollments = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const isFutureMonth = year > currentYear || (year === currentYear && month > currentMonth);
    
    return enrollments.filter((enrollment) => {
      const activity = allActivities.find(a => a.id === enrollment.activity_id);
      if (activity && isGardenAttendanceController(activity)) return false;
      
      // Фильтруем по месяцу архивации:
      // - Для будущих месяцев: только активные enrollments
      // - Для текущего/прошлого месяца: активные + архивные, которые были заархивированы в этом месяце
      if (isFutureMonth) {
        return enrollment.is_active === true;
      } else {
        if (enrollment.is_active === true) return true;
        // Архивные: показываем только если были заархивированы в этом месяце
        if (enrollment.is_active === false && enrollment.unenrolled_at) {
          const unenrolledDate = new Date(enrollment.unenrolled_at);
          const monthStart = new Date(year, month, 1);
          const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
          return unenrolledDate >= monthStart && unenrolledDate <= monthEnd;
        }
        return false;
      }
    });
  }, [enrollments, allActivities, month, year]);

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

  if (balanceEnrollments.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="text-lg font-semibold">Баланс по рахунках</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select
            value={month.toString()}
            onValueChange={(value) => onMonthChange(parseInt(value))}
          >
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((monthLabel, idx) => (
                <SelectItem key={idx} value={idx.toString()}>
                  {monthLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={year}
            onChange={(e) => onYearChange(parseInt(e.target.value))}
            className="w-full sm:w-24"
          />
        </div>
      </div>
      
      <div className="space-y-4">
        {accountBalancesLoading ? (
          <div className="text-sm text-muted-foreground">Завантаження...</div>
        ) : accountGroups.length === 0 ? (
          <div className="text-sm text-muted-foreground">Немає нарахувань</div>
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

                  {group.enrollments.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Немає рядків за вибраний період</div>
                  ) : (
                    <div className="space-y-3">
                      {group.enrollments.map((enrollment) => (
                        <StudentActivityBalanceRow
                          key={enrollment.id}
                          studentId={studentId}
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
    </div>
  );
}
