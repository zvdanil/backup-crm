import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/attendance";
import { useDebtorsRegistry } from "@/hooks/useDebtorsRegistry";
import { usePaymentAccounts } from "@/hooks/usePaymentAccounts";

const MONTHS = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];

export default function DebtorsRegistry() {
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [studentFilter, setStudentFilter] = useState("");
  const [balanceSort, setBalanceSort] = useState<"desc" | "asc">("desc");
  const [nameSort, setNameSort] = useState<"asc" | "desc">("asc");
  const [activeSort, setActiveSort] = useState<"name" | "balance">("balance");

  const { data: rows = [], isLoading } = useDebtorsRegistry(
    filterMonth,
    filterYear,
  );
  const { data: accounts = [] } = usePaymentAccounts();

  const filteredRows = useMemo(() => {
    const normalizedFilter = studentFilter.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (selectedAccountId === "all") return true;
      if (selectedAccountId === "none") return row.account_id === null;
      return row.account_id === selectedAccountId;
    });

    const byName = normalizedFilter
      ? list.filter((row) =>
          row.student_name.toLowerCase().includes(normalizedFilter),
        )
      : list;

    return byName.sort((a, b) => {
      if (
        activeSort === "balance" &&
        a.balance_all_time !== b.balance_all_time
      ) {
        return balanceSort === "desc"
          ? a.balance_all_time - b.balance_all_time
          : b.balance_all_time - a.balance_all_time;
      }
      if (activeSort === "name") {
        const nameCompare =
          nameSort === "asc"
            ? a.student_name.localeCompare(b.student_name, "uk-UA")
            : b.student_name.localeCompare(a.student_name, "uk-UA");
        if (nameCompare !== 0) return nameCompare;
      }
      if (
        activeSort !== "balance" &&
        a.balance_all_time !== b.balance_all_time
      ) {
        return balanceSort === "desc"
          ? a.balance_all_time - b.balance_all_time
          : b.balance_all_time - a.balance_all_time;
      }
      const fallbackName = a.student_name.localeCompare(
        b.student_name,
        "uk-UA",
      );
      if (fallbackName !== 0) return fallbackName;
      return a.account_name.localeCompare(b.account_name, "uk-UA");
    });
  }, [
    rows,
    selectedAccountId,
    studentFilter,
    balanceSort,
    nameSort,
    activeSort,
  ]);

  const totalDebt = useMemo(
    () => filteredRows.reduce((sum, row) => sum + row.balance_all_time, 0),
    [filteredRows],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Дебіторська заборгованність"
        description={`Поточний місяць: ${MONTHS[filterMonth]} ${filterYear}`}
        actions={
          <>
            <Select
              value={filterMonth.toString()}
              onValueChange={(value) => setFilterMonth(parseInt(value))}
            >
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, index) => (
                  <SelectItem key={month} value={index.toString()}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterYear.toString()}
              onValueChange={(value) => setFilterYear(parseInt(value))}
            >
              <SelectTrigger className="h-8 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => filterYear - 2 + i).map(
                  (year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Select
              value={nameSort}
              onOpenChange={(open) => {
                if (open) setActiveSort("name");
              }}
              onValueChange={(value) => {
                setNameSort(value as "asc" | "desc");
                setActiveSort("name");
              }}
            >
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">ФІО: від А до Я</SelectItem>
                <SelectItem value="desc">ФІО: від Я до А</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={selectedAccountId}
              onValueChange={setSelectedAccountId}
            >
              <SelectTrigger className="h-8 w-[200px]">
                <SelectValue placeholder="Всі рахунки" />
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
            <Select
              value={balanceSort}
              onOpenChange={(open) => {
                if (open) setActiveSort("balance");
              }}
              onValueChange={(value) => {
                setBalanceSort(value as "desc" | "asc");
                setActiveSort("balance");
              }}
            >
              <SelectTrigger className="h-8 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Сума боргу: від більшої</SelectItem>
                <SelectItem value="asc">Сума боргу: від меншої</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={studentFilter}
              onChange={(event) => setStudentFilter(event.target.value)}
              placeholder="ФІО дитини"
              className="h-8 w-[200px]"
            />
            <div className="text-sm text-muted-foreground">
              Загальна заборгованість:{" "}
              <span className="font-semibold text-destructive">
                {formatCurrency(totalDebt)}
              </span>
            </div>
          </>
        }
      />

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">
          Завантаження...
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          Боржників не знайдено
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дитина</TableHead>
                <TableHead>Рахунок</TableHead>
                <TableHead className="text-right">
                  Нараховано (місяць)
                </TableHead>
                <TableHead className="text-right">Сплачено (місяць)</TableHead>
                <TableHead className="text-right">
                  Баланс (весь період)
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={`${row.student_id}-${row.account_id || "none"}`}>
                  <TableCell>
                    <Link
                      to={`/students/${row.student_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.student_name}
                    </Link>
                  </TableCell>
                  <TableCell>{row.account_name}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.month_charges)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.month_payments)}
                  </TableCell>
                  <TableCell className="text-right text-destructive font-semibold">
                    {formatCurrency(row.balance_all_time)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
