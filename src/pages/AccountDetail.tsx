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

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  income: 'Начислення',
  payment: 'Оплата',
  expense: 'Витрата',
  salary: 'ЗП',
  household: 'Господарські',
};

const TRANSACTION_TYPE_COLORS: Record<string, string> = {
  income: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  payment: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  expense: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  salary: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  household: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [cancellingTransferId, setCancellingTransferId] = useState<string | null>(null);
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

  const filteredTotal = useMemo(() => {
    return filteredTransactions.reduce((sum, t) => {
      const amt = Number(t.amount) || 0;
      return sum + (t.type === 'income' || t.type === 'payment' ? amt : -Math.abs(amt));
    }, 0);
  }, [filteredTransactions]);

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
                  Залишок на початок періоду
                </CardTitle>
              </CardHeader>
              <CardContent>
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

        {/* Переводы */}
        {transfers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Перекази</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>З рахунку</TableHead>
                    <TableHead>На рахунок</TableHead>
                    <TableHead>Сума</TableHead>
                    <TableHead>Опис</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Дії</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((transfer) => (
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
            </CardContent>
          </Card>
        )}

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
                              transaction.type === 'income' || transaction.type === 'payment'
                                ? 'text-green-600'
                                : 'text-red-600'
                            )}
                          >
                            {transaction.type === 'income' || transaction.type === 'payment' ? '+' : '-'}
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
