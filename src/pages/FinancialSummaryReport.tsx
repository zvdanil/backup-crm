import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useFinancialSummaryReport, useProjectedIncomeBreakdown } from '@/hooks/useFinancialSummaryReport';
import { formatCurrency } from '@/lib/attendance';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

  const [forecastFilterStartYear, setForecastFilterStartYear] = useState(now.getFullYear());
  const [forecastFilterStartMonth, setForecastFilterStartMonth] = useState(0);
  const [forecastFilterEndYear, setForecastFilterEndYear] = useState(now.getFullYear());
  const [forecastFilterEndMonth, setForecastFilterEndMonth] = useState(now.getMonth());

  const [forecastReportStartYear, setForecastReportStartYear] = useState(now.getFullYear());
  const [forecastReportStartMonth, setForecastReportStartMonth] = useState(0);
  const [forecastReportEndYear, setForecastReportEndYear] = useState(now.getFullYear());
  const [forecastReportEndMonth, setForecastReportEndMonth] = useState(now.getMonth());
  const [forecastReportRequested, setForecastReportRequested] = useState(false);

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

  const forecastFiltersChanged = useMemo(() => {
    return (
      forecastFilterStartYear !== forecastReportStartYear ||
      forecastFilterStartMonth !== forecastReportStartMonth ||
      forecastFilterEndYear !== forecastReportEndYear ||
      forecastFilterEndMonth !== forecastReportEndMonth
    );
  }, [
    forecastFilterStartYear,
    forecastFilterStartMonth,
    forecastFilterEndYear,
    forecastFilterEndMonth,
    forecastReportStartYear,
    forecastReportStartMonth,
    forecastReportEndYear,
    forecastReportEndMonth,
  ]);

  // Формируем отчёт только при нажатии кнопки "Сформувати звіт"
  const { data: reportData = [], isLoading, refetch } = useFinancialSummaryReport({
    startYear: reportStartYear,
    startMonth: reportStartMonth,
    endYear: reportEndYear,
    endMonth: reportEndMonth,
    accountIds: reportAccountIds.length > 0 ? reportAccountIds : undefined,
    enabled: reportRequested,
  });

  const { data: breakdownData = [], isLoading: breakdownLoading } = useProjectedIncomeBreakdown({
    startYear: reportStartYear,
    startMonth: reportStartMonth,
    endYear: reportEndYear,
    endMonth: reportEndMonth,
    accountIds: reportAccountIds.length > 0 ? reportAccountIds : undefined,
    enabled: reportRequested,
  });

  /** Усі рахунки системи; та сама логіка, що окремих рахунків у сумі */
  const {
    data: forecastData = [],
    isLoading: forecastLoading,
    refetch: refetchForecast,
  } = useFinancialSummaryReport({
    startYear: forecastReportStartYear,
    startMonth: forecastReportStartMonth,
    endYear: forecastReportEndYear,
    endMonth: forecastReportEndMonth,
    accountIds: undefined,
    enabled: forecastReportRequested,
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

  const handleGenerateForecast = () => {
    setForecastReportRequested(true);
    setForecastReportStartYear(forecastFilterStartYear);
    setForecastReportStartMonth(forecastFilterStartMonth);
    setForecastReportEndYear(forecastFilterEndYear);
    setForecastReportEndMonth(forecastFilterEndMonth);
  };

  const handleRefreshForecast = async () => {
    setForecastReportRequested(true);
    await queryClient.invalidateQueries({
      queryKey: ['financial-summary-report'],
      exact: false,
    });
    await refetchForecast({ cancelRefetch: true });
  };

  // showAllColumns — тільки для режиму "всі рахунки" (без фільтру).
  // При виборі 1 або кількох конкретних рахунків — структура одного рахунку (суми по обраних рахунках).
  const showAllColumns = reportAccountIds.length === 0;

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

  const forecastTotals = useMemo(() => {
    return forecastData.reduce(
      (acc, row) => ({
        projectedIncome: acc.projectedIncome + row.projectedIncome,
        financialForecastExpense: acc.financialForecastExpense + row.financialForecastExpense,
      }),
      { projectedIncome: 0, financialForecastExpense: 0 }
    );
  }, [forecastData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Фінансовий звіт"
        description="Моніторинг планових та реальних грошових потоків для запобігання касовим розривам"
      />

      <Tabs defaultValue="report" className="w-full">
        <TabsList>
          <TabsTrigger value="report">Фінансовий звіт</TabsTrigger>
          <TabsTrigger value="forecast">Фінансовий прогноз</TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="mt-4 space-y-6">
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
                    {!showAllColumns && (
                      <TableHead className="text-right">Прогноз дохода</TableHead>
                    )}
                    {/* Прогноз витрат, Очікуваний баланс — тимчасово приховані */}
                    <TableHead className="text-right">Реальний дохід</TableHead>
                    <TableHead className="text-right">Оборот по всім витратам</TableHead>
                    {!showAllColumns && (
                      <TableHead className="text-right">Перекази</TableHead>
                    )}
                    <TableHead className="text-right">Вивід коштів</TableHead>
                    <TableHead className="text-right">Виведено дивідендів</TableHead>
                    <TableHead className="text-right">Реальні витрати</TableHead>
                    <TableHead className="text-right">Дельта</TableHead>
                    {showAllColumns && (
                      <TableHead className="text-right">Оборот по витратах без дівідендів</TableHead>
                    )}
                    <TableHead className="text-right">Реальний баланс</TableHead>
                    {showAllColumns && (
                      <TableHead className="text-right">Баланс без дивідендів</TableHead>
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
                        {!showAllColumns && (
                          <TableCell className="text-right">
                            {formatCurrency(row.projectedIncome)}
                          </TableCell>
                        )}
                      {/* Прогноз витрат, Очікуваний баланс — тимчасово приховані */}
                      <TableCell className="text-right">
                        {formatCurrency(row.actualIncome)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.actualExpense)}
                      </TableCell>
                      {!showAllColumns && (
                        <TableCell className="text-right">
                          {formatCurrency(row.transferExpense)}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {formatCurrency(row.cashWithdrawal)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.dividendExpense)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.businessExpense)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-medium',
                          row.delta < 0 && 'text-destructive bg-destructive/10'
                        )}
                      >
                        {formatCurrency(row.delta)}
                      </TableCell>
                      {showAllColumns && (
                        <TableCell className="text-right">
                          {formatCurrency(row.expenseWithoutDividends)}
                        </TableCell>
                      )}
                      <TableCell
                        className={cn(
                          'text-right font-medium',
                          row.actualBalance < 0 && 'text-destructive bg-destructive/10'
                        )}
                      >
                        {formatCurrency(row.actualBalance)}
                      </TableCell>
                      {showAllColumns && (
                        <TableCell
                          className={cn(
                            'text-right font-medium',
                            row.accountBalanceWithoutDividends < 0 && 'text-destructive bg-destructive/10'
                          )}
                        >
                          {formatCurrency(row.accountBalanceWithoutDividends)}
                        </TableCell>
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

      {/* Breakdown table */}
      {reportRequested && (
        <Card>
          <CardHeader>
            <CardTitle>Розшифровка прогнозу доходу</CardTitle>
            <CardDescription>
              По кожному учню та активності за {MONTHS[reportStartMonth]} {reportStartYear} — {MONTHS[reportEndMonth]} {reportEndYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {breakdownLoading ? (
              <div className="text-center py-8 text-muted-foreground">Завантаження...</div>
            ) : breakdownData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Немає даних</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Учень</TableHead>
                      <TableHead>Активність</TableHead>
                      {showAllColumns && <TableHead>Рахунок</TableHead>}
                      <TableHead>Тип оплати</TableHead>
                      <TableHead className="text-right">Місяців</TableHead>
                      <TableHead className="text-right">Нараховано</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdownData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.studentName}</TableCell>
                        <TableCell>{row.activityName}</TableCell>
                        {showAllColumns && (
                          <TableCell className="text-muted-foreground">{row.accountName}</TableCell>
                        )}
                        <TableCell>
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            row.billingType === 'Абонплата'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              : row.billingType === 'Повернення'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          )}>
                            {row.billingType}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {row.billingType === 'Абонплата' ? row.monthsCharged : '—'}
                        </TableCell>
                        <TableCell className={cn(
                          'text-right font-medium',
                          row.total < 0 && 'text-destructive'
                        )}>
                          {formatCurrency(row.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 bg-muted/30">
                      <TableCell
                        colSpan={showAllColumns ? 5 : 4}
                        className="text-right font-semibold"
                      >
                        Загалом:
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(breakdownData.reduce((s, r) => s + r.total, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="forecast" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Фільтри прогнозу</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Рік початку</label>
                  <Select
                    value={forecastFilterStartYear.toString()}
                    onValueChange={(value) => setForecastFilterStartYear(parseInt(value))}
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Місяць початку</label>
                  <Select
                    value={forecastFilterStartMonth.toString()}
                    onValueChange={(value) => setForecastFilterStartMonth(parseInt(value))}
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Рік кінця</label>
                  <Select
                    value={forecastFilterEndYear.toString()}
                    onValueChange={(value) => setForecastFilterEndYear(parseInt(value))}
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Місяць кінця</label>
                  <Select
                    value={forecastFilterEndMonth.toString()}
                    onValueChange={(value) => setForecastFilterEndMonth(parseInt(value))}
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
                <div className="md:col-span-4 flex flex-wrap items-end gap-2">
                  <Button
                    onClick={forecastFiltersChanged ? handleGenerateForecast : handleRefreshForecast}
                    disabled={forecastLoading}
                  >
                    <RefreshCw className={cn('mr-2 h-4 w-4', forecastLoading && 'animate-spin')} />
                    Сформувати прогноз
                  </Button>
                  {forecastFiltersChanged && (
                    <p className="text-sm text-muted-foreground">
                      Фільтри змінено. Натисніть кнопку для формування прогнозу.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Сумарний фінансовий прогноз</CardTitle>
              <CardDescription>
                Показники агреговані по всіх рахунках платежів. Прогноз доходу — як у звіті для режиму
                «усі рахунки». Прогноз витрат — нарахована зарплата за період докупи з операційними
                реальними витратами без суми фактичних виплат зарплати з рахунків («Реальні витрати» мінус
                виплачена зарплата).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!forecastReportRequested ? (
                <div className="text-center py-8 text-muted-foreground">
                  Виберіть період і натисніть «Сформувати прогноз»
                </div>
              ) : forecastLoading ? (
                <div className="text-center py-8 text-muted-foreground">Завантаження даних...</div>
              ) : forecastData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Немає даних для відображення</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-card z-10">Місяць</TableHead>
                        <TableHead className="text-right">Прогноз доходу</TableHead>
                        <TableHead className="text-right">Прогноз витрат</TableHead>
                        <TableHead className="text-right">Прогноз прибутку</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {forecastData.map((row) => {
                        const forecastProfit = row.projectedIncome - row.financialForecastExpense;
                        return (
                        <TableRow key={row.month}>
                          <TableCell className="font-medium sticky left-0 bg-card z-10">
                            {row.monthLabel}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(row.projectedIncome)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(row.financialForecastExpense)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-medium',
                              forecastProfit < 0 && 'text-destructive bg-destructive/10'
                            )}
                          >
                            {formatCurrency(forecastProfit)}
                          </TableCell>
                        </TableRow>
                        );
                      })}
                      <TableRow className="border-t-2 bg-muted/30 font-semibold">
                        <TableCell className="sticky left-0 bg-muted/30 z-10">Загалом за період</TableCell>
                        <TableCell className="text-right">{formatCurrency(forecastTotals.projectedIncome)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(forecastTotals.financialForecastExpense)}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            forecastTotals.projectedIncome - forecastTotals.financialForecastExpense < 0 &&
                              'text-destructive bg-destructive/10'
                          )}
                        >
                          {formatCurrency(
                            forecastTotals.projectedIncome - forecastTotals.financialForecastExpense
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
