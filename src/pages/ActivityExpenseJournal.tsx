import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivity } from '@/hooks/useActivities';
import { useFinanceTransactions, useCreateFinanceTransaction, useUpdateFinanceTransaction, useDeleteFinanceTransaction, type TransactionType } from '@/hooks/useFinanceTransactions';
import { useExpenseCategories, useCreateExpenseCategory } from '@/hooks/useExpenseCategories';
import { useExpenseArticles, useCreateExpenseArticle, useUpdateExpenseArticle, useDeleteExpenseArticle } from '@/hooks/useExpenseArticles';
import { useExpenseJournalEntries, useUpsertExpenseJournalEntry, useDeleteExpenseJournalEntry } from '@/hooks/useExpenseJournalEntries';
import { useStaff } from '@/hooks/useStaff';
import { formatCurrency, formatDate, formatDateString, getDaysInMonth, getWeekdayShort, isWeekend } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

const getTransactionTypeForCategory = (category: string | null): TransactionType => {
  if (category === 'salary') return 'salary';
  if (category === 'household_expense') return 'household';
  return 'expense';
};

export default function ActivityExpenseJournal() {
  const { id } = useParams<{ id: string }>();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(formatDateString(now));
  const [description, setDescription] = useState('');
  const [staffId, setStaffId] = useState('');
  const [categoryId, setCategoryId] = useState<string>('none');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [filterStaffId, setFilterStaffId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [articleName, setArticleName] = useState('');
  const [articleMode, setArticleMode] = useState<'rate' | 'manual'>('rate');
  const [articleRate, setArticleRate] = useState('0');
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(null);
  const [cellValues, setCellValues] = useState<Record<string, string>>({});

  const { data: activity } = useActivity(id || '');
  const { data: staff = [] } = useStaff();
  const { data: categories = [] } = useExpenseCategories(id);
  const createCategory = useCreateExpenseCategory();
  const createTransaction = useCreateFinanceTransaction();
  const updateTransaction = useUpdateFinanceTransaction();
  const deleteTransaction = useDeleteFinanceTransaction();
  const { data: expenseArticles = [] } = useExpenseArticles(id);
  const createExpenseArticle = useCreateExpenseArticle();
  const updateExpenseArticle = useUpdateExpenseArticle();
  const deleteExpenseArticle = useDeleteExpenseArticle();
  const { data: journalEntries = [] } = useExpenseJournalEntries(id, month, year);
  const upsertJournalEntry = useUpsertExpenseJournalEntry();
  const deleteJournalEntry = useDeleteExpenseJournalEntry();

  const transactionType = getTransactionTypeForCategory(activity?.category || null);
  const isSalary = activity?.category === 'salary';
  const isHousehold = activity?.category === 'household_expense';

  const { data: transactions = [], isLoading } = useFinanceTransactions({
    activityId: id,
    month,
    year,
    type: transactionType,
  });

  const { data: staffPayouts = [] } = useQuery({
    queryKey: ['staff-payouts-all', month, year],
    queryFn: async () => {
      const startDate = new Date(year, month, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('staff_payouts' as any)
        .select('id, staff_id, payout_date, amount, notes')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .gte('payout_date', startDate)
        .lte('payout_date', endDate);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: isSalary,
  });

  const categoriesMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const combinedTransactions = useMemo(() => {
    if (!isSalary) return transactions;
    const payoutItems = staffPayouts.map((payout) => ({
      id: `payout-${payout.id}`,
      activity_id: id,
      staff_id: payout.staff_id,
      expense_category_id: null,
      amount: payout.amount,
      date: payout.payout_date,
      description: payout.notes || 'Виплата із фін історії',
      source: 'payout',
    }));
    return [...transactions, ...payoutItems];
  }, [transactions, staffPayouts, isSalary, id]);

  const filteredTransactions = useMemo(() => {
    return combinedTransactions.filter((t) => {
      const matchesCategory =
        filterCategoryId === 'all' ||
        (filterCategoryId === 'none' && !t.expense_category_id) ||
        t.expense_category_id === filterCategoryId;
      const matchesStaff =
        filterStaffId === 'all' ||
        (filterStaffId === 'none' && !t.staff_id) ||
        t.staff_id === filterStaffId;
      const matchesSearch =
        !search.trim() ||
        (t.description || '').toLowerCase().includes(search.trim().toLowerCase());
      return matchesCategory && matchesStaff && matchesSearch;
    });
  }, [combinedTransactions, filterCategoryId, filterStaffId, search]);

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
      return;
    }
    const next: Record<string, string> = {};
    journalEntries.forEach((entry) => {
      const key = `${entry.expense_article_id}-${entry.entry_date}`;
      if (entry.quantity !== null && entry.quantity !== undefined) {
        next[key] = String(entry.quantity);
      } else {
        next[key] = String(entry.amount);
      }
    });
    setCellValues(next);
  }, [journalEntries]);

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
    setDate(formatDateString(new Date()));
    setDescription('');
    setStaffId('');
    setCategoryId('none');
    setNewCategoryName('');
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!id || !amount) return;

    let finalCategoryId: string | null = categoryId === 'none' ? null : categoryId;

    if (categoryId === 'new' && newCategoryName.trim()) {
      const created = await createCategory.mutateAsync({
        activity_id: id,
        name: newCategoryName.trim(),
      });
      finalCategoryId = created.id;
    }

    if (editingId) {
      await updateTransaction.mutateAsync({
        id: editingId,
        type: transactionType,
        activity_id: id,
        staff_id: isSalary ? (staffId || null) : null,
        student_id: null,
        expense_category_id: finalCategoryId,
        amount: parseFloat(amount),
        date,
        description: description || null,
        category: null,
      });
    } else {
      await createTransaction.mutateAsync({
        type: transactionType,
        activity_id: id,
        staff_id: isSalary ? (staffId || null) : null,
        student_id: null,
        expense_category_id: finalCategoryId,
        amount: parseFloat(amount),
        date,
        description: description || null,
        category: null,
      });
    }

    resetForm();
    setDialogOpen(false);
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

    await upsertJournalEntry.mutateAsync({
      activity_id: id,
      expense_article_id: articleId,
      entry_date: dateStr,
      quantity,
      amount,
      description: `Стаття: ${article.name}`,
      quantityLabel: quantity !== null ? `${quantity} од.` : null,
    });
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
                    {days.map((day) => (
                      <th
                        key={formatDateString(day)}
                        className={cn(
                          'px-1 py-2 text-center text-xs font-medium min-w-[56px]',
                          isWeekend(day)
                            ? 'text-muted-foreground/50 bg-amber-50/70 dark:bg-amber-900/20'
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
                              isWeekend(day) && 'bg-amber-50/70 dark:bg-amber-900/20'
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
          <Button onClick={() => setDialogOpen(true)}>
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
              <Input
                placeholder="Пошук за описом"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full md:w-[240px]"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
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
                  <div className="divide-y">
                    {items.map((t) => {
                      const isPayout = t.source === 'payout';
                      return (
                      <div key={t.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{formatDate(t.date)}</div>
                            {isSalary && t.staff_id && (
                              <div className="text-xs text-muted-foreground">
                                {staff.find(s => s.id === t.staff_id)?.full_name || '—'}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground break-words">
                              {t.description || '—'}
                            </div>
                            {isPayout && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Виплата з фінансової історії
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={cn("text-sm font-semibold", "text-destructive")}>
                              {formatCurrency(t.amount || 0)}
                            </div>
                            {!isPayout && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingId(t.id);
                                    setAmount((t.amount || 0).toString());
                                    setDate(t.date);
                                    setDescription(t.description || '');
                                    setStaffId(t.staff_id || '');
                                    setCategoryId(t.expense_category_id || 'none');
                                    setNewCategoryName('');
                                    setDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    if (!window.confirm('Видалити цей запис?')) return;
                                    await deleteTransaction.mutateAsync({ id: t.id });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Редагувати витрату' : 'Додати витрату'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Сума (₴)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Дата</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {isSalary && (
              <div className="space-y-2">
                <Label>Співробітник</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Виберіть співробітника" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.filter(s => s.is_active).map((staffMember) => (
                      <SelectItem key={staffMember.id} value={staffMember.id}>
                        {staffMember.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
            <div className="space-y-2">
              <Label>Опис</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Скасувати</Button>
              <Button onClick={handleSubmit} disabled={createTransaction.isPending || updateTransaction.isPending}>
                {(createTransaction.isPending || updateTransaction.isPending) ? 'Збереження...' : 'Зберегти'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
