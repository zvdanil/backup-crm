import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, User, Wallet, Calendar, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { StaffForm } from '@/components/staff/StaffForm';
import { useStaffMember, useUpdateStaff } from '@/hooks/useStaff';
import { formatCurrency, formatDate, getDaysInMonth, formatShortDate, getWeekdayShort, isWeekend, formatDateString, WEEKEND_BG_COLOR } from '@/lib/attendance';
import { StaffBillingEditorNew } from '@/components/staff/StaffBillingEditorNew';
import { StaffManualRateHistoryEditor } from '@/components/staff/StaffManualRateHistoryEditor';
import { DeductionsEditor } from '@/components/staff/DeductionsEditor';
import {
  useStaffBillingRules,
  useCreateStaffBillingRule,
  useDeleteStaffBillingRule,
  useStaffManualRateHistory,
  useCreateStaffManualRateHistory,
  useDeleteStaffManualRateHistory,
  useStaffJournalEntries,
  useStaffPayouts,
  useCreateStaffPayout,
  useUpdateStaffPayout,
  useDeleteStaffPayout,
  getStaffBillingRuleForDate,
  type StaffBillingRule,
  type StaffManualRateHistory,
  type Deduction,
} from '@/hooks/useStaffBilling';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { useActivities } from '@/hooks/useActivities';
import { useMemo } from 'react';
import { toast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: staff, isLoading: staffLoading } = useStaffMember(id!);
  const updateStaff = useUpdateStaff();
  const { data: billingRules = [] } = useStaffBillingRules(id);
  const { data: manualRateHistory = [] } = useStaffManualRateHistory(id);
  const createBillingRule = useCreateStaffBillingRule();
  const deleteBillingRule = useDeleteStaffBillingRule();
  const createManualRateHistory = useCreateStaffManualRateHistory();
  const deleteManualRateHistory = useDeleteStaffManualRateHistory();

  type StaffBillingRuleInput = Omit<StaffBillingRule, 'id' | 'staff_id' | 'created_at' | 'updated_at'>;
  type StaffManualRateHistoryInput = Omit<StaffManualRateHistory, 'id' | 'staff_id' | 'created_at' | 'updated_at'>;
  
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [financialTab, setFinancialTab] = useState<'rules' | 'manual-rates' | 'deductions' | 'history'>('rules');
  const [billingRulesState, setBillingRulesState] = useState<StaffBillingRuleInput[]>([]);
  const [manualRateHistoryState, setManualRateHistoryState] = useState<StaffManualRateHistoryInput[]>([]);
  const [deductionsState, setDeductionsState] = useState<Deduction[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  
  // Financial Calendar state
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [auditMode, setAuditMode] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());
  const [selectedPayoutDate, setSelectedPayoutDate] = useState<string | null>(null);
  const [isPayoutDialogOpen, setIsPayoutDialogOpen] = useState(false);
  const [editingPayoutId, setEditingPayoutId] = useState<string | null>(null);
  
  // Financial Calendar data
  const { data: journalEntries = [] } = useStaffJournalEntries(id, calendarMonth, calendarYear);
  const { data: allJournalEntries = [] } = useStaffJournalEntries(id);
  const { data: payouts = [] } = useStaffPayouts(id);
  const { data: activities = [] } = useActivities();
  const createPayout = useCreateStaffPayout();
  const updatePayout = useUpdateStaffPayout();
  const deletePayout = useDeleteStaffPayout();
  
  const payoutSchema = z.object({
    amount: z.number().min(0.01, 'Сума має бути більше 0'),
    payout_date: z.string().min(1, 'Оберіть дату'),
    notes: z.string().optional(),
  });
  
  type PayoutFormData = z.infer<typeof payoutSchema>;
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PayoutFormData>({
    resolver: zodResolver(payoutSchema),
    defaultValues: {
      amount: 0,
      payout_date: new Date().toISOString().split('T')[0],
      notes: '',
    },
  });

  useEffect(() => {
    if (staff) {
      setDeductionsState((staff.deductions as Deduction[]) || []);
    }
  }, [staff]);

  useEffect(() => {
    // Initialize with empty array for new rules
    setBillingRulesState([]);
    setManualRateHistoryState([]);
  }, []);

  const handleUpdateProfile = (data: any) => {
    if (!id) return;
    updateStaff.mutate({ id, ...data });
    setEditProfileOpen(false);
  };

  const handleSaveBillingRules = () => {
    if (!id) return;
    const autoActivityIds = new Set(
      billingRulesState.map((rule) => (rule.activity_id === 'null' ? null : rule.activity_id) ?? 'all')
    );

    // Save each new rule
    billingRulesState.forEach((rule) => {
      const activityId = rule.activity_id === 'null' ? null : rule.activity_id;
      createBillingRule.mutate({
        staff_id: id,
        activity_id: activityId,
        rate_type: rule.rate_type,
        rate: rule.rate,
        lesson_limit: rule.lesson_limit ?? null,
        penalty_trigger_percent: rule.penalty_trigger_percent ?? null,
        penalty_percent: rule.penalty_percent ?? null,
        extra_lesson_rate: rule.extra_lesson_rate ?? null,
        effective_from: effectiveFrom,
        effective_to: null,
      });
    });
    
    // Reset state after saving
    setBillingRulesState([]);
  };

  const handleSaveManualRateHistory = () => {
    if (!id) return;

    // Save each new entry
    manualRateHistoryState.forEach((entry) => {
      createManualRateHistory.mutate({
        staff_id: id,
        activity_id: entry.activity_id ?? null,
        manual_rate_type: entry.manual_rate_type,
        manual_rate_value: entry.manual_rate_value,
        effective_from: effectiveFrom,
        effective_to: null,
      });
    });
    
    // Reset state after saving
    setManualRateHistoryState([]);
  };

  const handleSaveDeductions = () => {
    if (!id) return;
    updateStaff.mutate({
      id,
      deductions: deductionsState,
    });
  };

  const handleDeleteBillingRule = (ruleId: string) => {
    if (!id) return;
    deleteBillingRule.mutate({ id: ruleId, staffId: id });
  };

  const handleDeleteManualRateHistory = (entryId: string) => {
    if (!id) return;
    deleteManualRateHistory.mutate({ id: entryId, staffId: id });
  };
  
  // Financial Calendar handlers
  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };
  
  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const monthSummary = useMemo(() => {
    const startDate = new Date(calendarYear, calendarMonth, 1).toISOString().split('T')[0];
    const endDate = new Date(calendarYear, calendarMonth + 1, 0).toISOString().split('T')[0];
    const accrued = journalEntries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const paid = payouts
      .filter((payout) => payout.payout_date >= startDate && payout.payout_date <= endDate)
      .reduce((sum, payout) => sum + (Number(payout.amount) || 0), 0);

    return { accrued, paid, balance: accrued - paid };
  }, [journalEntries, payouts, calendarMonth, calendarYear]);

  // Группировка записей по статьям выплат для детализации
  const paymentItemsSummary = useMemo(() => {
    const itemsMap = new Map<string, { 
      name: string; 
      totalAmount: number; 
      totalHours: number | null; 
      entriesCount: number;
      hasHours: boolean;
    }>();

    journalEntries.forEach((entry) => {
      const activityId = entry.activity_id || 'none';
      const mode = entry.is_manual_override ? 'manual' : 'auto';
      const rowKey = `${activityId}:${mode}`;
      
      const activity = activities.find(a => a.id === activityId);
      const baseName = activity ? activity.name : 'Без активності';
      const name = activityId === 'none'
        ? (mode === 'manual' ? 'Ручні записи (без активності)' : 'Авто нарахування (без активності)')
        : `${baseName}${mode === 'manual' ? ' — ручні' : ''}`;

      if (!itemsMap.has(rowKey)) {
        itemsMap.set(rowKey, {
          name,
          totalAmount: 0,
          totalHours: null,
          entriesCount: 0,
          hasHours: false,
        });
      }

      const item = itemsMap.get(rowKey)!;
      item.totalAmount += Number(entry.amount) || 0;
      item.entriesCount += 1;
      
      // Если есть hours_worked, суммируем часы
      if (entry.hours_worked !== null && entry.hours_worked !== undefined) {
        if (item.totalHours === null) {
          item.totalHours = 0;
        }
        item.totalHours += Number(entry.hours_worked) || 0;
        item.hasHours = true;
      }
    });

    // Преобразуем в массив и сортируем
    return Array.from(itemsMap.values())
      .filter(item => item.totalAmount > 0) // Показываем только статьи с начислениями
      .sort((a, b) => a.name.localeCompare(b.name, 'uk-UA'));
  }, [journalEntries, activities]);

  const totalSummary = useMemo(() => {
    const accrued = allJournalEntries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const paid = payouts.reduce((sum, payout) => sum + (Number(payout.amount) || 0), 0);
    return { accrued, paid, balance: accrued - paid };
  }, [allJournalEntries, payouts]);
  
  const handlePayoutCellClick = (date: string) => {
    setSelectedPayoutDate(date);
    setIsPayoutDialogOpen(true);
    setEditingPayoutId(null);
    reset({
      amount: 0,
      payout_date: date,
      notes: '',
    });
  };
  
  const handlePayoutSubmit = async (data: PayoutFormData) => {
    if (!id) return;
    
    try {
      if (editingPayoutId) {
        await updatePayout.mutateAsync({
          id: editingPayoutId,
          amount: data.amount,
          payout_date: data.payout_date,
          notes: data.notes || null,
        });
      } else {
        await createPayout.mutateAsync({
          staff_id: id,
          amount: data.amount,
          payout_date: data.payout_date,
          notes: data.notes || null,
        });
      }
      reset();
      setIsPayoutDialogOpen(false);
      setSelectedPayoutDate(null);
      setEditingPayoutId(null);
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  const payoutsForSelectedDate = useMemo(() => {
    if (!selectedPayoutDate) return [];
    return payouts.filter((payout) => payout.payout_date === selectedPayoutDate);
  }, [payouts, selectedPayoutDate]);

  if (staffLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Співробітника не знайдено</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/staff">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад до списку
          </Link>
        </Button>
      </div>
    );
  }

  const formatRateTypeLabel = (rateType: StaffBillingRule['rate_type']) => {
    switch (rateType) {
      case 'fixed':
        return 'Фіксована';
      case 'percent':
        return 'Відсоток';
      case 'per_session':
        return 'За заняття';
      case 'subscription':
        return 'Абонемент';
      case 'per_student':
        return 'За учня';
      default:
        return '—';
    }
  };

  return (
    <>
      <PageHeader
        title={staff.full_name}
        actions={
          <Button variant="outline" asChild>
            <Link to="/staff">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Link>
          </Button>
        }
      />

      <div className="p-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Staff Info */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <CardTitle>{staff.full_name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{staff.position}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditProfileOpen(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Статус</p>
                  <Badge
                    variant={staff.is_active ? 'default' : 'secondary'}
                    className="mt-1"
                  >
                    {staff.is_active ? 'Активний' : 'Неактивний'}
                  </Badge>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Дата створення</p>
                  <p className="mt-1 text-sm">{formatDate(staff.created_at)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Financial Conditions */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Фінансові умови
                </CardTitle>
                <CardDescription>
                  Налаштуйте індивідуальні ставки та комісії для співробітника
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={financialTab} onValueChange={(v) => setFinancialTab(v as 'rules' | 'manual-rates' | 'deductions' | 'history')}>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="rules">Індивідуальні ставки (auto)</TabsTrigger>
                    <TabsTrigger value="manual-rates">Ставки для ручного режиму</TabsTrigger>
                    <TabsTrigger value="deductions">Динамічні комісії</TabsTrigger>
                    <TabsTrigger value="history">Фінансова історія</TabsTrigger>
                  </TabsList>

                  <TabsContent value="rules" className="mt-6">
                    <StaffBillingEditorNew
                      rules={billingRulesState}
                      onChange={setBillingRulesState}
                      effectiveFrom={effectiveFrom}
                      onEffectiveFromChange={setEffectiveFrom}
                    />
                    <div className="mt-4 flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setBillingRulesState([])}>
                        Скасувати
                      </Button>
                      <Button onClick={handleSaveBillingRules} disabled={billingRulesState.length === 0}>
                        Зберегти ставки
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="manual-rates" className="mt-6">
                    <StaffManualRateHistoryEditor
                      history={manualRateHistoryState}
                      onChange={setManualRateHistoryState}
                      effectiveFrom={effectiveFrom}
                      onEffectiveFromChange={setEffectiveFrom}
                    />
                    <div className="mt-4 flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setManualRateHistoryState([])}>
                        Скасувати
                      </Button>
                      <Button onClick={handleSaveManualRateHistory} disabled={manualRateHistoryState.length === 0}>
                        Зберегти ставки
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="deductions" className="mt-6">
                    <DeductionsEditor
                      deductions={deductionsState}
                      onChange={setDeductionsState}
                    />
                    <div className="mt-4 flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setDeductionsState((staff.deductions as Deduction[]) || [])}>
                        Скасувати
                      </Button>
                      <Button onClick={handleSaveDeductions}>
                        Зберегти комісії
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-6">
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">Баланс за місяць</CardTitle>
                            <CardDescription>
                              {['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'][calendarMonth]} {calendarYear}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className={cn("text-2xl font-semibold", monthSummary.balance >= 0 ? "text-success" : "text-destructive")}>
                              {formatCurrency(monthSummary.balance)}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              Нараховано: {formatCurrency(monthSummary.accrued)} · Виплачено: {formatCurrency(monthSummary.paid)}
                            </div>
                            
                            {/* Детализация по статьям выплат */}
                            {paymentItemsSummary.length > 0 && (
                              <div className="mt-4 pt-4 border-t">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Деталізація по статтях:</p>
                                <div className="space-y-1.5">
                                  {paymentItemsSummary.map((item, index) => (
                                    <div key={index} className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground">{item.name}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{formatCurrency(item.totalAmount)}</span>
                                        {item.hasHours && item.totalHours !== null && item.totalHours > 0 ? (
                                          <span className="text-muted-foreground">
                                            ({item.totalHours.toFixed(1)} {item.totalHours === 1 ? 'година' : item.totalHours < 5 ? 'години' : 'годин'})
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground">
                                            ({item.entriesCount} {item.entriesCount === 1 ? 'заняття' : item.entriesCount < 5 ? 'заняття' : 'занять'})
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">Баланс за весь період</CardTitle>
                            <CardDescription>Від початку співпраці</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className={cn("text-2xl font-semibold", totalSummary.balance >= 0 ? "text-success" : "text-destructive")}>
                              {formatCurrency(totalSummary.balance)}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              Нараховано: {formatCurrency(totalSummary.accrued)} · Виплачено: {formatCurrency(totalSummary.paid)}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">Фінансова історія</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Нарахування по активностях та виплати за місяць
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Switch checked={auditMode} onCheckedChange={setAuditMode} />
                            Режим перевірки
                          </label>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={handlePrevMonth}>
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-medium min-w-[150px] text-center">
                              {['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'][calendarMonth]} {calendarYear}
                            </span>
                            <Button variant="outline" size="icon" onClick={handleNextMonth}>
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <FinancialCalendarTable
                        staffId={id!}
                        month={calendarMonth}
                        year={calendarYear}
                        journalEntries={journalEntries}
                        payouts={payouts}
                        activities={activities}
                        auditMode={auditMode}
                        onPayoutCellClick={handlePayoutCellClick}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Billing Rules History */}
            {billingRules.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Історія ставок (автоматичний режим)</CardTitle>
                  <CardDescription>
                    Список усіх налаштованих ставок з датами дії для автоматичного режиму
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Активність</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>Значення</TableHead>
                        <TableHead>Діє з</TableHead>
                        <TableHead>Діє до</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billingRules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell>
                            {rule.activity_id ? (
                              <Badge variant="outline" className="bg-blue-50">
                                {rule.activity?.name || 'Конкретна активність'}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Всі активності (глобально)</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {formatRateTypeLabel(rule.rate_type)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>
                                {rule.rate_type === 'percent' 
                                  ? `${rule.rate}%`
                                  : formatCurrency(rule.rate)}
                              </span>
                              {rule.rate_type === 'subscription' && (
                                <span className="text-xs text-muted-foreground">
                                  Лім: {rule.lesson_limit ?? '—'}, Поріг: {rule.penalty_trigger_percent ?? '—'}%
                                  , Штраф: {rule.penalty_percent ?? '—'}%, Понад: {rule.extra_lesson_rate != null ? formatCurrency(rule.extra_lesson_rate) : '—'}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(rule.effective_from)}</TableCell>
                          <TableCell>
                            {rule.effective_to ? formatDate(rule.effective_to) : '—'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteBillingRule(rule.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Manual Rate History */}
            {manualRateHistory.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Історія ставок (ручний режим)</CardTitle>
                  <CardDescription>
                    Список усіх налаштованих ставок з датами дії для ручного режиму
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Активність</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>Значення</TableHead>
                        <TableHead>Діє з</TableHead>
                        <TableHead>Діє до</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {manualRateHistory.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            {entry.activity_id ? (
                              <Badge variant="outline" className="bg-blue-50">
                                {activities.find((activity) => activity.id === entry.activity_id)?.name || 'Активність'}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Всі активності</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry.manual_rate_type === 'hourly' ? 'Почасово' : 'За заняття'}
                          </TableCell>
                          <TableCell>
                            {formatCurrency(entry.manual_rate_value)}
                            {entry.manual_rate_type === 'hourly' ? ' / год' : ' / заняття'}
                          </TableCell>
                          <TableCell>{formatDate(entry.effective_from)}</TableCell>
                          <TableCell>
                            {entry.effective_to ? formatDate(entry.effective_to) : '—'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteManualRateHistory(entry.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Payout Dialog */}
      <Dialog open={isPayoutDialogOpen} onOpenChange={setIsPayoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Реєстрація виплати</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(handlePayoutSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="payout_amount">Сума (₴)</Label>
              <Input
                id="payout_amount"
                type="number"
                step="0.01"
                min="0.01"
                {...register('amount', { valueAsNumber: true })}
              />
              {errors.amount && (
                <p className="text-sm text-red-500 mt-1">{errors.amount.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="payout_date">Дата виплати</Label>
              <Input
                id="payout_date"
                type="date"
                {...register('payout_date')}
              />
              {errors.payout_date && (
                <p className="text-sm text-red-500 mt-1">{errors.payout_date.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="payout_notes">Примітки (необов'язково)</Label>
              <Textarea
                id="payout_notes"
                {...register('notes')}
                rows={3}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsPayoutDialogOpen(false);
                  setSelectedPayoutDate(null);
                  setEditingPayoutId(null);
                }}
              >
                Скасувати
              </Button>
              <Button type="submit" disabled={createPayout.isPending}>
                {createPayout.isPending || updatePayout.isPending ? 'Збереження...' : 'Зберегти'}
              </Button>
            </div>
          </form>
          {payoutsForSelectedDate.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-sm font-medium">Виплати за дату</div>
              <div className="space-y-2">
                {payoutsForSelectedDate.map((payout) => (
                  <div key={payout.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-destructive">{formatCurrency(payout.amount)}</div>
                      {payout.notes && (
                        <div className="text-xs text-muted-foreground break-words">{payout.notes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingPayoutId(payout.id);
                          reset({
                            amount: payout.amount,
                            payout_date: payout.payout_date,
                            notes: payout.notes || '',
                          });
                        }}
                      >
                        Редагувати
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          const note = window.prompt('Причина видалення (обовʼязково):');
                          if (!note || !note.trim()) return;
                          await deletePayout.mutateAsync({ id: payout.id, staffId: staff?.id || '', deleteNote: note.trim() });
                        }}
                      >
                        Видалити
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <StaffForm
        open={editProfileOpen}
        onOpenChange={setEditProfileOpen}
        onSubmit={handleUpdateProfile}
        initialData={staff}
        isLoading={updateStaff.isPending}
      />
    </>
  );
}

// Financial Calendar Table Component
interface FinancialCalendarTableProps {
  staffId: string;
  month: number;
  year: number;
  journalEntries: any[];
  payouts: any[];
  activities: any[];
  auditMode: boolean;
  onPayoutCellClick: (date: string) => void;
}

function FinancialCalendarTable({ 
  staffId, 
  month, 
  year, 
  journalEntries, 
  payouts, 
  activities,
  auditMode,
  onPayoutCellClick 
}: FinancialCalendarTableProps) {
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const salaryActivityId = useMemo(
    () => activities.find((activity) => activity.category === 'salary')?.id || null,
    [activities]
  );
  
  // Group journal entries by activity + mode (auto/manual)
  const entriesByRow = useMemo(() => {
    const map = new Map<string, Map<string, number>>(); // rowKey -> date -> amount

    journalEntries.forEach(entry => {
      const activityId = entry.activity_id || 'none';
      const mode = entry.is_manual_override ? 'manual' : 'auto';
      const rowKey = `${activityId}:${mode}`;
      if (!map.has(rowKey)) {
        map.set(rowKey, new Map());
      }
      const activityMap = map.get(rowKey)!;
      const dateStr = entry.date;
      const currentAmount = activityMap.get(dateStr) || 0;
      activityMap.set(dateStr, currentAmount + (Number(entry.amount) || 0));
    });

    return map;
  }, [journalEntries]);

  const entryDetailsByRow = useMemo(() => {
    const map = new Map<string, Map<string, any[]>>();
    journalEntries.forEach((entry) => {
      const activityId = entry.activity_id || 'none';
      const mode = entry.is_manual_override ? 'manual' : 'auto';
      const rowKey = `${activityId}:${mode}`;
      if (!map.has(rowKey)) {
        map.set(rowKey, new Map());
      }
      const dateMap = map.get(rowKey)!;
      const dateStr = entry.date;
      const list = dateMap.get(dateStr) || [];
      list.push(entry);
      dateMap.set(dateStr, list);
    });
    return map;
  }, [journalEntries]);
  
  // Group payouts by date (filter by month) with notes, dates and amounts
  const payoutsByDate = useMemo(() => {
    const amountMap = new Map<string, number>();
    const notesMap = new Map<string, Array<{ note: string; date: string; amount: number }>>(); // date -> array of { note, date, amount }
    
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
    
    payouts.forEach(payout => {
      if (payout.payout_date >= startDate && payout.payout_date <= endDate) {
        const currentAmount = amountMap.get(payout.payout_date) || 0;
        amountMap.set(payout.payout_date, currentAmount + payout.amount);
        
        // Collect notes with dates and amounts for this date
        const existingNotes = notesMap.get(payout.payout_date) || [];
        notesMap.set(payout.payout_date, [...existingNotes, { 
          note: payout.notes ? payout.notes.trim() : '', 
          date: payout.payout_date,
          amount: payout.amount
        }]);
      }
    });
    return { amounts: amountMap, notes: notesMap };
  }, [payouts, month, year]);
  
  // Build rows for auto/manual entries per activity
  const activityRows = useMemo(() => {
    const rows = Array.from(entriesByRow.keys()).map((rowKey) => {
      const [activityId, mode] = rowKey.split(':');
      const isManual = mode === 'manual';
      const activity = activities.find(a => a.id === activityId);
      const baseName = activity ? activity.name : 'Без активності';
      const name = activityId === 'none'
        ? (isManual ? 'Ручні записи (без активності)' : 'Авто нарахування (без активності)')
        : `${baseName} — ${isManual ? 'ручні' : 'авто'}`;

      return {
        id: rowKey,
        name,
        source: 'staff-expenses' as const,
      };
    });

    rows.sort((a, b) => a.name.localeCompare(b.name, 'uk-UA'));
    return rows;
  }, [entriesByRow, activities]);
  
  const getDateString = (date: Date) => {
    return formatDateString(date);
  };

  const buildAuditLink = (target: 'staff-expenses' | 'salary-expenses', dateStr: string) => {
    if (target === 'salary-expenses' && salaryActivityId) {
      return `/activities/${salaryActivityId}/expenses?date=${dateStr}&staffId=${staffId}`;
    }
    return `/staff-expenses?date=${dateStr}&staffId=${staffId}`;
  };

  return (
    <TooltipProvider>
      <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px] sticky left-0 bg-background z-10">Активність / Виплати</TableHead>
            {days.map((date, index) => {
              const dateStr = getDateString(date);
              const isWeekendDay = isWeekend(date);
              return (
                <TableHead 
                  key={dateStr} 
                  className={cn(
                    "text-center min-w-[60px]",
                    isWeekendDay && WEEKEND_BG_COLOR
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{getWeekdayShort(date)}</span>
                    <span className="text-sm font-medium">{date.getDate()}</span>
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Activity rows */}
          {activityRows.length > 0 ? (
            activityRows.map(activity => {
              const activityEntries = entriesByRow.get(activity.id) || new Map();
              return (
                <TableRow key={activity.id}>
                  <TableCell className="font-medium sticky left-0 bg-background z-10">{activity.name}</TableCell>
                  {days.map((date) => {
                    const dateStr = getDateString(date);
                    const amount = activityEntries.get(dateStr) || 0;
                    const details = entryDetailsByRow.get(activity.id)?.get(dateStr) || [];
                    const hasDetails = details.length > 0;
                    return (
                      <TableCell 
                        key={dateStr} 
                        className={cn(
                          "text-center",
                          isWeekend(date) && WEEKEND_BG_COLOR
                        )}
                      >
                        {amount > 0 ? (
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              to={buildAuditLink('staff-expenses', dateStr)}
                              className="text-primary hover:underline"
                            >
                              {formatCurrency(amount)}
                            </Link>
                            {auditMode && hasDetails && (
                              <Tooltip>
                                <TooltipTrigger className="text-xs text-muted-foreground">i</TooltipTrigger>
                                <TooltipContent>
                                  <div className="space-y-1 text-xs">
                                    {details.map((entry, idx) => (
                                      <div key={`${entry.id}-${idx}`}>
                                        <div>{formatCurrency(entry.amount || 0)}</div>
                                        {entry.notes && (
                                          <div className="text-muted-foreground">{entry.notes}</div>
                                        )}
                                        {entry.deductions_applied?.length > 0 && (
                                          <div className="text-muted-foreground">
                                            Комісії: -{formatCurrency(entry.deductions_applied.reduce((sum: number, d: any) => sum + (d.amount || 0), 0))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        ) : '—'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={days.length + 1} className="text-center text-muted-foreground py-4">
                Немає нарахувань по активностях за цей місяць
              </TableCell>
            </TableRow>
          )}
          
          {/* Payouts row - always visible */}
          <TableRow className="bg-muted/20 font-semibold">
            <TableCell className="font-semibold sticky left-0 bg-muted/20 z-10">Виплати</TableCell>
            {days.map((date) => {
              const dateStr = getDateString(date);
              const amount = payoutsByDate.amounts.get(dateStr) || 0;
              const notes = payoutsByDate.notes.get(dateStr) || [];
              const hasNotes = notes.length > 0;
              
              const cellContent = amount > 0 ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-red-600 font-semibold">{formatCurrency(amount)}</span>
                  {auditMode && (
                    <Link
                      to={buildAuditLink('salary-expenses', dateStr)}
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      журнал
                    </Link>
                  )}
                  {auditMode && (hasNotes || notes.length > 0) && (
                    <Tooltip>
                      <TooltipTrigger
                        className="text-xs text-muted-foreground"
                        onClick={(event) => event.stopPropagation()}
                      >
                        i
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-1 text-xs">
                          {notes.map((item, idx) => (
                            <div key={`${item.date}-${idx}`}>
                              <div>{formatCurrency(item.amount)}</div>
                              {item.note && (
                                <div className="text-muted-foreground">{item.note}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              );
              
              return (
                <TableCell 
                  key={dateStr} 
                  className={cn(
                    "text-center cursor-pointer hover:bg-primary/10",
                    isWeekend(date) && WEEKEND_BG_COLOR
                  )}
                  onClick={() => onPayoutCellClick(dateStr)}
                >
                  {hasNotes ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>{cellContent}</div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="space-y-2">
                          <p className="font-semibold">Виплати:</p>
                          {notes.map((item, index) => (
                            <div key={index} className="space-y-0.5 border-b border-border/50 pb-1 last:border-0 last:pb-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                                <p className="text-sm font-semibold text-red-600">{formatCurrency(item.amount)}</p>
                              </div>
                              {item.note && (
                                <p className="text-sm">{item.note}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    cellContent
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        </TableBody>
      </Table>
    </div>
    </TooltipProvider>
  );
}
