import { useState, useMemo, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  useRealExpensesReport,
  getOperationLabel,
  type RealExpenseType,
} from '@/hooks/useRealExpensesReport';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import { formatCurrency } from '@/lib/attendance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { RefreshCw, TrendingDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const ALL_TYPES: { value: RealExpenseType; label: string }[] = [
  { value: 'expense', label: 'Витрата' },
  { value: 'salary', label: 'Зарплата' },
  { value: 'household', label: 'Госп. витрата' },
];

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

export default function RealExpensesReport() {
  const nowRef = useRef(new Date());

  const firstOfMonth = new Date(nowRef.current.getFullYear(), nowRef.current.getMonth(), 1);
  const lastOfMonth = new Date(nowRef.current.getFullYear(), nowRef.current.getMonth() + 1, 0);

  // Filter state (what the user is editing)
  const [filterStartDate, setFilterStartDate] = useState(toLocalDateString(firstOfMonth));
  const [filterEndDate, setFilterEndDate] = useState(toLocalDateString(lastOfMonth));
  const [filterAccountIds, setFilterAccountIds] = useState<string[]>([]);
  const [filterTypes, setFilterTypes] = useState<RealExpenseType[]>([]);
  const [filterShowCancelled, setFilterShowCancelled] = useState(true);

  // Report state (what was last used to fetch data)
  const [reportStartDate, setReportStartDate] = useState(toLocalDateString(firstOfMonth));
  const [reportEndDate, setReportEndDate] = useState(toLocalDateString(lastOfMonth));
  const [reportAccountIds, setReportAccountIds] = useState<string[]>([]);
  const [reportTypes, setReportTypes] = useState<RealExpenseType[]>([]);
  const [reportShowCancelled, setReportShowCancelled] = useState(true);
  const [reportRequested, setReportRequested] = useState(false);

  const { data: accounts = [] } = usePaymentAccounts();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const filtersChanged = useMemo(() => {
    if (!reportRequested) return false;
    return (
      filterStartDate !== reportStartDate ||
      filterEndDate !== reportEndDate ||
      JSON.stringify([...filterAccountIds].sort()) !== JSON.stringify([...reportAccountIds].sort()) ||
      JSON.stringify([...filterTypes].sort()) !== JSON.stringify([...reportTypes].sort()) ||
      filterShowCancelled !== reportShowCancelled
    );
  }, [
    filterStartDate, filterEndDate, filterAccountIds, filterTypes, filterShowCancelled,
    reportStartDate, reportEndDate, reportAccountIds, reportTypes, reportShowCancelled,
    reportRequested,
  ]);

  const { data: rows = [], isLoading, refetch } = useRealExpensesReport({
    startDate: reportStartDate,
    endDate: reportEndDate,
    accountIds: reportAccountIds,
    types: reportTypes,
    showCancelled: reportShowCancelled,
    enabled: reportRequested,
  });

  const handleGenerateReport = () => {
    setReportStartDate(filterStartDate);
    setReportEndDate(filterEndDate);
    setReportAccountIds([...filterAccountIds]);
    setReportTypes([...filterTypes]);
    setReportShowCancelled(filterShowCancelled);
    setReportRequested(true);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['real-expenses-report'], exact: false });
    await refetch({ cancelRefetch: true });
  };

  const toggleAccount = (id: string) => {
    setFilterAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleType = (t: RealExpenseType) => {
    setFilterTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  // Summary calculations (active rows only)
  const summary = useMemo(() => {
    const active = rows.filter((r) => !r.is_deleted);
    const total = active.reduce((s, r) => s + r.amount, 0);
    const cancelled = rows.filter((r) => r.is_deleted).reduce((s, r) => s + r.amount, 0);
    return { total, cancelled };
  }, [rows]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <PageHeader
        title="Звіт по реальних витратах"
        description="Всі операції, що змінюють стан рахунків"
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Фільтри</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Date range */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <Label>Дата з</Label>
              <Input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Дата по</Label>
              <Input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-40"
              />
            </div>
          </div>

          {/* Accounts */}
          {accounts.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Рахунки (порожньо = всі)</Label>
              <div className="flex flex-wrap gap-3">
                {accounts.map((acc) => (
                  <label key={acc.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={filterAccountIds.includes(acc.id)}
                      onCheckedChange={() => toggleAccount(acc.id)}
                      className="rounded-none"
                    />
                    {acc.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Operation types */}
          <div className="flex flex-col gap-2">
            <Label>Типи операцій (порожньо = всі)</Label>
            <div className="flex flex-wrap gap-3">
              {ALL_TYPES.map((t) => (
                <label key={t.value} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={filterTypes.includes(t.value)}
                    onCheckedChange={() => toggleType(t.value)}
                    className="rounded-none"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          {/* Show cancelled */}
          <div className="flex items-center gap-3">
            <Switch
              id="show-cancelled"
              checked={filterShowCancelled}
              onCheckedChange={setFilterShowCancelled}
            />
            <Label htmlFor="show-cancelled">Показувати скасовані операції</Label>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={handleGenerateReport} disabled={isLoading}>
              {isLoading ? 'Завантаження...' : 'Сформувати звіт'}
            </Button>
            {reportRequested && (
              <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Оновити
              </Button>
            )}
            {filtersChanged && (
              <span className="text-sm text-amber-600 self-center">
                Фільтри змінено — натисніть «Сформувати звіт»
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      {reportRequested && !isLoading && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingDown className="h-4 w-4 text-red-600" />
                Загальна сума витрат
              </div>
              <div className="text-lg font-semibold text-red-600">
                {formatCurrency(summary.total)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                Кількість операцій
              </div>
              <div className="text-lg font-semibold">
                {rows.filter((r) => !r.is_deleted).length}
              </div>
            </CardContent>
          </Card>
          {reportShowCancelled && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  Скасовано (сума)
                </div>
                <div className="text-lg font-semibold text-muted-foreground">
                  {formatCurrency(summary.cancelled)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Results */}
      {reportRequested && (
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">Завантаження...</div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                Операцій за обраний період не знайдено
              </div>
            ) : isMobile ? (
              /* ===== MOBILE: card list ===== */
              <div className="divide-y">
                {rows.map((row) => {
                  const isAdvanceSpend = row.expense_advance_type === 'spend';
                  const isAdvanceIssue = row.expense_advance_type === 'issue';
                  const displayAmount = isAdvanceSpend && row.real_amount != null
                    ? row.real_amount
                    : row.amount;

                  return (
                    <div key={row.id} className={cn('px-4 py-3 space-y-2', row.is_deleted && 'opacity-50')}>
                      {/* Header: date + amount */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{formatDate(row.date)}</div>
                          <div className="text-sm text-muted-foreground">{getOperationLabel(row)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-red-600">{formatCurrency(displayAmount)}</div>
                          {isAdvanceSpend && (
                            <div className="text-[11px] text-muted-foreground">
                              {(row.advance_consumed_amount ?? 0) > 0 && (
                                <span>з авансу: {formatCurrency(row.advance_consumed_amount!)}</span>
                              )}
                              {(row.advance_consumed_amount ?? 0) > 0 && row.amount > 0 && ' · '}
                              {row.amount > 0 && (
                                <span>з рахунку: {formatCurrency(row.amount)}</span>
                              )}
                            </div>
                          )}
                          {isAdvanceIssue && (
                            <div className="text-[11px] text-amber-600">аванс</div>
                          )}
                        </div>
                      </div>

                      {/* Fields */}
                      {(row.category_name ?? row.activity_name) && (
                        <div className="flex justify-between text-sm gap-4">
                          <span className="text-muted-foreground shrink-0">Категорія</span>
                          <span className="text-right">{row.category_name ?? row.activity_name}</span>
                        </div>
                      )}
                      {row.recipient_name && (
                        <div className="flex justify-between text-sm gap-4">
                          <span className="text-muted-foreground shrink-0">Отримувач</span>
                          <span className="text-right">{row.recipient_name}</span>
                        </div>
                      )}
                      {row.account_name && (
                        <div className="flex justify-between text-sm gap-4">
                          <span className="text-muted-foreground shrink-0">Рахунок</span>
                          <span className="text-right">{row.account_name}</span>
                        </div>
                      )}
                      {row.description && (
                        <div className="flex justify-between text-sm gap-4">
                          <span className="text-muted-foreground shrink-0">Опис</span>
                          <span className="text-right break-words">{row.description}</span>
                        </div>
                      )}

                      {/* Status */}
                      {row.is_deleted && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Скасовано
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ===== DESKTOP: table ===== */
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Дата</TableHead>
                      <TableHead>Тип операції</TableHead>
                      <TableHead>Категорія</TableHead>
                      <TableHead>Опис</TableHead>
                      <TableHead>Отримувач</TableHead>
                      <TableHead>Рахунок</TableHead>
                      <TableHead className="text-right w-40">Сума</TableHead>
                      <TableHead className="w-28">Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const isAdvanceSpend = row.expense_advance_type === 'spend';
                      const isAdvanceIssue = row.expense_advance_type === 'issue';
                      const displayAmount = isAdvanceSpend && row.real_amount != null
                        ? row.real_amount
                        : row.amount;

                      return (
                        <TableRow
                          key={row.id}
                          className={cn(row.is_deleted && 'opacity-50')}
                        >
                          <TableCell className="text-sm">{formatDate(row.date)}</TableCell>
                          <TableCell className="text-sm">{getOperationLabel(row)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.category_name ?? row.activity_name ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                            {row.description ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.recipient_name ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.account_name ?? '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-red-600">
                            <div>{formatCurrency(displayAmount)}</div>
                            {isAdvanceSpend && (
                              <div className="text-xs font-normal text-muted-foreground mt-0.5 flex flex-wrap gap-x-1">
                                {(row.advance_consumed_amount ?? 0) > 0 && (
                                  <span>з авансу: {formatCurrency(row.advance_consumed_amount!)}</span>
                                )}
                                {(row.advance_consumed_amount ?? 0) > 0 && row.amount > 0 && (
                                  <span>·</span>
                                )}
                                {row.amount > 0 && (
                                  <span>з рахунку: {formatCurrency(row.amount)}</span>
                                )}
                              </div>
                            )}
                            {isAdvanceIssue && (
                              <div className="text-xs font-normal text-amber-600 mt-0.5">аванс</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.is_deleted ? (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                Скасовано
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-green-700 border-green-300">
                                Активна
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
