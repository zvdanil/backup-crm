import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import { useAccountBalance, useAccountTransactions } from '@/hooks/useAccountBalances';
import { formatCurrency, formatDate } from '@/lib/attendance';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  income: 'Начислення',
  payment: 'Оплата',
  expense: 'Витрата',
  salary: 'ЗП',
  household: 'Господарські',
  advance_payment: 'Аванс',
};

const TRANSACTION_TYPE_COLORS: Record<string, string> = {
  income: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  payment: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  expense: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  salary: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  household: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  advance_payment: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  const { data: accounts = [] } = usePaymentAccounts();
  const account = accounts.find((a) => a.id === id);

  const { data: balance, isLoading: balanceLoading } = useAccountBalance(id || '');
  const { data: transactions = [], isLoading: transactionsLoading } = useAccountTransactions(id || '');

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    if (typeFilter !== 'all') {
      filtered = filtered.filter((t) => t.type === typeFilter);
    }

    if (monthFilter !== 'all') {
      const [year, month] = monthFilter.split('-').map(Number);
      filtered = filtered.filter((t) => {
        const tDate = new Date(t.date);
        return tDate.getFullYear() === year && tDate.getMonth() === month - 1;
      });
    }

    return filtered;
  }, [transactions, typeFilter, monthFilter]);

  // Генерируем список месяцев для фильтра
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    transactions.forEach((t) => {
      const date = new Date(t.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.add(key);
    });
    return Array.from(months).sort().reverse();
  }, [transactions]);

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
      />

      <div className="p-8 space-y-6">
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
                  Очікуваний дохід
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(balance.expected_income)}</div>
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
                  {formatCurrency(balance.actual_receipts)}
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
                  {formatCurrency(balance.expenses)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Вільні кошти на рахунку
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  "text-2xl font-bold",
                  balance.free_funds >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {formatCurrency(balance.free_funds)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  = Надходження - Витрати - Перекази
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Очікувані надходження
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  "text-2xl font-bold",
                  balance.expected_receipts >= 0 ? "text-blue-600" : "text-muted-foreground"
                )}>
                  {formatCurrency(balance.expected_receipts)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  = Очікуваний дохід - Реальні надходження
                </p>
              </CardContent>
            </Card>

            {balance.transfers_out > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Перекази на інший рахунок
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(balance.transfers_out)}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}

        {/* История операций */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Історія операцій</CardTitle>
              <div className="flex items-center gap-2">
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

                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Місяць" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Всі місяці</SelectItem>
                    {monthOptions.map((month) => {
                      const [year, monthNum] = month.split('-').map(Number);
                      const date = new Date(year, monthNum - 1, 1);
                      return (
                        <SelectItem key={month} value={month}>
                          {date.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <p>Немає транзакцій</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Опис</TableHead>
                    <TableHead className="text-right">Сума</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((transaction) => (
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
                        {transaction.description || (
                          <span className="text-muted-foreground">Без опису</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            'font-medium',
                            transaction.type === 'income' || transaction.type === 'payment'
                              ? 'text-green-600'
                              : 'text-red-600'
                          )}
                        >
                          {transaction.type === 'income' || transaction.type === 'payment' ? '+' : '-'}
                          {formatCurrency(Math.abs(transaction.amount))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
