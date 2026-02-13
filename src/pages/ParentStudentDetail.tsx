import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { useStudent } from "@/hooks/useStudents";
import { useEnrollments } from "@/hooks/useEnrollments";
import { useActivities } from "@/hooks/useActivities";
import { useStudentAccountBalances } from "@/hooks/useFinanceTransactions";
import { StudentPaymentHistory } from "@/components/students/StudentPaymentHistory";
import { StudentAccountBalance } from "@/components/students/StudentAccountBalance";
import {
  isGardenAttendanceController,
  type GardenAttendanceConfig,
} from "@/lib/gardenAttendance";
import { useAuth } from "@/context/AuthContext";
import { useParentStudents } from "@/hooks/useParentPortal";
import { usePaymentAccounts } from "@/hooks/usePaymentAccounts";

export default function ParentStudentDetail() {
  const { id } = useParams<{ id: string }>();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const { profile } = useAuth();
  const { data: parentStudents = [], isLoading: parentStudentsLoading } =
    useParentStudents(profile?.id);

  const { data: student, isLoading: studentLoading } = useStudent(id!);
  const { data: enrollments = [], isLoading: enrollmentsLoading } =
    useEnrollments({ studentId: id, activeOnly: false });
  const { data: allActivities = [] } = useActivities();
  const { data: accounts = [] } = usePaymentAccounts();

  const controllerActivityIds = useMemo(
    () =>
      allActivities
        .filter(isGardenAttendanceController)
        .map((activity) => activity.id),
    [allActivities],
  );

  const foodTariffIds = useMemo(() => {
    const ids = new Set<string>();
    allActivities.forEach((activity) => {
      if (isGardenAttendanceController(activity)) {
        const config = (activity.config as GardenAttendanceConfig) || {};
        (config.food_tariff_ids || []).forEach((id) => ids.add(id));
      }
    });
    return ids;
  }, [allActivities]);

  const { data: accountBalances = [], isLoading: balancesLoading } =
    useStudentAccountBalances(
      id!,
      month,
      year,
      controllerActivityIds,
      Array.from(foodTariffIds),
    );

  const hasAccess = useMemo(
    () => parentStudents.some((s) => s.id === id),
    [parentStudents, id],
  );

  if (studentLoading || enrollmentsLoading || parentStudentsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-muted-foreground">Доступ заборонено</p>
        <Button variant="link" asChild>
          <Link to="/parent">Повернутися</Link>
        </Button>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-muted-foreground">Дитину не знайдено</p>
        <Button variant="link" asChild>
          <Link to="/parent">Повернутися</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={student.full_name}
        actions={
          <Button variant="outline" asChild>
            <Link to="/parent">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Link>
          </Button>
        }
      />

      <div className="p-4 sm:p-8 space-y-6">
        <StudentAccountBalance
          studentId={id!}
          enrollments={enrollments}
          allActivities={allActivities}
          accounts={accounts}
          accountBalances={accountBalances}
          accountBalancesLoading={balancesLoading}
          month={month}
          year={year}
          onMonthChange={setMonth}
          onYearChange={setYear}
        />

        <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-soft">
          <StudentPaymentHistory
            studentId={id!}
            month={month}
            year={year}
            title="Історія оплат"
          />
        </div>
      </div>
    </>
  );
}
