import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Banknote, Unlink, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useActivity } from '@/hooks/useActivities';
import { useCommissionEntry, useCommissionsForSalaryTransactions } from '@/hooks/useCommissionEntry';
import { useFinanceTransactions, useCreateFinanceTransaction, useUpdateFinanceTransaction, useDeleteFinanceTransaction, type TransactionType } from '@/hooks/useFinanceTransactions';
import { useExpenseCategories, useCreateExpenseCategory } from '@/hooks/useExpenseCategories';
import { useExpenseArticles, useCreateExpenseArticle, useUpdateExpenseArticle, useDeleteExpenseArticle } from '@/hooks/useExpenseArticles';
import { useExpenseJournalEntries, useUpsertExpenseJournalEntry, useDeleteExpenseJournalEntry } from '@/hooks/useExpenseJournalEntries';
import { useStaff } from '@/hooks/useStaff';
import { usePaymentAccounts } from '@/hooks/usePaymentAccounts';
import { useCreateStaffPayout, useUpdateStaffPayout, useDeleteStaffPayout } from '@/hooks/useStaffBilling';
import { useDividendParticipants, useDividendSettings, useCreateDividendPayout, useUpdateDividendPayout, useDeleteDividendPayout } from '@/hooks/useDividendJournal';
import { DividendPayoutFormDialog } from '@/components/dividend/DividendPayoutFormDialog';
import { PayrollPayoutDialog } from '@/components/staff/PayrollPayoutDialog';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, formatDateString, getDaysInMonth, getMonthStartDate, getMonthEndDate, getWeekdayShort, isWeekend, WEEKEND_BG_COLOR } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resolvePayrollPayoutPrefill, type ResolvedPayrollPayoutPrefill } from '@/lib/payrollPayoutContract';
import { toast } from '@/hooks/use-toast';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

const EMPTY_ARRAY: never[] = [];
const ACTIVITY_EXPENSE_QUERY_KEYS = {
  salaryPayoutRows: 'salary-payout-rows',
  salaryTxForPayouts: 'salary-tx-for-payouts',
  salaryTxMetaForPayouts: 'salary-tx-meta-for-payouts',
  staffPayoutsAll: 'staff-payouts-all',
  staffPayouts: 'staff-payouts',
  financeTransactions: 'finance_transactions',
} as const;

const getTransactionTypeForCategory = (category: string | null): TransactionType => {
  if (category === 'salary') return 'salary';
  if (category === 'household_expense') return 'household';
  return 'expense';
};

const toPayoutId = (value: string) => value.replace('payout-', '');

const formatCurrency = (amount: number, includeSymbol = true): string => {
  const formatted = new Intl.NumberFormat('uk-UA', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return includeSymbol ? `${formatted} ₴` : formatted;
};

const normalizePayoutPeriodValue = (value?: string | null) =>
  value && value.trim().length > 0 ? value : null;

type AdvanceOperationMode = 'expense' | 'advance_issue';

export default function ActivityExpenseJournal() {
  const { id } = useParams<{ id: string }>();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [advanceMode, setAdvanceMode] = useState<AdvanceOperationMode>('expense');
  const [useAdvanceForExpense, setUseAdvanceForExpense] = useState(true);
  const [date, setDate] = useState(formatDateString(now));
  const [description, setDescription] = useState('');
  const [staffId, setStaffId] = useState('');
  const [categoryId, setCategoryId] = useState<string>('none');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [filterStaffId, setFilterStaffId] = useState<string>('all');
  const [filterAccountId, setFilterAccountId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'staff' | 'amount'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [articleName, setArticleName] = useState('');
  const [articleMode, setArticleMode] = useState<'rate' | 'manual'>('rate');
  const [articleRate, setArticleRate] = useState('0');
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(null);
  const [cellValues, setCellValues] = useState<Record<string, string>>({});
  const [cellAccountIds, setCellAccountIds] = useState<Record<string, string | null>>({});
  const [selectedAccountId, setSelectedAccountId] = useState<string>('none');
  const [commission, setCommission] = useState('');
  const [payoutForPeriod, setPayoutForPeriod] = useState('');
  const [salaryFormErrors, setSalaryFormErrors] = useState<Record<string, { message: string }>>({});
  const [salaryPrefill, setSalaryPrefill] = useState<ResolvedPayrollPayoutPrefill>({
    source: 'activity-expense-journal',
    staffId: undefined,
    payoutDate: undefined,
    accountId: undefined,
    subcategoryId: null,
    lockStaff: false,
  });
  const [dividendDialogOpen, setDividendDialogOpen] = useState(false);
  const [dividendSource, setDividendSource] = useState<{ source: 'transaction' | 'payout'; id: string } | null>(null);
  const [dividendInitialValues, setDividendInitialValues] = useState<{ payout_date: string; total_amount: number; account_id: string | null } | null>(null);

  const { data: activity } = useActivity(id || '');
  const { data: dividendParticipants = [] } = useDividendParticipants();
  const { data: dividendSettings } = useDividendSettings();
  const queryClient = useQueryClient();
  const createDividendPayout = useCreateDividendPayout();
  const updateDividendPayout = useUpdateDividendPayout();
  const deleteDividendPayout = useDeleteDividendPayout();
  const { data: accounts = [] } = usePaymentAccounts();
  const { data: staff = [] } = useStaff();

  // Инициализируем selectedAccountId при изменении активности
  useEffect(() => {
    if (activity?.account_id) {
      setSelectedAccountId(activity.account_id);
    } else {
      setSelectedAccountId('none');
    }
  }, [activity?.account_id]);
  const { data: categories = [] } = useExpenseCategories(id);
  const createCategory = useCreateExpenseCategory();
  const createTransaction = useCreateFinanceTransaction();
  const updateTransaction = useUpdateFinanceTransaction();
  const deleteTransaction = useDeleteFinanceTransaction();
  const syncCommission = useCommissionEntry();
  const createPayout = useCreateStaffPayout();
  const updatePayout = useUpdateStaffPayout();
  const deletePayout = useDeleteStaffPayout();
  const { data: expenseArticles = [] } = useExpenseArticles(id);
  const createExpenseArticle = useCreateExpenseArticle();
  const updateExpenseArticle = useUpdateExpenseArticle();
  const deleteExpenseArticle = useDeleteExpenseArticle();
  const { data: journalEntriesData } = useExpenseJournalEntries(id, month, year);
  const journalEntries = journalEntriesData ?? EMPTY_ARRAY;
  const upsertJournalEntry = useUpsertExpenseJournalEntry();
  const deleteJournalEntry = useDeleteExpenseJournalEntry();

  const transactionType = getTransactionTypeForCategory(activity?.category || null);
  const isSalary = activity?.category === 'salary';
  const isHousehold = activity?.category === 'household_expense';
  const isActualExpense = activity?.is_actual_expense || false; // Показывать выбор счета только для факта

  const { data: transactions = [], isLoading } = useFinanceTransactions({
    activityId: id,
    month,
    year,
    type: transactionType,
    enabled: !isSalary,
  });

  const { data: advanceTransactionsAll = [] } = useQuery({
    queryKey: ['finance_transactions', 'expense-advance-transactions-all', id, transactionType],
    queryFn: async () => {
      if (!id || isSalary) return [];
      const { data, error } = await supabase
        .from('finance_transactions' as any)
        .select('id, date, expense_category_id, expense_advance_type, amount, real_amount, advance_consumed_amount')
        .eq('activity_id', id)
        .eq('type', transactionType)
        .not('expense_advance_type', 'is', null);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        date: string;
        expense_category_id: string | null;
        expense_advance_type: 'issue' | 'spend' | null;
        amount: number | null;
        real_amount: number | null;
        advance_consumed_amount: number | null;
      }>;
    },
    enabled: !!id && !isSalary,
  });

  const { data: salaryPayoutRows = [], isLoading: isSalaryPayoutsLoading } = useQuery({
    queryKey: [ACTIVITY_EXPENSE_QUERY_KEYS.salaryPayoutRows, month, year],
    queryFn: async () => {
      const startDate = getMonthStartDate(year, month);
      const endDate = getMonthEndDate(year, month);
      const { data: payouts, error } = await supabase
        .from('staff_payouts' as any)
        .select('id, staff_id, payout_date, payout_for_period, amount, notes, account_id, dividend_payout_id')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .gte('payout_date', startDate)
        .lte('payout_date', endDate);
      if (error) throw error;

      const payoutIds = ((payouts as any[]) || []).map((p) => p.id);
      const txByPayoutId = new Map<string, any>();
      if (payoutIds.length > 0) {
        const { data: txs, error: txError } = await supabase
          .from('finance_transactions' as any)
          .select('id, staff_payout_id, expense_category_id, dividend_payout_id')
          .eq('type', 'salary')
          .in('staff_payout_id', payoutIds);
        if (txError) throw txError;
        (txs || []).forEach((tx: any) => {
          if (tx.staff_payout_id) txByPayoutId.set(tx.staff_payout_id, tx);
        });
      }

      return ((payouts as any[]) || []).map((payout) => {
        const tx = txByPayoutId.get(payout.id);
        return {
          id: `payout-${payout.id}`,
          source: 'payout' as const,
          staff_id: payout.staff_id,
          amount: payout.amount,
          date: payout.payout_date,
          payout_for_period: payout.payout_for_period || null,
          description: payout.notes || 'Виплата зарплати',
          account_id: payout.account_id || null,
          dividend_payout_id: payout.dividend_payout_id ?? tx?.dividend_payout_id ?? null,
          expense_category_id: tx?.expense_category_id ?? null,
          salary_transaction_id: tx?.id ?? undefined,
        };
      });
    },
    enabled: isSalary,
  });

  const categoriesMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const advanceBalanceByCategory = useMemo(() => {
    const map = new Map<string, number>();
    advanceTransactionsAll.forEach((tx) => {
      const key = tx.expense_category_id || 'none';
      const current = map.get(key) || 0;
      if (tx.expense_advance_type === 'issue') {
        map.set(key, current + (tx.amount || 0));
      } else if (tx.expense_advance_type === 'spend') {
        map.set(key, current - (tx.advance_consumed_amount || 0));
      }
    });
    return map;
  }, [advanceTransactionsAll]);

  const selectedAdvanceBalance = useMemo(() => {
    if (isSalary || categoryId === 'new') return 0;
    const key = categoryId === 'none' ? 'none' : categoryId;
    return advanceBalanceByCategory.get(key) || 0;
  }, [isSalary, categoryId, advanceBalanceByCategory]);

  const selectedAdvanceBalanceForDate = useMemo(() => {
    if (isSalary || categoryId === 'new') return 0;
    const key = categoryId === 'none' ? null : categoryId;
    const sorted = [...advanceTransactionsAll]
      .filter((tx) => (tx.expense_category_id || null) === key)
      .filter((tx) => tx.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date));
    return sorted.reduce((acc, tx) => {
      if (tx.expense_advance_type === 'issue') return acc + (tx.amount || 0);
      if (tx.expense_advance_type === 'spend') return acc - (tx.advance_consumed_amount || 0);
      return acc;
    }, 0);
  }, [isSalary, categoryId, advanceTransactionsAll, date]);

  // Остаток авансу по підкатегорії після конкретної операції
  const getAdvanceBalanceAfterTransaction = useCallback(
    (tx: any): number => {
      if (isSalary || !tx) return 0;
      const key = tx.expense_category_id || null;

      const sorted = [...advanceTransactionsAll]
        .filter((row) => (row.expense_category_id || null) === key)
        .sort((a, b) => {
          if (a.date === b.date) {
            return (a.id || '').localeCompare(b.id || '');
          }
          return a.date.localeCompare(b.date);
        });

      let balance = 0;
      for (const row of sorted) {
        if (row.expense_advance_type === 'issue') {
          balance += row.amount || 0;
        } else if (row.expense_advance_type === 'spend') {
          balance -= row.advance_consumed_amount || 0;
        }
        if (row.id === tx.id) break;
      }

      return balance;
    },
    [advanceTransactionsAll, isSalary],
  );

  const combinedTransactions = useMemo(() => {
    if (!isSalary) return transactions;
    return salaryPayoutRows;
  }, [transactions, isSalary, salaryPayoutRows]);

  const salaryTxIds = useMemo(
    () =>
      isSalary
        ? combinedTransactions
            .map((t) => ('salary_transaction_id' in t ? t.salary_transaction_id : t.id))
            .filter(Boolean) as string[]
        : [],
    [combinedTransactions, isSalary]
  );
  const { data: commissionsMap = new Map<string, { amount: number; id: string }>() } =
    useCommissionsForSalaryTransactions(salaryTxIds);

  const filteredTransactions = useMemo(() => {
    let list = combinedTransactions.filter((t) => {
      const matchesCategory =
        filterCategoryId === 'all' ||
        (filterCategoryId === 'none' && !t.expense_category_id) ||
        t.expense_category_id === filterCategoryId;
      const matchesStaff =
        filterStaffId === 'all' ||
        (filterStaffId === 'none' && !t.staff_id) ||
        t.staff_id === filterStaffId;
      const matchesAccount =
        filterAccountId === 'all' ||
        (filterAccountId === 'none' && !t.account_id) ||
        t.account_id === filterAccountId;
      const matchesSearch =
        !search.trim() ||
        (t.description || '').toLowerCase().includes(search.trim().toLowerCase());
      return matchesCategory && matchesStaff && matchesAccount && matchesSearch;
    });
    const cmp = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortBy === 'date') {
        return cmp * (a.date.localeCompare(b.date) || 0);
      }
      if (sortBy === 'staff') {
        const na = a.staff_id ? (staff.find((s) => s.id === a.staff_id)?.full_name || '') : '';
        const nb = b.staff_id ? (staff.find((s) => s.id === b.staff_id)?.full_name || '') : '';
        return cmp * na.localeCompare(nb, 'uk-UA');
      }
      if (sortBy === 'amount') {
        return cmp * ((a.amount || 0) - (b.amount || 0));
      }
      return 0;
    });
    return list;
  }, [combinedTransactions, filterCategoryId, filterStaffId, filterAccountId, search, sortBy, sortDir, staff]);

  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, typeof combinedTransactions>();
    filteredTransactions.forEach((t) => {
      const key = t.expense_category_id || 'none';
      const list = groups.get(key) || [];
      list.push(t);
      groups.set(key, list);
    });
    return groups;
  }, [filteredTransactions]);

  const totalAmount = useMemo(
    () => filteredTransactions.reduce((sum, t) => sum + (t.amount || 0), 0),
    [filteredTransactions]
  );
  const isTransactionsLoading = isSalary ? isSalaryPayoutsLoading : isLoading;

  const defaultCleaning = dividendSettings?.default_cleaning_percent ?? 20;

  const handleDividendCreateSuccess = async (payoutId: string) => {
    if (!dividendSource) return;
    try {
      if (dividendSource.source === 'payout') {
        await updatePayout.mutateAsync({ id: dividendSource.id, dividend_payout_id: payoutId });
      } else {
        await updateTransaction.mutateAsync({ id: dividendSource.id, dividend_payout_id: payoutId });
      }
      setDividendSource(null);
      setDividendInitialValues(null);
      toast({ title: 'Витрату позначено як виведену як дівіденд' });
    } catch (e: any) {
      toast({ title: 'Помилка прив’язки', description: e?.message, variant: 'destructive' });
    }
  };

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const journalMap = useMemo(() => {
    const map = new Map<string, { quantity: number | null; amount: number }>();
    journalEntries.forEach((entry) => {
      map.set(`${entry.expense_article_id}-${entry.entry_date}`, {
        quantity: entry.quantity,
        amount: entry.amount,
      });
    });
    return map;
  }, [journalEntries]);

  useEffect(() => {
    if (!journalEntries.length) {
      setCellValues({});
      setCellAccountIds({});
      return;
    }
    const next: Record<string, string> = {};
    const nextAccountIds: Record<string, string | null> = {};
    journalEntries.forEach((entry) => {
      const key = `${entry.expense_article_id}-${entry.entry_date}`;
      if (entry.quantity !== null && entry.quantity !== undefined) {
        next[key] = String(entry.quantity);
      } else {
        next[key] = String(entry.amount);
      }
      // Инициализируем account_id из записи (если есть) или из активности
      if (isActualExpense) {
        nextAccountIds[key] = entry.account_id || activity?.account_id || null;
      }
    });
    setCellValues(next);
    setCellAccountIds(nextAccountIds);
  }, [journalEntries, isActualExpense, activity?.account_id]);

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const resetForm = () => {
    setAmount('');
    setAdvanceMode('expense');
    setUseAdvanceForExpense(true);
    setCommission('');
    setPayoutForPeriod('');
    setDate(formatDateString(new Date()));
    setDescription('');
    setStaffId('');
    setCategoryId('none');
    setNewCategoryName('');
    setEditingId(null);
    setSelectedAccountId(activity?.account_id || 'none');
    setSalaryFormErrors({});
  };

  const handleSubmit = async () => {
    if (!id || !amount) return;
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: 'Некоректна сума',
        description: 'Сума має бути більше 0',
        variant: 'destructive',
      });
      return;
    }

    if (isSalary) {
      const nextErrors: Record<string, { message: string }> = {};
      if (!staffId) nextErrors.staff_id = { message: 'Оберіть співробітника' };
      if (!date) nextErrors.payout_date = { message: 'Оберіть дату' };
      if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        nextErrors.amount = { message: 'Сума має бути більше 0' };
      }
      const effectiveAccountId =
        selectedAccountId === 'none' ? (activity?.account_id || null) : selectedAccountId;
      if (!effectiveAccountId) {
        nextErrors.account_id = { message: 'Оберіть рахунок' };
      }
      if (Object.keys(nextErrors).length > 0) {
        setSalaryFormErrors(nextErrors);
        return;
      }
      setSalaryFormErrors({});
    }

    let finalCategoryId: string | null = categoryId === 'none' ? null : categoryId;

    if (categoryId === 'new' && newCategoryName.trim()) {
      const created = await createCategory.mutateAsync({
        activity_id: id,
        name: newCategoryName.trim(),
      });
      finalCategoryId = created.id;
    }

    // Определяем account_id для транзакции (для факта или зарплаты)
    const accountId = (isActualExpense || isSalary)
      ? (selectedAccountId === 'none' ? (activity?.account_id || null) : selectedAccountId)
      : null;

    let salaryTransactionId = '';
    if (isSalary) {
      if (editingId && editingId.startsWith('payout-')) {
        const payoutId = toPayoutId(editingId);
        await updatePayout.mutateAsync({
          id: payoutId,
          staff_id: staffId || null,
          amount: parsedAmount,
          payout_date: date,
          payout_for_period: normalizePayoutPeriodValue(payoutForPeriod),
          notes: description || null,
          account_id: accountId,
          expense_category_id: finalCategoryId,
        });
        const editedRow = combinedTransactions.find((t) => t.id === editingId);
        salaryTransactionId = ('salary_transaction_id' in (editedRow || {}) ? (editedRow as any)?.salary_transaction_id : undefined) || '';
      } else {
        const created = await createPayout.mutateAsync({
          staff_id: staffId || '',
          amount: parsedAmount,
          payout_date: date,
          payout_for_period: normalizePayoutPeriodValue(payoutForPeriod),
          notes: description || null,
          account_id: accountId,
          expense_category_id: finalCategoryId,
        });
        salaryTransactionId = (created as any).salaryTransactionId || '';
      }
    } else if (advanceMode === 'advance_issue') {
      const payload = {
        type: transactionType,
        activity_id: id,
        staff_id: null,
        student_id: null,
        expense_category_id: finalCategoryId,
        amount: parsedAmount,
        date,
        description: description || 'Видача авансу',
        category: null,
        account_id: accountId,
        expense_advance_type: 'issue' as const,
        real_amount: null,
        advance_consumed_amount: null,
      };
      if (editingId) {
        await updateTransaction.mutateAsync({
          id: editingId,
          ...payload,
        } as any);
      } else {
        await createTransaction.mutateAsync(payload as any);
      }
    } else if (editingId) {
      // Редагування існуючої витрати
      const canUseAdvanceOnEdit =
        !isSalary && advanceMode === 'expense' && useAdvanceForExpense && categoryId !== 'new' && categoryId !== '';

      if (canUseAdvanceOnEdit) {
        // Оновлюємо витрату, списану з авансу (перерахунок сум)
        const available = Math.max(0, selectedAdvanceBalanceForDate);
        const consumedFromAdvance = Math.min(available, parsedAmount);
        const accountCharge = Math.max(0, parsedAmount - consumedFromAdvance);

        if (consumedFromAdvance > 0 && accountCharge > 0) {
          toast({
            title: 'Недостатньо авансу',
            description: `З авансу списано ${formatCurrency(consumedFromAdvance)}, доплата з рахунку ${formatCurrency(accountCharge)}.`,
          });
        } else if (consumedFromAdvance > 0 && accountCharge === 0) {
          toast({
            title: 'Покупка покрита авансом',
            description: `З авансу списано ${formatCurrency(consumedFromAdvance)}.`,
          });
        }

        await updateTransaction.mutateAsync({
          id: editingId,
          type: transactionType,
          activity_id: id,
          staff_id: null,
          student_id: null,
          expense_category_id: finalCategoryId,
          amount: accountCharge,
          date,
          description: description || 'Покупка з авансу',
          category: null,
          account_id: accountId,
          expense_advance_type: 'spend',
          real_amount: parsedAmount,
          advance_consumed_amount: consumedFromAdvance,
        } as any);
        salaryTransactionId = editingId;
      } else {
        // Оновлюємо звичайну витрату (без авансу)
        await updateTransaction.mutateAsync({
          id: editingId,
          type: transactionType,
          activity_id: id,
          staff_id: null,
          student_id: null,
          expense_category_id: finalCategoryId,
          amount: parsedAmount,
          date,
          description: description || null,
          category: null,
          account_id: accountId,
          expense_advance_type: null,
          real_amount: null,
          advance_consumed_amount: null,
        } as any);
        salaryTransactionId = editingId;
      }
    } else {
      const canUseAdvance = useAdvanceForExpense && categoryId !== 'new' && categoryId !== '';
      if (canUseAdvance) {
        const available = Math.max(0, selectedAdvanceBalanceForDate);
        const consumedFromAdvance = Math.min(available, parsedAmount);
        const accountCharge = Math.max(0, parsedAmount - consumedFromAdvance);

        if (consumedFromAdvance > 0 && accountCharge > 0) {
          toast({
            title: 'Недостатньо авансу',
            description: `З авансу списано ${formatCurrency(consumedFromAdvance)}, доплата з рахунку ${formatCurrency(accountCharge)}.`,
          });
        } else if (consumedFromAdvance > 0 && accountCharge === 0) {
          toast({
            title: 'Покупка покрита авансом',
            description: `З авансу списано ${formatCurrency(consumedFromAdvance)}.`,
          });
        }

        const created = await createTransaction.mutateAsync({
          type: transactionType,
          activity_id: id,
          staff_id: null,
          student_id: null,
          expense_category_id: finalCategoryId,
          amount: accountCharge,
          date,
          description: description || 'Покупка з авансу',
          category: null,
          account_id: accountId,
          expense_advance_type: 'spend',
          real_amount: parsedAmount,
          advance_consumed_amount: consumedFromAdvance,
        } as any);
        salaryTransactionId = created.id;
      } else {
        const created = await createTransaction.mutateAsync({
          type: transactionType,
          activity_id: id,
          staff_id: null,
          student_id: null,
          expense_category_id: finalCategoryId,
          amount: parsedAmount,
          date,
          description: description || null,
          category: null,
          account_id: accountId,
          expense_advance_type: null,
          real_amount: null,
          advance_consumed_amount: null,
        } as any);
        salaryTransactionId = created.id;
      }
    }

    const commissionAmount = parseFloat(commission || '0');
    const staffName = staffId ? staff.find((s) => s.id === staffId)?.full_name ?? 'невідомий' : 'невідомий';
    if (isSalary && salaryTransactionId) {
      await syncCommission.mutateAsync({
        salaryTransactionId,
        amount: commissionAmount,
        date,
        accountId,
        staffName,
      });
    }

    resetForm();
    setDialogOpen(false);
  };

  const salaryDialogItemsForDate = useMemo(
    () =>
      isSalary && dialogOpen
        ? combinedTransactions.filter(
            (t) =>
              t.date === date &&
              (!staffId || !t.staff_id || t.staff_id === staffId),
          )
        : [],
    [combinedTransactions, isSalary, date, dialogOpen, staffId]
  );
  const salaryDialogTxIdMap = useMemo(() => {
    const map = new Map<string, string>();
    salaryDialogItemsForDate.forEach((item: any) => {
      if (item?.salary_transaction_id) map.set(item.id, item.salary_transaction_id);
    });
    return map;
  }, [salaryDialogItemsForDate]);

  const closeSalaryDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  if (!activity) {
    return (
      <>
        <PageHeader title="Журнал витрат" description="Активність не знайдена" />
        <div className="p-8 text-muted-foreground">
          <Link to="/activities" className="text-primary hover:underline">Повернутися до активностей</Link>
        </div>
      </>
    );
  }

  const resetArticleForm = () => {
    setArticleName('');
    setArticleMode('rate');
    setArticleRate('0');
    setEditingArticleId(null);
  };

  const handleArticleSubmit = async () => {
    if (!id || !articleName.trim()) return;
    const payload = {
      activity_id: id,
      name: articleName.trim(),
      input_mode: articleMode,
      rate: parseFloat(articleRate) || 0,
    };
    if (editingArticleId) {
      await updateExpenseArticle.mutateAsync({ id: editingArticleId, ...payload });
    } else {
      await createExpenseArticle.mutateAsync(payload);
    }
    resetArticleForm();
    setArticleDialogOpen(false);
  };

  const handleDeleteArticle = async () => {
    if (!deletingArticleId || !id) return;
    await deleteExpenseArticle.mutateAsync({ id: deletingArticleId, activityId: id });
    setDeletingArticleId(null);
  };

  const handleCellChange = (articleId: string, dateStr: string, value: string) => {
    setCellValues((prev) => ({
      ...prev,
      [`${articleId}-${dateStr}`]: value,
    }));
  };

  const handleCellBlur = async (articleId: string, dateStr: string) => {
    if (!id) return;
    const article = expenseArticles.find((item) => item.id === articleId);
    if (!article) return;
    const key = `${articleId}-${dateStr}`;
    const raw = cellValues[key];
    const parsed = raw === undefined || raw === '' ? 0 : Number(raw);
    if (!parsed || Number.isNaN(parsed)) {
      await deleteJournalEntry.mutateAsync({ activityId: id, articleId, date: dateStr });
      return;
    }

    const quantity = article.input_mode === 'rate' ? Math.max(0, Math.round(parsed)) : null;
    const amount = article.input_mode === 'rate'
      ? (quantity || 0) * (article.rate || 0)
      : Math.max(0, parsed);

    // Получаем account_id для этой ячейки (если не указан, используем дефолт из активности)
    const accountId = cellAccountIds[key] !== undefined 
      ? (cellAccountIds[key] === 'none' ? null : cellAccountIds[key])
      : (activity?.account_id || null);

    await upsertJournalEntry.mutateAsync({
      activity_id: id,
      expense_article_id: articleId,
      entry_date: dateStr,
      quantity,
      amount,
      description: `Стаття: ${article.name}`,
      quantityLabel: quantity !== null ? `${quantity} од.` : null,
      account_id: isActualExpense ? accountId : undefined, // Только для факта
    });
  };

  const handleAccountChange = (articleId: string, dateStr: string, accountId: string | null) => {
    const key = `${articleId}-${dateStr}`;
    setCellAccountIds((prev) => ({
      ...prev,
      [key]: accountId,
    }));
  };

  if (isHousehold) {
    const householdTotal = journalEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);

    return (
      <>
        <PageHeader
          title={`Журнал витрат: ${activity.name}`}
          description={`${MONTHS[month]} ${year}`}
          actions={(
            <Button onClick={() => setArticleDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Додати статтю
            </Button>
          )}
        />

        <div className="p-8 space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold">{MONTHS[month]} {year}</h2>
            <Button variant="outline" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-xl bg-card border border-border p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">Разом за місяць</div>
            <div className="text-2xl font-semibold text-destructive">{formatCurrency(householdTotal)}</div>
          </div>

          <div className="rounded-xl bg-card border border-border p-4 space-y-3">
            <div className="text-sm font-medium">Статті витрат</div>
            {expenseArticles.length === 0 ? (
              <div className="text-sm text-muted-foreground">Додайте статті витрат, щоб вести журнал.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {expenseArticles.map((article) => (
                  <div key={article.id} className="rounded-lg border p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{article.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {article.input_mode === 'rate'
                          ? `Ставка: ${formatCurrency(article.rate)}`
                          : 'Ручний ввід'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon" onClick={() => {
                        setEditingArticleId(article.id);
                        setArticleName(article.name);
                        setArticleMode(article.input_mode);
                        setArticleRate(String(article.rate || 0));
                        setArticleDialogOpen(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="text-destructive" onClick={() => setDeletingArticleId(article.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {expenseArticles.length > 0 && (
            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full border-collapse">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left text-sm font-medium text-muted-foreground min-w-[220px]">
                      Стаття
                    </th>
                    {isActualExpense && (
                      <th className="sticky left-[220px] z-10 bg-muted/50 px-2 py-3 text-left text-sm font-medium text-muted-foreground min-w-[150px]">
                        Рахунок
                      </th>
                    )}
                    {days.map((day) => (
                      <th
                        key={formatDateString(day)}
                        className={cn(
                          'px-1 py-2 text-center text-xs font-medium min-w-[56px]',
                          isWeekend(day)
                            ? `text-muted-foreground/50 ${WEEKEND_BG_COLOR}`
                            : 'text-muted-foreground'
                        )}
                      >
                        <div>{getWeekdayShort(day)}</div>
                        <div className="font-semibold">{day.getDate()}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenseArticles.map((article) => (
                    <tr key={article.id} className="border-t">
                      <td className="sticky left-0 z-10 bg-card px-4 py-3 text-sm font-medium">
                        <div>{article.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {article.input_mode === 'rate'
                            ? `× ${formatCurrency(article.rate)}`
                            : 'Ручний ввід'}
                        </div>
                      </td>
                      {isActualExpense && (
                        <td className="sticky left-[220px] z-10 bg-card px-2 py-3">
                          <div className="text-xs text-muted-foreground">
                            {activity?.account_id 
                              ? accounts.find(a => a.id === activity.account_id)?.name || 'Без рахунку'
                              : 'Без рахунку'}
                          </div>
                          <div className="text-[10px] text-muted-foreground/70 mt-1">
                            (можна змінити в налаштуваннях активності)
                          </div>
                        </td>
                      )}
                      {days.map((day) => {
                        const dateStr = formatDateString(day);
                        const key = `${article.id}-${dateStr}`;
                        const value = cellValues[key] ?? '';
                        const record = journalMap.get(key);
                        return (
                          <td
                            key={dateStr}
                            className={cn(
                              'px-1 py-1 text-center',
                              isWeekend(day) && WEEKEND_BG_COLOR
                            )}
                          >
                            <Input
                              type="number"
                              min="0"
                              step={article.input_mode === 'rate' ? '1' : '0.01'}
                              value={value}
                              onChange={(event) => handleCellChange(article.id, dateStr, event.target.value)}
                              onBlur={() => handleCellBlur(article.id, dateStr)}
                              className="h-8 w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            {article.input_mode === 'rate' && record?.amount ? (
                              <div className="text-[10px] text-muted-foreground">
                                {formatCurrency(record.amount)}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Dialog open={articleDialogOpen} onOpenChange={(open) => {
          setArticleDialogOpen(open);
          if (!open) resetArticleForm();
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingArticleId ? 'Редагувати статтю' : 'Нова стаття витрат'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Назва</Label>
                <Input value={articleName} onChange={(e) => setArticleName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Тип вводу</Label>
                <Select value={articleMode} onValueChange={(value) => setArticleMode(value as 'rate' | 'manual')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rate">Ставка × кількість</SelectItem>
                    <SelectItem value="manual">Ручний ввід суми</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {articleMode === 'rate' && (
                <div className="space-y-2">
                  <Label>Ставка (₴)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={articleRate}
                    onChange={(e) => setArticleRate(e.target.value)}
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setArticleDialogOpen(false)}>
                  Скасувати
                </Button>
                <Button onClick={handleArticleSubmit}>
                  {editingArticleId ? 'Зберегти' : 'Створити'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deletingArticleId} onOpenChange={() => setDeletingArticleId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Видалити статтю?</DialogTitle>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeletingArticleId(null)}>
                Скасувати
              </Button>
              <Button variant="destructive" onClick={handleDeleteArticle}>
                Видалити
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Журнал витрат: ${activity.name}`}
        description={`${MONTHS[month]} ${year}`}
        actions={
          <Button onClick={() => {
            if (isSalary) {
              const filteredStaffId =
                filterStaffId !== 'all' && filterStaffId !== 'none' ? filterStaffId : undefined;
              const prefill = resolvePayrollPayoutPrefill({
                source: 'activity-expense-journal',
                staffId: filteredStaffId,
                payoutDate: formatDateString(new Date()),
                accountId: activity?.account_id || undefined,
                subcategoryId: null,
              });
              setSalaryPrefill(prefill);
              resetForm();
              setStaffId(prefill.staffId || '');
              setDate(prefill.payoutDate || formatDateString(new Date()));
              setPayoutForPeriod('');
              setSelectedAccountId(prefill.accountId || activity?.account_id || 'none');
              setCategoryId(prefill.subcategoryId || 'none');
            } else {
              resetForm();
              setAdvanceMode('expense');
              setUseAdvanceForExpense(true);
            }
            setDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Додати витрату
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">{MONTHS[month]} {year}</h2>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="rounded-xl bg-card border border-border p-4 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">Разом за місяць</div>
            <div className="text-2xl font-semibold text-destructive">{formatCurrency(totalAmount)}</div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filterCategoryId === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterCategoryId('all')}
              >
                Всі категорії
              </Button>
              <Button
                variant={filterCategoryId === 'none' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterCategoryId('none')}
              >
                Без категорії
              </Button>
              {categories.map((c) => (
                <Button
                  key={c.id}
                  variant={filterCategoryId === c.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterCategoryId(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              {isSalary && (
                <Select value={filterStaffId} onValueChange={setFilterStaffId}>
                  <SelectTrigger className="w-full md:w-[220px]">
                    <SelectValue placeholder="Фільтр по співробітнику" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Всі співробітники</SelectItem>
                    <SelectItem value="none">Без співробітника</SelectItem>
                    {staff.filter(s => s.is_active).map((staffMember) => (
                      <SelectItem key={staffMember.id} value={staffMember.id}>
                        {staffMember.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(isSalary || isActualExpense) && (
                <Select value={filterAccountId} onValueChange={setFilterAccountId}>
                  <SelectTrigger className="w-full md:w-[220px]">
                    <SelectValue placeholder="Фільтр по рахунку" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Всі рахунки</SelectItem>
                    <SelectItem value="none">Без рахунку</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                placeholder="Пошук за описом"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full md:w-[240px]"
              />
            </div>
          </div>
        </div>

        {isTransactionsLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p>Немає витрат за вибраний місяць</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(groupedByCategory.entries()).map(([key, items]) => {
              const categoryName = key === 'none' ? 'Без категорії' : (categoriesMap.get(key) || 'Без категорії');
              const groupTotal = items.reduce((sum, t) => sum + (t.amount || 0), 0);
              return (
                <div key={key} className="rounded-xl border bg-card">
                  <div className="flex items-center justify-between border-b px-4 py-2 text-sm font-semibold">
                    <span>{categoryName}</span>
                    <span className="text-destructive">{formatCurrency(groupTotal)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[240px]">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-ml-2 h-8 font-semibold hover:bg-muted/50"
                              onClick={() => {
                                setSortBy('date');
                                setSortDir((d) => (sortBy === 'date' ? (d === 'asc' ? 'desc' : 'asc') : 'desc'));
                              }}
                            >
                              Дата
                              {sortBy === 'date' ? (sortDir === 'asc' ? <ArrowUp className="ml-1 h-3.5 w-3.5" /> : <ArrowDown className="ml-1 h-3.5 w-3.5" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-50" />}
                            </Button>
                          </TableHead>
                          {isSalary && (
                            <TableHead className="w-[180px]">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="-ml-2 h-8 font-semibold hover:bg-muted/50"
                                onClick={() => {
                                  setSortBy('staff');
                                  setSortDir((d) => (sortBy === 'staff' ? (d === 'asc' ? 'desc' : 'asc') : 'asc'));
                                }}
                              >
                                Співробітник
                                {sortBy === 'staff' ? (sortDir === 'asc' ? <ArrowUp className="ml-1 h-3.5 w-3.5" /> : <ArrowDown className="ml-1 h-3.5 w-3.5" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-50" />}
                              </Button>
                            </TableHead>
                          )}
                          <TableHead>Опис</TableHead>
                          {(isActualExpense || isSalary) && <TableHead className="w-[180px]">Рахунок</TableHead>}
                          <TableHead className="w-[120px]">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-mr-2 ml-auto flex h-8 font-semibold hover:bg-muted/50"
                              onClick={() => {
                                setSortBy('amount');
                                setSortDir((d) => (sortBy === 'amount' ? (d === 'asc' ? 'desc' : 'asc') : 'desc'));
                              }}
                            >
                              Сума
                              {sortBy === 'amount' ? (sortDir === 'asc' ? <ArrowUp className="ml-1 h-3.5 w-3.5" /> : <ArrowDown className="ml-1 h-3.5 w-3.5" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-50" />}
                            </Button>
                          </TableHead>
                          {isSalary && <TableHead className="w-[100px] text-right">Комісія</TableHead>}
                          <TableHead className="w-[100px] text-center">Дії</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((t) => {
                          const isPayout = t.source === 'payout';
                          const accountName = t.account_id 
                            ? accounts.find(a => a.id === t.account_id)?.name || 'Без рахунку'
                            : (activity?.account_id 
                                ? accounts.find(a => a.id === activity.account_id)?.name || 'Без рахунку'
                                : 'Без рахунку');
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="text-sm">
                                {formatDate(t.date)}
                              </TableCell>
                              {isSalary && (
                                <TableCell className="text-sm">
                                  {t.staff_id ? (staff.find(s => s.id === t.staff_id)?.full_name || '—') : '—'}
                                </TableCell>
                              )}
                              <TableCell>
                                <div className="text-sm break-words">
                                  {t.description || '—'}
                                </div>
                                {isPayout && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Виплата з фінансової історії
                                  </div>
                                )}
                                {t.dividend_payout_id && (
                                  <div className="text-xs text-primary mt-1 font-medium">
                                    Виведено як дівіденд
                                  </div>
                                )}
                              </TableCell>
                              {(isActualExpense || isSalary) && (
                                <TableCell className="text-sm">
                                  {isSalary ? (
                                    <Select
                                      value={t.account_id || 'none'}
                                      onValueChange={async (value) => {
                                        const newAccountId = value === 'none' ? null : value;
                                        // Salary journal rows are canonical payouts.
                                        const payoutId = toPayoutId(t.id);
                                        await updatePayout.mutateAsync({
                                          id: payoutId,
                                          account_id: newAccountId,
                                        });
                                      }}
                                    >
                                      <SelectTrigger className="h-8 w-full">
                                        <SelectValue>
                                          {t.account_id 
                                            ? accounts.find(a => a.id === t.account_id)?.name || 'Без рахунку'
                                            : 'Без рахунку'}
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">Без рахунку</SelectItem>
                                        {accounts.map((account) => (
                                          <SelectItem key={account.id} value={account.id}>
                                            {account.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-muted-foreground">{accountName}</span>
                                  )}
                                </TableCell>
                              )}
                              <TableCell className="text-right">
                                <div className={cn("text-sm font-semibold", "text-destructive")}>
                                  {formatCurrency((t.real_amount ?? t.amount) || 0)}
                                </div>
                                {t.expense_advance_type === 'spend' && (
                                  <>
                                    <div className="text-[10px] text-muted-foreground">
                                      З рахунку: {formatCurrency(t.amount || 0)} · З авансу: {formatCurrency(t.advance_consumed_amount || 0)}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                      Залишок авансу: {formatCurrency(getAdvanceBalanceAfterTransaction(t))}
                                    </div>
                                  </>
                                )}
                                {t.expense_advance_type === 'issue' && (
                                  <div className="text-[10px] text-muted-foreground">
                                    Видача авансу
                                  </div>
                                )}
                              </TableCell>
                              {isSalary && (
                                <TableCell className="text-right text-sm text-muted-foreground">
                                  {(() => {
                                    const salTxId = 'salary_transaction_id' in t ? t.salary_transaction_id : t.id;
                                    const comm = commissionsMap.get(salTxId || '');
                                    return comm && comm.amount > 0 ? formatCurrency(comm.amount) : '—';
                                  })()}
                                </TableCell>
                              )}
                              <TableCell>
                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                  {(isSalary || isActualExpense) && t.dividend_payout_id && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground"
                                      title="Зняти позначку «виведено як дівіденд»"
                                      onClick={async () => {
                                        if (!window.confirm('Зняти позначку? Виплата в журналі дивідендів буде видалена.')) return;
                                        try {
                                          await deleteDividendPayout.mutateAsync(t.dividend_payout_id!);
                                          queryClient.invalidateQueries({ queryKey: [ACTIVITY_EXPENSE_QUERY_KEYS.financeTransactions] });
                                          queryClient.invalidateQueries({ queryKey: [ACTIVITY_EXPENSE_QUERY_KEYS.staffPayoutsAll] });
                                          queryClient.invalidateQueries({ queryKey: [ACTIVITY_EXPENSE_QUERY_KEYS.staffPayouts], exact: false });
                                          queryClient.invalidateQueries({ queryKey: [ACTIVITY_EXPENSE_QUERY_KEYS.salaryPayoutRows], exact: false });
                                          queryClient.invalidateQueries({ queryKey: [ACTIVITY_EXPENSE_QUERY_KEYS.salaryTxForPayouts], exact: false });
                                          queryClient.invalidateQueries({ queryKey: [ACTIVITY_EXPENSE_QUERY_KEYS.salaryTxMetaForPayouts], exact: false });
                                          toast({ title: 'Позначку знято' });
                                        } catch (e: any) {
                                          toast({ title: 'Помилка', description: e?.message, variant: 'destructive' });
                                        }
                                      }}
                                    >
                                      <Unlink className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {(isSalary || isActualExpense) && !t.dividend_payout_id && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      title="Вивести як дівіденд"
                                      onClick={() => {
                                        setDividendSource(isPayout ? { source: 'payout', id: toPayoutId(t.id) } : { source: 'transaction', id: t.id });
                                        setDividendInitialValues({
                                          payout_date: t.date,
                                          total_amount: t.amount || 0,
                                          account_id: t.account_id || null,
                                        });
                                        setDividendDialogOpen(true);
                                      }}
                                    >
                                      <Banknote className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <>
                                    {/* Редагування дозволене для звичайних витрат і витрат, списаних з авансу */}
                                    {(!t.expense_advance_type || t.expense_advance_type === 'spend') && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                          setEditingId(t.id);
                                          setAmount(((t.real_amount ?? t.amount) || 0).toString());
                                          setAdvanceMode('expense');
                                          setUseAdvanceForExpense(t.expense_advance_type === 'spend');
                                          const salTxId = 'salary_transaction_id' in t ? t.salary_transaction_id : t.id;
                                          setCommission(commissionsMap.get(salTxId || '')?.amount?.toString() ?? '');
                                          setDate(t.date);
                                          setPayoutForPeriod(('payout_for_period' in t ? (t as any).payout_for_period : '') || '');
                                          setDescription(t.description || '');
                                          setStaffId(t.staff_id || '');
                                          setCategoryId(t.expense_category_id || 'none');
                                          setNewCategoryName('');
                                          setSelectedAccountId(t.account_id || activity?.account_id || 'none');
                                          if (isSalary) {
                                            const prefill = resolvePayrollPayoutPrefill({
                                              source: 'activity-expense-journal',
                                              staffId: t.staff_id || undefined,
                                              payoutDate: t.date,
                                              accountId: t.account_id || activity?.account_id || undefined,
                                              subcategoryId: t.expense_category_id || null,
                                            });
                                            setSalaryPrefill(prefill);
                                          }
                                          setDialogOpen(true);
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={async () => {
                                        if (!window.confirm('Видалити цей запис?')) return;
                                        if (isPayout) {
                                          const note = window.prompt('Причина видалення (обовʼязково):', '');
                                          if (!note || !note.trim()) return;
                                          const payoutId = toPayoutId(t.id);
                                          await deletePayout.mutateAsync({
                                            id: payoutId,
                                            staffId: t.staff_id || '',
                                            deleteNote: note.trim(),
                                          });
                                        } else {
                                          await deleteTransaction.mutateAsync(t.id);
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isSalary ? (
        <PayrollPayoutDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (open) {
              setDialogOpen(true);
            } else {
              closeSalaryDialog();
            }
          }}
          onSubmit={(event?: any) => {
            event?.preventDefault?.();
            void handleSubmit();
          }}
          register={(field: string) => {
            if (field === 'amount') {
              return { value: amount, onChange: (e: any) => setAmount(e.target.value) };
            }
            if (field === 'payout_date') {
              return { value: date, onChange: (e: any) => setDate(e.target.value) };
            }
            if (field === 'payout_for_period') {
              return { value: payoutForPeriod, onChange: (e: any) => setPayoutForPeriod(e.target.value) };
            }
            if (field === 'notes') {
              return { value: description, onChange: (e: any) => setDescription(e.target.value) };
            }
            if (field === 'commission') {
              return { value: commission, onChange: (e: any) => setCommission(e.target.value) };
            }
            return {};
          }}
          errors={salaryFormErrors}
          watch={(field: string) => {
            if (field === 'account_id') return selectedAccountId === 'none' ? '' : selectedAccountId;
            return '';
          }}
          setValue={(field: string, value: string) => {
            if (field === 'account_id') {
              setSelectedAccountId(value || 'none');
            }
          }}
          accounts={accounts}
          onCancel={closeSalaryDialog}
          isSaving={createPayout.isPending || updatePayout.isPending || syncCommission.isPending}
          payoutsForSelectedDate={salaryDialogItemsForDate}
          salaryTxByPayoutId={salaryDialogTxIdMap}
          commissionsMap={commissionsMap}
          formatCurrency={formatCurrency}
          onEditPayout={(payout, commissionAmount) => {
            setEditingId(payout.id);
            setAmount((payout.amount || 0).toString());
            setCommission((commissionAmount || 0).toString());
            setDate(payout.date);
            setPayoutForPeriod(payout.payout_for_period || '');
            setDescription(payout.description || '');
            setStaffId(payout.staff_id || '');
            setCategoryId(payout.expense_category_id || 'none');
            setSelectedAccountId(payout.account_id || activity?.account_id || 'none');
          }}
          onDeletePayout={async (payout) => {
            const note = window.prompt('Причина видалення (обовʼязково):', '');
            if (!note || !note.trim()) return;
            const payoutId = toPayoutId(String(payout.id || ''));
            await deletePayout.mutateAsync({
              id: payoutId,
              staffId: payout.staff_id || '',
              deleteNote: note.trim(),
            });
          }}
          staffOptions={staff
            .filter((s) => s.is_active)
            .map((s) => ({ id: s.id, name: s.full_name }))}
          staffFieldValue={staffId}
          onStaffFieldChange={setStaffId}
          staffFieldDisabled={salaryPrefill.lockStaff}
          subcategoryOptions={categories.map((c) => ({ id: c.id, name: c.name }))}
          subcategoryFieldValue={categoryId}
          onSubcategoryFieldChange={setCategoryId}
        />
      ) : (
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          resetForm();
        } else {
          // При открытии диалога инициализируем account_id
          if (!editingId) {
            setSelectedAccountId(activity?.account_id || 'none');
          }
        }
      }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editingId ? 'Редагувати витрату' : 'Додати витрату'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto min-h-0 flex-1 pr-1 -mr-1">
            <div className="space-y-2">
              <Label>Тип операції</Label>
              <Select
                value={advanceMode}
                onValueChange={(value) => setAdvanceMode(value as AdvanceOperationMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Звичайна покупка</SelectItem>
                  <SelectItem value="advance_issue">Видача авансу</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Сума (₴)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Дата</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Підкатегорія</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Виберіть підкатегорію" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без категорії</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  <SelectItem value="new">+ Додати нову</SelectItem>
                </SelectContent>
              </Select>
              {categoryId === 'new' && (
                <Input
                  placeholder="Назва нової категорії"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
              )}
            </div>
            {categoryId !== 'new' && (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Доступний аванс по підкатегорії</div>
                <div className="mt-1 text-base font-semibold">{formatCurrency(selectedAdvanceBalance)}</div>
                {advanceMode === 'expense' && (
                  <div className="mt-3 flex items-start gap-2">
                    <input
                      id="use-advance-expense"
                      type="checkbox"
                      checked={useAdvanceForExpense}
                      onChange={(e) => setUseAdvanceForExpense(e.target.checked)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <label htmlFor="use-advance-expense" className="text-sm leading-5">
                      Списувати покупку з авансу цієї підкатегорії
                    </label>
                  </div>
                )}
                {advanceMode === 'expense' &&
                  useAdvanceForExpense &&
                  Math.max(0, Number(amount) || 0) > selectedAdvanceBalance && (
                    <div className="mt-2 flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs">
                        Авансу недостатньо. Доплата: {formatCurrency(Math.max(0, (Number(amount) || 0) - selectedAdvanceBalance))}
                      </span>
                    </div>
                  )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Опис</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            {isActualExpense && (
              <div className="space-y-2">
                <Label>Рахунок списання</Label>
                <Select
                  value={selectedAccountId}
                  onValueChange={setSelectedAccountId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Оберіть рахунок" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без рахунку</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {activity?.account_id 
                    ? `За замовчуванням: ${accounts.find(a => a.id === activity.account_id)?.name || 'Без рахунку'}`
                    : 'За замовчуванням: Без рахунку'}
                </p>
              </div>
            )}
            </div>
            <div className="flex justify-end gap-2 pt-2 flex-shrink-0 border-t pt-4 mt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Скасувати</Button>
              <Button onClick={handleSubmit} disabled={createTransaction.isPending || updateTransaction.isPending || syncCommission.isPending}>
                {(createTransaction.isPending || updateTransaction.isPending || syncCommission.isPending) ? 'Збереження...' : 'Зберегти'}
              </Button>
            </div>
        </DialogContent>
      </Dialog>
      )}

      <DividendPayoutFormDialog
        open={dividendDialogOpen}
        onOpenChange={(open) => {
          setDividendDialogOpen(open);
          if (!open) {
            setDividendSource(null);
            setDividendInitialValues(null);
          }
        }}
        participants={dividendParticipants}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        defaultCleaning={defaultCleaning}
        editingPayout={null}
        initialValuesForCreate={dividendInitialValues}
        onSuccess={(createdPayoutId) => {
          if (createdPayoutId) handleDividendCreateSuccess(createdPayoutId);
        }}
        createPayout={createDividendPayout}
        updatePayout={updateDividendPayout}
      />
    </>
  );
}
