import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, ArrowRightLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { usePaymentAccounts, useUpdatePaymentAccount } from '@/hooks/usePaymentAccounts';
import { useAccountBalance, useAccountTransactions } from '@/hooks/useAccountBalances';
import { useAccountTransfers, useCancelAccountTransfer } from '@/hooks/useAccountTransfers';
import { formatCurrency, formatDate } from '@/lib/attendance';
import { Badge } from '@/components/ui/badge';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useMemo } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AccountTransferDialog } from '@/components/accounts/AccountTransferDialog';

// Тільки реальні операції (income виключено — це прогноз)
const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  payment: 'Оплата',
  expense: 'Витрата',
  salary: 'ЗП',
  household: 'Господарські',
  transfer: 'Переказ',
  dividend: 'Дивіденд',
};

const TRANSACTION_TYPE_COLORS: Record<string, string> = {
  payment: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  expense: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  salary: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  household: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  transfer: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  dividend: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

type PeriodType = 'all' | 'month' | 'quarter' | 'halfYear' | 'year' | 'custom';

function parseYearMonth(value: string): { year: number; month: number } | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  return { year, month };
}

function getPeriodBounds(
  periodType: PeriodType,
  periodValue: string,
  customFrom?: string,
  customTo?: string
): [Date, Date] | null {
  if (periodType === 'all') return null;
  if (periodType === 'custom' && customFrom && customTo) {
    const start = new Date(customFrom);
    const end = new Date(customTo);
    end.setHours(23, 59, 59, 999);
    return [start, end];
  }
  if (periodType === 'month' && /^\d{4}-\d{2}$/.test(periodValue)) {
    const [y, m] = periodValue.split('-').map(Number);
    return [new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59)];
  }
  if (periodType === 'quarter' && /^\d{4}-Q[1-4]$/.test(periodValue)) {
    const [y, q] = [parseInt(periodValue.slice(0, 4), 10), parseInt(periodValue.slice(-1), 10)];
    const startM = (q - 1) * 3;
    const endM = startM + 3;
    return [new Date(y, startM, 1), new Date(y, endM, 0, 23, 59, 59)];
  }
  if (periodType === 'halfYear' && /^\d{4}-H[12]$/.test(periodValue)) {
    const y = parseInt(periodValue.slice(0, 4), 10);
    const h = periodValue.endsWith('H1') ? 1 : 2;
    const startM = (h - 1) * 6;
    return [new Date(y, startM, 1), new Date(y, startM + 6, 0, 23, 59, 59)];
  }
  if (periodType === 'year' && /^\d{4}$/.test(periodValue)) {
    const y = parseInt(periodValue, 10);
    return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59)];
  }
  return null;
}

function inPeriod(
  dateStr: string,
  periodType: PeriodType,
  periodValue: string,
  customFrom?: string,
  customTo?: string
): boolean {
  const bounds = getPeriodBounds(periodType, periodValue, customFrom, customTo);
  if (!bounds) return true;
  const [start, end] = bounds;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

function formatPeriodLabel(
  periodType: PeriodType,
  periodValue: string,
  customFrom?: string,
  customTo?: string
): string {
  if (periodType === 'all') return 'Всі періоди';
  if (periodType === 'custom' && customFrom && customTo) {
    const from = new Date(customFrom).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
    const to = new Date(customTo).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${from} – ${to}`;
  }
  if (periodType === 'month' && /^\d{4}-\d{2}$/.test(periodValue)) {
    const [y, m] = periodValue.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
  }
  if (periodType === 'quarter' && /^\d{4}-Q[1-4]$/.test(periodValue)) {
    const q = periodValue.slice(-1);
    const y = periodValue.slice(0, 4);
    const qNames: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
    return `Q${qNames[q] || q} ${y}`;
  }
  if (periodType === 'halfYear' && /^\d{4}-H[12]$/.test(periodValue)) {
    const h = periodValue.endsWith('H1') ? 'I' : 'II';
    return `Півріччя ${h} ${periodValue.slice(0, 4)}`;
  }
  if (periodType === 'year' && /^\d{4}$/.test(periodValue)) return periodValue;
  return periodValue;
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentQuarter = `${currentYear}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  const currentHalf = `${currentYear}-${now.getMonth() < 6 ? 'H1' : 'H2'}`;

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [periodValue, setPeriodValue] = useState<string>(currentMonth);
  const [customDateFrom, setCustomDateFrom] = useState<string>(() => {
    const d = new Date(currentYear, 0, 1);
    return d.toISOString().slice(0, 10);
  });
  const [customDateTo, setCustomDateTo] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [cancellingTransferId, setCancellingTransferId] = useState<string | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [openingBalanceDialogOpen, setOpeningBalanceDialogOpen] = useState(false);
  const [openingBalanceDate, setOpeningBalanceDate] = useState('');
  const [openingBalanceAmount, setOpeningBalanceAmount] = useState('');

  const { data: accounts = [] } = usePaymentAccounts();
  const account = accounts.find((a) => a.id === id);
  const updateAccount = useUpdatePaymentAccount();

  const { data: balance, isLoading: balanceLoading } = useAccountBalance(id || '');
  const { data: transactions = [], isLoading: transactionsLoading } = useAccountTransactions(id || '');
  const { data: transfers = [], isLoading: transfersLoading } = useAccountTransfers(id);
  const cancelTransfer = useCancelAccountTransfer();

  const isPeriodSelected = periodType !== 'all' && (
    periodType !== 'custom' || (!!customDateFrom && !!customDateTo)
  );

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    if (typeFilter !== 'all') {
      filtered = filtered.filter((t) => t.type === typeFilter);
    }

    if (isPeriodSelected) {
      filtered = filtered.filter((t) =>
        inPeriod(t.date, periodType, periodValue, customDateFrom, customDateTo)
      );
    }

    return filtered;
  }, [transactions, typeFilter, isPeriodSelected, periodType, periodValue, customDateFrom, customDateTo]);

  const filteredTotal = useMemo(() => {
    return filteredTransactions.reduce((sum, t) => {
      const amt = Number(t.amount) || 0;
      return sum + amt;
    }, 0);
  }, [filteredTransactions]);

  const allDates = useMemo(() => {
    const dates: Date[] = [];
    transactions.forEach((t) => dates.push(new Date(t.date)));
    transfers.forEach((t) => dates.push(new Date(t.transfer_date)));
    dates.push(now);
    return dates;
  }, [transactions, transfers]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    allDates.forEach((d) => years.add(d.getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [allDates]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    allDates.forEach((d) => {
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(months).sort().reverse();
  }, [allDates]);

  const quarterOptions = useMemo(() => {
    const opts: string[] = [];
    yearOptions.forEach((y) => {
      [1, 2, 3, 4].forEach((q) => opts.push(`${y}-Q${q}`));
    });
    return opts.sort().reverse();
  }, [yearOptions]);

  const halfYearOptions = useMemo(() => {
    const opts: string[] = [];
    yearOptions.forEach((y) => {
      opts.push(`${y}-H1`, `${y}-H2`);
    });
    return opts.sort().reverse();
  }, [yearOptions]);

  const filteredTransfers = useMemo(() => {
    if (!isPeriodSelected) return transfers;
    return transfers.filter((t) =>
      inPeriod(t.transfer_date, periodType, periodValue, customDateFrom, customDateTo)
    );
  }, [transfers, isPeriodSelected, periodType, periodValue, customDateFrom, customDateTo]);

  const monthReference = useMemo(() => {
    if (periodType === 'month') {
      const parsed = parseYearMonth(periodValue);
      if (parsed) return parsed;
    }
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, [periodType, periodValue]);

  const endOfPreviousMonth = useMemo(
    () => new Date(monthReference.year, monthReference.month - 1, 0, 23, 59, 59, 999),
    [monthReference]
  );

  const previousMonthBalance = useMemo(() => {
    const ledgerBeforeMonth = transactions.reduce((sum, tx) => {
      const txDate = new Date(tx.date);
      return txDate <= endOfPreviousMonth ? sum + (Number(tx.amount) || 0) : sum;
    }, 0);
    return ledgerBeforeMonth;
  }, [transactions, endOfPreviousMonth]);

  const manualOpeningAmount = Number(account?.opening_balance_amount ?? 0) || 0;
  const openingAtMonthStart = previousMonthBalance + manualOpeningAmount;

  // Значення за період для плиток (коли обрано період)
  const periodTileValues = useMemo(() => {
    if (!isPeriodSelected || !id) return null;
    const inP = (dateStr: string) =>
      inPeriod(dateStr, periodType, periodValue, customDateFrom, customDateTo);
    const periodTxs = transactions.filter((t) => inP(t.date));
    const periodTrs = transfers.filter((t) => t.from_account_id === id && inP(t.transfer_date));
    let income = 0;
    let expense = 0;
    for (const t of periodTxs) {
      const amt = Number(t.amount) || 0;
      if (amt > 0) {
        income += amt;
      } else if (amt < 0) {
        expense += Math.abs(amt);
      }
    }
    const transfersOut = periodTrs.reduce((s, t) => s + (t.is_cancelled ? 0 : Number(t.amount) || 0), 0);
    return {
      income,
      expense,
      transfersOut,
      balance: income - expense,
    };
  }, [transactions, transfers, isPeriodSelected, periodType, periodValue, customDateFrom, customDateTo, id]);

  if (!account) {
    return (
      <div className="p-8">
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-muted-foreground">Рахунок не знайдено</p>
          <Button asChild variant="link" className="mt-4">
            <Link to="/accounts">Повернутися до списку рахунків</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link to="/accounts">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{account.name}</h1>
              {account.description && (
                <p className="text-sm text-muted-foreground mt-1">{account.description}</p>
              )}
            </div>
          </div>
        }
        actions={
          <Button variant="outline" onClick={() => setTransferDialogOpen(true)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Перекази
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        {/* Глобальний перемикач періоду */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Період:</span>
          <Select
            value={periodType}
            onValueChange={(v: PeriodType) => {
              setPeriodType(v);
              if (v === 'month') setPeriodValue(currentMonth);
              if (v === 'quarter') setPeriodValue(currentQuarter);
              if (v === 'halfYear') setPeriodValue(currentHalf);
              if (v === 'year') setPeriodValue(String(currentYear));
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі періоди</SelectItem>
              <SelectItem value="month">Місяць</SelectItem>
              <SelectItem value="quarter">Квартал</SelectItem>
              <SelectItem value="halfYear">Півріччя</SelectItem>
              <SelectItem value="year">Рік</SelectItem>
              <SelectItem value="custom">Власний діапазон</SelectItem>
            </SelectContent>
          </Select>

          {periodType === 'month' && (
            <Select value={periodValue} onValueChange={setPeriodValue}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Місяць" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => {
                  const [y, mn] = m.split('-').map(Number);
                  const label = new Date(y, mn - 1, 1).toLocaleDateString('uk-UA', {
                    month: 'long',
                    year: 'numeric',
                  });
                  return (
                    <SelectItem key={m} value={m}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}

          {periodType === 'quarter' && (
            <Select value={periodValue} onValueChange={setPeriodValue}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Квартал" />
              </SelectTrigger>
              <SelectContent>
                {quarterOptions.map((q) => (
                  <SelectItem key={q} value={q}>
                    {formatPeriodLabel('quarter', q)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {periodType === 'halfYear' && (
            <Select value={periodValue} onValueChange={setPeriodValue}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Півріччя" />
              </SelectTrigger>
              <SelectContent>
                {halfYearOptions.map((h) => (
                  <SelectItem key={h} value={h}>
                    {formatPeriodLabel('halfYear', h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {periodType === 'year' && (
            <Select value={periodValue} onValueChange={setPeriodValue}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Рік" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {periodType === 'custom' && (
            <>
              <Input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="w-[140px]"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="w-[140px]"
              />
            </>
          )}
        </div>

        {/* Балансы по счёту */}
        {balanceLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-32 bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : balance ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Залишок на початок періоду
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Залишок на початок місяця
                </p>
                <div className={cn(
                  "text-2xl font-bold",
                  openingAtMonthStart >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {formatCurrency(openingAtMonthStart)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Баланс за минулий місяць: {formatCurrency(previousMonthBalance)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  + Введений залишок: {formatCurrency(manualOpeningAmount)}
                  {account?.opening_balance_date ? ` (на дату ${account.opening_balance_date})` : ''}
                </p>
                <div className="hidden">
                {account?.opening_balance_date && (account?.opening_balance_amount ?? 0) !== 0 ? (
                  <>
                    <div className="text-2xl font-bold">
                      {formatCurrency(Number(account.opening_balance_amount) || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      на дату {account.opening_balance_date}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Не вказано</p>
                )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setOpeningBalanceDate(account?.opening_balance_date || '');
                    setOpeningBalanceAmount(
                      account?.opening_balance_amount != null ? String(account.opening_balance_amount) : ''
                    );
                    setOpeningBalanceDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  {account?.opening_balance_date ? 'Редагувати' : 'Вказати'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Баланс рахунку
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Загальний баланс рахунку
                </p>
                <div className={cn(
                  "text-2xl font-bold",
                  balance.free_funds >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {formatCurrency(balance.free_funds)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  = Внесений залишок + Надходження − Витрати − Перекази
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Реальні надходження
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(periodTileValues?.income ?? balance.actual_receipts)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Витрати
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(periodTileValues?.expense ?? balance.expenses)}
                </div>
              </CardContent>
            </Card>

            {(periodTileValues ? periodTileValues.transfersOut > 0 : balance.transfers_out > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Перекази на інший рахунок
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(periodTileValues?.transfersOut ?? balance.transfers_out)}
                  </div>
                </CardContent>
              </Card>
            )}

            {periodTileValues && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Доход за період
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(periodTileValues.income)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Расход за період
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(periodTileValues.expense)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Баланс за період
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn(
                      "text-2xl font-bold",
                      periodTileValues.balance >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {formatCurrency(periodTileValues.balance)}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        ) : null}

        {/* Переводы */}
        {transfers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Перекази</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredTransfers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <p>{!isPeriodSelected ? 'Немає переказів' : 'Немає переказів за обраний період'}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>З рахунку</TableHead>
                      <TableHead>На рахунок</TableHead>
                      <TableHead>Сума</TableHead>
                      <TableHead>Комісія</TableHead>
                      <TableHead>Зараховано</TableHead>
                      <TableHead>Опис</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Дії</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransfers.map((transfer) => (
                      <TableRow key={transfer.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {formatDate(transfer.transfer_date)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {transfer.from_account?.name || 'Невідомий рахунок'}
                        </TableCell>
                        <TableCell>
                          {transfer.to_account?.name || 'Невідомий рахунок'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(transfer.amount)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(transfer.commission_amount || 0)}
                        </TableCell>
                        <TableCell className="font-medium text-green-600">
                          {formatCurrency(transfer.amount - (transfer.commission_amount || 0))}
                        </TableCell>
                        <TableCell>
                          {transfer.description || (
                            <span className="text-muted-foreground">Без опису</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {transfer.is_cancelled ? (
                            <Badge variant="outline" className="bg-red-100 text-red-800">
                              Скасовано
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-100 text-green-800">
                              Виконано
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!transfer.is_cancelled && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setCancellingTransferId(transfer.id)}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* История операций */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Історія операцій</CardTitle>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Тип транзакції" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі типи</SelectItem>
                  {Object.entries(TRANSACTION_TYPE_LABELS).map(([type, label]) => (
                    <SelectItem key={type} value={type}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <p>{!isPeriodSelected ? 'Немає транзакцій' : 'Немає транзакцій за обраний період'}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Опис</TableHead>
                    <TableHead className="text-right">Сума</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((transaction) => {
                    const hasTransferId = !!(transaction as any).transfer_id;
                    // Находим перевод для этой транзакции
                    const relatedTransfer = hasTransferId 
                      ? transfers.find(t => t.id === (transaction as any).transfer_id)
                      : null;
                    const canCancel = hasTransferId && relatedTransfer && !relatedTransfer.is_cancelled;
                    
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {formatDate(transaction.date)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={TRANSACTION_TYPE_COLORS[transaction.type] || ''}
                          >
                            {TRANSACTION_TYPE_LABELS[transaction.type] || transaction.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {hasTransferId && (
                              <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                            )}
                            {transaction.description || (
                              <span className="text-muted-foreground">Без опису</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              'font-medium',
                              (Number(transaction.amount) || 0) >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            )}
                          >
                            {(Number(transaction.amount) || 0) >= 0 ? '+' : '-'}
                            {formatCurrency(Math.abs(transaction.amount))}
                          </span>
                        </TableCell>
                        <TableCell>
                          {canCancel && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setCancellingTransferId((transaction as any).transfer_id)}
                              className="h-8 w-8"
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/50 font-semibold border-t-2">
                    <TableCell colSpan={3} className="text-right">
                      Разом
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          'font-medium',
                          filteredTotal >= 0 ? 'text-green-600' : 'text-red-600'
                        )}
                      >
                        {filteredTotal >= 0 ? '+' : ''}
                        {formatCurrency(filteredTotal)}
                      </span>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={openingBalanceDialogOpen} onOpenChange={setOpeningBalanceDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Залишок на початок періоду</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Вкажіть суму та дату (наприклад 1 січня). Не входить у дохід, враховується в балансі рахунку.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Дата</Label>
              <Input
                type="date"
                value={openingBalanceDate}
                onChange={(e) => setOpeningBalanceDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Сума</Label>
              <Input
                type="number"
                step={0.01}
                placeholder="0"
                value={openingBalanceAmount}
                onChange={(e) => setOpeningBalanceAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpeningBalanceDialogOpen(false)}>
              Скасувати
            </Button>
            <Button
              onClick={async () => {
                if (!account) return;
                const amountNum =
                  openingBalanceAmount === '' || openingBalanceAmount === null
                    ? null
                    : Number(openingBalanceAmount);
                const dateVal = openingBalanceDate?.trim() || null;
                try {
                  await updateAccount.mutateAsync({
                    id: account.id,
                    opening_balance_date: dateVal,
                    opening_balance_amount: amountNum ?? 0,
                  });
                  setOpeningBalanceDialogOpen(false);
                } catch {
                  // toast from mutation
                }
              }}
            >
              Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccountTransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        defaultFromAccountId={id}
      />

      <AlertDialog open={!!cancellingTransferId} onOpenChange={() => setCancellingTransferId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Скасувати переказ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ця дія видалить транзакції, пов'язані з цим переказом. Цю дію не можна скасувати.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ні</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancellingTransferId) {
                  cancelTransfer.mutate(
                    { transferId: cancellingTransferId },
                    {
                      onSuccess: () => setCancellingTransferId(null),
                    }
                  );
                }
              }}
              className="bg-destructive text-destructive-foreground"
            >
              Так, скасувати
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
