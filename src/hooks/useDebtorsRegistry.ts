import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchStudentAccountBalances } from "@/hooks/useFinanceTransactions";
import {
  getGardenAttendanceConfig,
  isGardenAttendanceController,
} from "@/lib/gardenAttendance";

const supabaseAny = supabase as any;

type DebtorRow = {
  student_id: string;
  student_name: string;
  account_id: string | null;
  account_name: string;
  month_charges: number;
  month_payments: number;
  balance_all_time: number;
  is_debtor: boolean;
};

type StudentRow = {
  id: string;
  full_name: string | null;
};

export function useDebtorsRegistry(month: number, year: number, mode: 'debtors' | 'all' = 'debtors') {
  return useQuery({
    queryKey: ["debtors_registry", month, year, mode],
    queryFn: async () => {
      const [
        { data: students, error: studentsError },
        { data: accounts, error: accountsError },
        { data: activities, error: activitiesError },
      ] = await Promise.all([
        supabaseAny.from("students").select("id, full_name").order("full_name"),
        supabaseAny.from("payment_accounts").select("id, name").order("name"),
        supabaseAny.from("activities").select("id, config"),
      ]);

      if (studentsError) throw studentsError;
      if (accountsError) throw accountsError;
      if (activitiesError) throw activitiesError;

      const accountMap = new Map<string, string>();
      (accounts || []).forEach((account: any) => {
        accountMap.set(account.id, account.name || "Без рахунку");
      });

      const controllerActivityIds = (activities || [])
        .filter((activity: any) => isGardenAttendanceController(activity))
        .map((activity: any) => activity.id);

      const foodTariffIds = new Set<string>();
      (activities || []).forEach((activity: any) => {
        if (!isGardenAttendanceController(activity)) return;
        const config = getGardenAttendanceConfig(activity);
        (config.food_tariff_ids || []).forEach((id) => foodTariffIds.add(id));
      });

      const rows: DebtorRow[] = [];
      const studentRows = (students || []) as StudentRow[];

      const balancesByStudent = await Promise.all(
        studentRows.map(async (student) => {
          const balances = await fetchStudentAccountBalances({
            studentId: student.id,
            month,
            year,
            excludeActivityIds: controllerActivityIds,
            foodTariffIds: Array.from(foodTariffIds),
            cumulative: false,
          });

          return { student, balances };
        }),
      );

      balancesByStudent.forEach(({ student, balances }) => {
        const studentName = student.full_name || student.id;
        balances.forEach((balance) => {
          const previousBalance = balance.previous_balance || 0;
          const endBalance =
            previousBalance +
            balance.payments -
            balance.charges +
            balance.refunds;
          
          // В режиме "debtors" пропускаем недолжников
          if (mode === 'debtors' && endBalance >= 0) return;

          const accountName = balance.account_id
            ? accountMap.get(balance.account_id) || "Без рахунку"
            : "Без рахунку";

          rows.push({
            student_id: student.id,
            student_name: studentName,
            account_id: balance.account_id,
            account_name: accountName,
            month_charges: balance.charges,
            month_payments: balance.payments,
            balance_all_time: endBalance,
            is_debtor: endBalance < 0,
          });
        });
      });

      rows.sort((a, b) => {
        if (a.balance_all_time !== b.balance_all_time) {
          return a.balance_all_time - b.balance_all_time;
        }
        return a.student_name.localeCompare(b.student_name, "uk-UA");
      });

      return rows;
    },
  });
}

export type { DebtorRow };
