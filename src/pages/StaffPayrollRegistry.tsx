import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useStaff } from '@/hooks/useStaff';
import { useAllStaffPayouts, useCreateStaffPayout } from '@/hooks/useStaffBilling';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/attendance';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

const payoutSchema = z.object({
  amount: z.number().min(0.01, 'Сума має бути більше 0'),
  payout_date: z.string().min(1, 'Оберіть дату'),
  notes: z.string().optional(),
});

type PayoutFormData = z.infer<typeof payoutSchema>;

export default function StaffPayrollRegistry() {
  const { data: staff = [] } = useStaff();
  
  // Month filter state
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  
  // Get all staff billing rules to determine which staff have rates configured
  const { data: allBillingRules = [] } = useQuery({
    queryKey: ['staff-billing-rules-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_billing_rules' as any)
        .select('staff_id')
        .limit(10000); // Get all rules
      
      if (error) throw error;
      return ((data as any) || []) as { staff_id: string }[];
    },
  });
  
  // Get all journal entries (cumulative, no month filter) - для балансу
  const { data: journalEntriesAll = [] } = useQuery({
    queryKey: ['staff-journal-entries-all-cumulative'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_journal_entries' as any)
        .select('staff_id, amount')
        .order('date', { ascending: true });
      
      if (error) throw error;
      return ((data as any) || []) as { staff_id: string; amount: number }[];
    },
  });
  
  // Get filtered journal entries (for display in table) - для відображення нарахувань за місяць
  const { data: journalEntriesFiltered = [] } = useQuery({
    queryKey: ['staff-journal-entries-filtered', filterMonth, filterYear],
    queryFn: async () => {
      const startDate = new Date(filterYear, filterMonth, 1).toISOString().split('T')[0];
      const endDate = new Date(filterYear, filterMonth + 1, 0).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('staff_journal_entries' as any)
        .select('staff_id, amount')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
      
      if (error) throw error;
      return ((data as any) || []) as { staff_id: string; amount: number }[];
    },
  });
  
  // Get all payouts (cumulative, no month filter) - для балансу
  const { data: payoutsAll = [] } = useAllStaffPayouts();
  
  // Get filtered payouts (for display in table) - для відображення виплат за місяць
  const { data: payoutsFiltered = [] } = useQuery({
    queryKey: ['staff-payouts-filtered', filterMonth, filterYear],
    queryFn: async () => {
      const startDate = new Date(filterYear, filterMonth, 1).toISOString().split('T')[0];
      const endDate = new Date(filterYear, filterMonth + 1, 0).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('staff_payouts' as any)
        .select('staff_id, amount')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .gte('payout_date', startDate)
        .lte('payout_date', endDate)
        .order('payout_date', { ascending: true });
      
      if (error) throw error;
      return ((data as any) || []) as { staff_id: string; amount: number }[];
    },
  });
  const createPayout = useCreateStaffPayout();
  
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PayoutFormData>({
    resolver: zodResolver(payoutSchema),
    defaultValues: {
      amount: 0,
      payout_date: new Date().toISOString().split('T')[0],
      notes: '',
    },
  });

  // Calculate cumulative balances for each staff member (за весь період)
  const staffBalances = useMemo(() => {
    const balances = new Map<string, { accrued: number; paid: number; balance: number; accruedMonth: number; paidMonth: number }>();
    
    // Initialize all active staff
    staff.filter(s => s.is_active).forEach(s => {
      balances.set(s.id, { accrued: 0, paid: 0, balance: 0, accruedMonth: 0, paidMonth: 0 });
    });
    
    // Sum all journal entries (accrued) - для балансу (весь період)
    journalEntriesAll.forEach(entry => {
      const current = balances.get(entry.staff_id) || { accrued: 0, paid: 0, balance: 0, accruedMonth: 0, paidMonth: 0 };
      current.accrued += entry.amount || 0;
      balances.set(entry.staff_id, current);
    });
    
    // Sum filtered journal entries (accrued) - для відображення за місяць
    journalEntriesFiltered.forEach(entry => {
      const current = balances.get(entry.staff_id) || { accrued: 0, paid: 0, balance: 0, accruedMonth: 0, paidMonth: 0 };
      current.accruedMonth += entry.amount || 0;
      balances.set(entry.staff_id, current);
    });
    
    // Sum all payouts (paid) - для балансу (весь період)
    payoutsAll.forEach(payout => {
      const current = balances.get(payout.staff_id) || { accrued: 0, paid: 0, balance: 0, accruedMonth: 0, paidMonth: 0 };
      current.paid += payout.amount || 0;
      balances.set(payout.staff_id, current);
    });
    
    // Sum filtered payouts (paid) - для відображення за місяць
    payoutsFiltered.forEach(payout => {
      const current = balances.get(payout.staff_id) || { accrued: 0, paid: 0, balance: 0, accruedMonth: 0, paidMonth: 0 };
      current.paidMonth += payout.amount || 0;
      balances.set(payout.staff_id, current);
    });
    
    // Calculate balance (за весь період)
    balances.forEach((value, key) => {
      value.balance = value.accrued - value.paid;
    });
    
    return balances;
  }, [staff, journalEntriesAll, payoutsAll, journalEntriesFiltered, payoutsFiltered]);

  const onSubmit = async (data: PayoutFormData) => {
    if (!selectedStaffId) return;
    
    try {
      await createPayout.mutateAsync({
        staff_id: selectedStaffId,
        amount: data.amount,
        payout_date: data.payout_date,
        notes: data.notes || null,
      });
      reset();
      setIsDialogOpen(false);
      setSelectedStaffId(null);
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  const handlePayClick = (staffId: string) => {
    setSelectedStaffId(staffId);
    setIsDialogOpen(true);
    reset({
      amount: 0,
      payout_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
  };

  const handlePrevMonth = () => {
    if (filterMonth === 0) {
      setFilterMonth(11);
      setFilterYear(filterYear - 1);
    } else {
      setFilterMonth(filterMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (filterMonth === 11) {
      setFilterMonth(0);
      setFilterYear(filterYear + 1);
    } else {
      setFilterMonth(filterMonth + 1);
    }
  };

  // Get set of staff IDs that have at least one billing rule configured
  const staffWithRates = useMemo(() => {
    const staffIdsSet = new Set<string>();
    allBillingRules.forEach(rule => {
      if (rule.staff_id) {
        staffIdsSet.add(rule.staff_id);
      }
    });
    return staffIdsSet;
  }, [allBillingRules]);
  
  // Filter: only active staff who have at least one billing rule configured
  const activeStaff = useMemo(() => {
    return staff.filter(s => s.is_active && staffWithRates.has(s.id));
  }, [staff, staffWithRates]);

  // Calculate totals for all columns
  const totals = useMemo(() => {
    let totalAccruedMonth = 0;
    let totalAccruedAll = 0;
    let totalPaidMonth = 0;
    let totalPaidAll = 0;
    let totalBalance = 0;

    activeStaff.forEach(staffMember => {
      const balance = staffBalances.get(staffMember.id) || { accrued: 0, paid: 0, balance: 0, accruedMonth: 0, paidMonth: 0 };
      totalAccruedMonth += balance.accruedMonth;
      totalAccruedAll += balance.accrued;
      totalPaidMonth += balance.paidMonth;
      totalPaidAll += balance.paid;
      totalBalance += balance.balance;
    });

    return {
      accruedMonth: totalAccruedMonth,
      accruedAll: totalAccruedAll,
      paidMonth: totalPaidMonth,
      paidAll: totalPaidAll,
      balance: totalBalance,
    };
  }, [activeStaff, staffBalances]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Ведомість зарплати" 
        description="Накопичувальні баланси та виплати персоналу"
      />
      
      {/* Month filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[150px] text-center">
            {MONTHS[filterMonth]} {filterYear}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Баланс відображається за весь період
        </p>
      </div>
      
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ПІБ</TableHead>
              <TableHead className="text-right">Нараховано</TableHead>
              <TableHead className="text-right">Виплачено</TableHead>
              <TableHead className="text-right">Баланс</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeStaff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Немає активних співробітників
                </TableCell>
              </TableRow>
            ) : (
              activeStaff.map((staffMember) => {
                const balance = staffBalances.get(staffMember.id) || { accrued: 0, paid: 0, balance: 0 };
                
                return (
                  <TableRow key={staffMember.id}>
                    <TableCell className="font-medium">
                      <Link 
                        to={`/staff/${staffMember.id}`}
                        className="text-primary hover:underline"
                      >
                        {staffMember.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span>{formatCurrency(balance.accruedMonth)}</span>
                        <span className="text-xs text-muted-foreground">всього: {formatCurrency(balance.accrued)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span>{formatCurrency(balance.paidMonth)}</span>
                        <span className="text-xs text-muted-foreground">всього: {formatCurrency(balance.paid)}</span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${balance.balance > 0 ? 'text-primary' : balance.balance < 0 ? 'text-red-500' : ''}`}>
                      {formatCurrency(balance.balance)}
                    </TableCell>
                    <TableCell>
                      <Dialog open={isDialogOpen && selectedStaffId === staffMember.id} onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (!open) setSelectedStaffId(null);
                      }}>
                        <DialogTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handlePayClick(staffMember.id)}
                          >
                            Виплатити
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Реєстрація виплати</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div>
                              <Label htmlFor="amount">Сума (₴)</Label>
                              <Input
                                id="amount"
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
                              <Label htmlFor="notes">Примітки (необов'язково)</Label>
                              <Textarea
                                id="notes"
                                {...register('notes')}
                                rows={3}
                              />
                            </div>
                            
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setIsDialogOpen(false);
                                  setSelectedStaffId(null);
                                }}
                              >
                                Скасувати
                              </Button>
                              <Button type="submit" disabled={createPayout.isPending}>
                                {createPayout.isPending ? 'Збереження...' : 'Зберегти'}
                              </Button>
                            </div>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
            {/* Totals row */}
            {activeStaff.length > 0 && (
              <TableRow className="bg-muted/50 font-semibold border-t-2">
                <TableCell className="font-semibold">
                  Всього
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end">
                    <span>{formatCurrency(totals.accruedMonth)}</span>
                    <span className="text-xs text-muted-foreground">всього: {formatCurrency(totals.accruedAll)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end">
                    <span>{formatCurrency(totals.paidMonth)}</span>
                    <span className="text-xs text-muted-foreground">всього: {formatCurrency(totals.paidAll)}</span>
                  </div>
                </TableCell>
                <TableCell className={`text-right font-semibold ${totals.balance > 0 ? 'text-primary' : totals.balance < 0 ? 'text-red-500' : ''}`}>
                  {formatCurrency(totals.balance)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
