import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useFinancialSummaryReport } from '@/hooks/useFinancialSummaryReport';
import { formatCurrency } from '@/lib/attendance';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Info, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

export default function FinancialSummaryReport() {
  const now = new Date();
  
  // Текущие значения фильтров (которые пользователь выбирает)
  const [filterStartYear, setFilterStartYear] = useState(now.getFullYear());
  const [filterStartMonth, setFilterStartMonth] = useState(0); // Січень
  const [filterEndYear, setFilterEndYear] = useState(now.getFullYear());
  const [filterEndMonth, setFilterEndMonth] = useState(now.getMonth());
  const [filterAccountIds, setFilterAccountIds] = useState<string[]>([]); // Пустой массив = все счета

  // Параметры для формирования отчёта (используются в запросе)
  const [reportStartYear, setReportStartYear] = useState(now.getFullYear());
  const [reportStartMonth, setReportStartMonth] = useState(0);
  const [reportEndYear, setReportEndYear] = useState(now.getFullYear());
  const [reportEndMonth, setReportEndMonth] = useState(now.getMonth());
  const [reportAccountIds, setReportAccountIds] = useState<string[]>([]);
  const [reportRequested, setReportRequested] = useState(false); // Не завантажувати автоматично при відкритті

  const { data: accounts = [] } = usePaymentAccounts();

  // Получаем годы для фильтра
  const years = useMemo(() => {
    const currentYear = now.getFullYear();
    const yearsList = [];
    for (let y = currentYear - 5; y <= currentYear + 1; y++) {
      yearsList.push(y);
    }
    return yearsList;
  }, []);

  // Проверяем, изменились ли фильтры
  const filtersChanged = useMemo(() => {
    return (
      filterStartYear !== reportStartYear ||
      filterStartMonth !== reportStartMonth ||
      filterEndYear !== reportEndYear ||
      filterEndMonth !== reportEndMonth ||
      JSON.stringify(filterAccountIds.sort()) !== JSON.stringify(reportAccountIds.sort())
    );
  }, [filterStartYear, filterStartMonth, filterEndYear, filterEndMonth, filterAccountIds, reportStartYear, reportStartMonth, reportEndYear, reportEndMonth, reportAccountIds]);

  // Формируем отчёт только при нажатии кнопки
  const { data: reportData = [], isLoading, refetch } = useFinancialSummaryReport({
    startYear: reportStartYear,
    startMonth: reportStartMonth,
    endYear: reportEndYear,
    endMonth: reportEndMonth,
    accountIds: reportAccountIds.length > 0 ? reportAccountIds : undefined,
  });

  const handleGenerateReport = () => {
    setReportRequested(true);
    setReportStartYear(filterStartYear);
    setReportStartMonth(filterStartMonth);
    setReportEndYear(filterEndYear);
    setReportEndMonth(filterEndMonth);
    setReportAccountIds([...filterAccountIds]);
  };

  const queryClient = useQueryClient();

  const handleRefreshReport = async () => {
    setReportRequested(true);
    await queryClient.invalidateQueries({
      queryKey: ['financial-summary-report'],
      exact: false,
    });
    await refetch({ cancelRefetch: true });
  };

  // Определяем, показывать ли все колонки (для всех счетов) или только основные (для конкретного счёта)
  const showAllColumns = reportAccountIds.length === 0 || reportAccountIds.length > 1;

  const toggleAccount = (accountId: string | null) => {
    const accountIdStr = accountId === null ? 'null' : accountId;
    setFilterAccountIds((prev) => {
      if (prev.includes(accountIdStr)) {
        return prev.filter((id) => id !== accountIdStr);
      } else {
        return [...prev, accountIdStr];
      }
    });
  };

  const selectAllAccounts = () => {
    setFilterAccountIds([]); // Пустой массив = все счета
  };

  const isAccountSelected = (accountId: string | null): boolean => {
    if (filterAccountIds.length === 0) return true; // Все выбраны
    const accountIdStr = accountId === null ? 'null' : accountId;
    return filterAccountIds.includes(accountIdStr);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Фінансовий звіт"
        description="Моніторинг планових та реальних грошових потоків для запобігання касовим розривам"
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Фільтри</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Start Year Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Рік початку</label>
              <Select
                value={filterStartYear.toString()}
                onValueChange={(value) => setFilterStartYear(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Month Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Місяць початку</label>
              <Select
                value={filterStartMonth.toString()}
                onValueChange={(value) => setFilterStartMonth(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* End Year Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Рік кінця</label>
              <Select
                value={filterEndYear.toString()}
                onValueChange={(value) => setFilterEndYear(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* End Month Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Місяць кінця</label>
              <Select
                value={filterEndMonth.toString()}
                onValueChange={(value) => setFilterEndMonth(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Accounts Multi-Select */}
            <div className="space-y-2 md:col-span-5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Рахунки</label>
                {filterAccountIds.length > 0 && (
                  <button
                    onClick={selectAllAccounts}
                    className="text-xs text-primary hover:underline"
                  >
                    Всі рахунки
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggleAccount(null)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md border transition-colors',
                    isAccountSelected(null)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-secondary'
                  )}
                >
                  Без рахунку
                </button>
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => toggleAccount(account.id)}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-md border transition-colors',
                      isAccountSelected(account.id)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-secondary'
                    )}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
              {filterAccountIds.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Всі рахунки обрані
                </p>
              )}
            </div>

            {/* Generate Button */}
            <div className="md:col-span-5 flex items-end gap-2">
              <Button
                onClick={filtersChanged ? handleGenerateReport : handleRefreshReport}
                disabled={isLoading}
                className="w-full md:w-auto"
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                Сформувати звіт
              </Button>
              {filtersChanged && (
                <p className="ml-4 text-sm text-muted-foreground">
                  Фільтри змінено. Натисніть кнопку для формування звіту.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Table */}
      <Card>
        <CardHeader>
          <CardTitle>Фінансовий звіт по місяцях</CardTitle>
          <CardDescription>
            {reportData.length > 0 ? (
              <>Дані за обраний період: {MONTHS[reportStartMonth]} {reportStartYear} - {MONTHS[reportEndMonth]} {reportEndYear}</>
            ) : (
              <>Виберіть параметри та натисніть "Сформувати звіт"</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Завантаження даних...
            </div>
          ) : reportData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Немає даних для відображення
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card z-10">Місяць</TableHead>
                    {!showAllColumns && reportData.length > 0 && reportData[0].initialBalance !== undefined && (
                      <TableHead className="text-right">Залишок на початок періоду</TableHead>
                    )}
                    <TableHead className="text-right">Прогноз доходу</TableHead>
                    {showAllColumns && (
                      <>
                        <TableHead className="text-right">Прогноз витрат</TableHead>
                        <TableHead className="text-right">Очікуваний баланс</TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Реальний дохід</TableHead>
                    <TableHead className="text-right">Реальні витрати</TableHead>
                    <TableHead className="text-right">Реальний баланс</TableHead>
                    {showAllColumns && (
                      <>
                        <TableHead className="text-right">Різниця від очікування</TableHead>
                        <TableHead className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            Де гроші?
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">
                                    Накопительне відхилення від плану. Пояснює розрив між очікуваним
                                    прибутком та фактичною наявністю грошей.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Залишок на рахунку</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((row, index) => {
                    const showInitialBalance = !showAllColumns && index === 0;
                    return (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium sticky left-0 bg-card z-10">
                          {row.monthLabel}
                        </TableCell>
                        {!showAllColumns && (
                          <TableCell className="text-right font-medium">
                            {formatCurrency(row.initialBalance ?? 0)}
                          </TableCell>
                        )}
                      <TableCell className="text-right">
                        {formatCurrency(row.projectedIncome)}
                      </TableCell>
                      {showAllColumns && (
                        <>
                          <TableCell className="text-right">
                            {formatCurrency(row.projectedExpense)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.expectedBalance)}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-right">
                        {formatCurrency(row.actualIncome)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.actualExpense)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-medium',
                          row.actualBalance < 0 && 'text-destructive bg-destructive/10'
                        )}
                      >
                        {formatCurrency(row.actualBalance)}
                      </TableCell>
                      {showAllColumns && (
                        <>
                          <TableCell className="text-right">
                            {formatCurrency(row.difference)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.cumulativeDifference)}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.accountBalance)}
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
    </div>
  );
}
