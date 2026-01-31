import React, { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSummaryReportData } from '@/hooks/useSummaryReport';
import { formatCurrency } from '@/lib/attendance';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useActivities } from '@/hooks/useActivities';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

export default function SummaryReport() {
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [isCumulative, setIsCumulative] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [selectedActivityId, setSelectedActivityId] = useState<string>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  const { data: activities = [] } = useActivities();
  const { data: accounts = [] } = usePaymentAccounts();
  
  // Get all expense categories
  const { data: allExpenseCategories = [] } = useQuery({
    queryKey: ['all-expense-categories'],
    queryFn: async () => {
      const expenseActivityIds = activities
        .filter(a => a.category === 'expense' || a.category === 'household_expense')
        .map(a => a.id);
      
      if (expenseActivityIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .in('activity_id', expenseActivityIds)
        .order('name');
      
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; activity_id: string }>;
    },
    enabled: activities.length > 0,
  });

  const { data: reportData, isLoading } = useSummaryReportData({
    year: filterYear,
    month: filterMonth,
    cumulative: isCumulative,
    accountId: selectedAccountId === 'all' ? undefined : selectedAccountId,
    activityId: selectedActivityId === 'all' ? undefined : selectedActivityId,
    categoryId: selectedCategoryId === 'all' ? undefined : selectedCategoryId,
  });

  const incomeActivities = useMemo(() => {
    return activities.filter(a => a.category === 'income' || a.category === 'additional_income');
  }, [activities]);

  const expenseActivities = useMemo(() => {
    return activities.filter(a => a.category === 'expense' || a.category === 'household_expense');
  }, [activities]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Сводний звіт"
        description="Аналіз нарахувань, виплат та витрат по напрямках"
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Фільтри</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Month/Year Selector */}
            <div className="space-y-2">
              <Label>Місяць</Label>
              <div className="flex gap-2">
                <Select
                  value={filterMonth.toString()}
                  onValueChange={(value) => setFilterMonth(parseInt(value))}
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
                <Select
                  value={filterYear.toString()}
                  onValueChange={(value) => setFilterYear(parseInt(value))}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => filterYear - 2 + i).map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cumulative Toggle */}
            <div className="flex items-center space-x-2 pt-8">
              <Switch
                id="cumulative"
                checked={isCumulative}
                onCheckedChange={setIsCumulative}
              />
              <Label htmlFor="cumulative" className="cursor-pointer">
                Накопичувальний режим
              </Label>
            </div>

            {/* Account Filter */}
            <div className="space-y-2">
              <Label>Рахунок</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Всі рахунки" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі рахунки</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Activity Filter */}
            <div className="space-y-2">
              <Label>Активність</Label>
              <Select value={selectedActivityId} onValueChange={setSelectedActivityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Всі активності" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі активності</SelectItem>
                  {incomeActivities.map((activity) => (
                    <SelectItem key={activity.id} value={activity.id}>
                      {activity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter (only for expenses tab) */}
            <div className="space-y-2">
              <Label>Категорія витрат</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Всі категорії" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі категорії</SelectItem>
                  {allExpenseCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Sections */}
      <Tabs defaultValue="income" className="space-y-4">
        <TabsList>
          <TabsTrigger value="income">Нарахування на оплату</TabsTrigger>
          <TabsTrigger value="salary">Нарахування на ЗП</TabsTrigger>
          <TabsTrigger value="expenses">Витрати по категоріях</TabsTrigger>
        </TabsList>

        {/* Income Section */}
        <TabsContent value="income" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Нарахування на оплату за всі послуги</CardTitle>
              <CardDescription>
                {isCumulative 
                  ? `Накопичувальна сума з початку до ${MONTHS[filterMonth]} ${filterYear}`
                  : `Сума за ${MONTHS[filterMonth]} ${filterYear}`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Завантаження...</div>
              ) : (
                <>
                  <div className="mb-4">
                    <div className="text-2xl font-bold text-primary">
                      {formatCurrency(reportData?.incomeTotal || 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Загальна сума нарахувань
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Активність</TableHead>
                        <TableHead>Рахунок</TableHead>
                        <TableHead className="text-right">Сума</TableHead>
                        <TableHead className="text-right">Кількість транзакцій</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData?.incomeDetails && reportData.incomeDetails.length > 0 ? (
                        reportData.incomeDetails.map((detail) => (
                          <TableRow key={`${detail.activity_id}-${detail.account_id || 'null'}`}>
                            <TableCell>
                              {detail.activity_name}
                            </TableCell>
                            <TableCell>
                              {detail.account_name 
                                ? detail.account_name
                                : <Badge variant="outline">Без рахунку</Badge>
                              }
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(detail.amount)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {detail.count}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            Немає даних
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Salary Section */}
        <TabsContent value="salary" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Нарахування на виплату ЗП</CardTitle>
              <CardDescription>
                {isCumulative 
                  ? `Накопичувальна сума з початку до ${MONTHS[filterMonth]} ${filterYear}`
                  : `Сума за ${MONTHS[filterMonth]} ${filterYear}`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Завантаження...</div>
              ) : (
                <>
                  <div className="mb-4">
                    <div className="text-2xl font-bold text-destructive">
                      {formatCurrency(reportData?.salaryTotal || 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Загальна сума нарахувань на ЗП
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Педагог</TableHead>
                        <TableHead>Активність</TableHead>
                        <TableHead className="text-right">Сума</TableHead>
                        <TableHead className="text-right">Кількість записів</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData?.salaryDetails && reportData.salaryDetails.length > 0 ? (
                        reportData.salaryDetails.map((detail) => (
                          <TableRow key={`${detail.staff_id}-${detail.activity_id || 'none'}`}>
                            <TableCell className="font-medium">
                              {detail.staff_name}
                            </TableCell>
                            <TableCell>
                              {detail.activity_name 
                                ? detail.activity_name
                                : <Badge variant="outline">Без активності</Badge>
                              }
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(detail.amount)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {detail.count}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            Немає даних
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expenses Section */}
        <TabsContent value="expenses" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Витрати по категоріях</CardTitle>
              <CardDescription>
                {isCumulative 
                  ? `Накопичувальна сума з початку до ${MONTHS[filterMonth]} ${filterYear}`
                  : `Сума за ${MONTHS[filterMonth]} ${filterYear}`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Завантаження...</div>
              ) : (
                <>
                  <div className="mb-4">
                    <div className="text-2xl font-bold text-destructive">
                      {formatCurrency(reportData?.expensesTotal || 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Загальна сума витрат
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Категорія</TableHead>
                        <TableHead>Активність</TableHead>
                        <TableHead>Рахунок</TableHead>
                        <TableHead className="text-right">Сума</TableHead>
                        <TableHead className="text-right">Кількість транзакцій</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData?.expensesDetails && reportData.expensesDetails.length > 0 ? (
                        reportData.expensesDetails.map((detail) => (
                          <TableRow key={`${detail.category_id || 'none'}-${detail.activity_id || 'none'}-${detail.account_id || 'null'}`}>
                            <TableCell>
                              {detail.category_name || (
                                <Badge variant="outline">Без категорії</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {detail.activity_name 
                                ? detail.activity_name
                                : <Badge variant="outline">Без активності</Badge>
                              }
                            </TableCell>
                            <TableCell>
                              {detail.account_name 
                                ? detail.account_name
                                : <Badge variant="outline">Без рахунку</Badge>
                              }
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(detail.amount)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {detail.count}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            Немає даних
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
