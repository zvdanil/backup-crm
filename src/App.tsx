import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Students from "./pages/Students";
import StudentDetail from "./pages/StudentDetail";
import Activities from "./pages/Activities";
import ActivityExpenseJournal from "./pages/ActivityExpenseJournal";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import Attendance from "./pages/Attendance";
import GroupLessonsJournal from "./pages/GroupLessonsJournal";
import Groups from "./pages/Groups";
import Staff from "./pages/Staff";
import StaffDetail from "./pages/StaffDetail";
import StaffExpenseJournal from "./pages/StaffExpenseJournal";
import StaffPayrollRegistry from "./pages/StaffPayrollRegistry";
import GardenAttendanceJournal from "./pages/GardenAttendanceJournal";
import NutritionReport from "./pages/NutritionReport";
import Users from "./pages/Users";
import Login from "./pages/Login";
import ParentPortal from "./pages/ParentPortal";
import ParentStudentDetail from "./pages/ParentStudentDetail";
import PendingActivation from "./pages/PendingActivation";
import SummaryReport from "./pages/SummaryReport";
import CalendarPage from "./pages/Calendar";
import DebtorsRegistry from "./pages/DebtorsRegistry";
import FinancialSummaryReport from "./pages/FinancialSummaryReport";
import DividendJournal from "./pages/DividendJournal";
import RealExpensesReport from "./pages/RealExpensesReport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Data is considered stale immediately
      cacheTime: 5 * 60 * 1000, // Cache for 5 minutes
    },
  },
});

// Suppress verbose dashboard debug noise in production-like usage.
// To re-enable these logs for diagnostics, set:
// localStorage.setItem('dashboard_debug', '1') and reload page.
if (typeof window !== "undefined") {
  const win = window as any;
  if (!win.__dashboardDebugConsolePatched) {
    const dashboardDebugEnabled =
      window.localStorage.getItem("dashboard_debug") === "1";

    if (!dashboardDebugEnabled) {
      const suppressedPrefixes = [
        "[Dashboard Debug]",
        "[Auto-journal]",
        "[EnhancedAttendanceGrid]",
      ];
      const shouldSuppress = (args: any[]) =>
        typeof args[0] === "string" &&
        suppressedPrefixes.some((prefix) => args[0].startsWith(prefix));

      const originalLog = console.log.bind(console);
      const originalWarn = console.warn.bind(console);
      const originalError = console.error.bind(console);

      console.log = (...args: any[]) => {
        if (shouldSuppress(args)) return;
        originalLog(...args);
      };
      console.warn = (...args: any[]) => {
        if (shouldSuppress(args)) return;
        originalWarn(...args);
      };
      console.error = (...args: any[]) => {
        if (shouldSuppress(args)) return;
        originalError(...args);
      };
    }

    win.__dashboardDebugConsolePatched = true;
  }
}

// Expose queryClient to window for manual cache clearing (development/debugging)
if (typeof window !== "undefined") {
  (window as any).clearCache = () => {
    queryClient.clear();
    console.log("✅ Кеш очищено! Обновіть сторінку.");
  };
  (window as any).invalidateAll = () => {
    queryClient.invalidateQueries();
    console.log("✅ Всі запити інвалідовано!");
  };
}

const AppRoutes = () => {
  const location = useLocation();
  const isPublicPage =
    location.pathname === "/login" || location.pathname === "/pending";

  if (isPublicPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pending" element={<PendingActivation />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <AppLayout>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin", "viewer"]}>
              <Index />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute
              allowedRoles={["owner", "admin", "manager", "viewer"]}
            >
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/students"
          element={
            <ProtectedRoute
              allowedRoles={["owner", "admin", "accountant", "viewer"]}
            >
              <Students />
            </ProtectedRoute>
          }
        />
        <Route
          path="/students/:id"
          element={
            <ProtectedRoute
              allowedRoles={["owner", "admin", "accountant", "viewer"]}
            >
              <StudentDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/activities"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin", "viewer"]}>
              <Activities />
            </ProtectedRoute>
          }
        />
        <Route
          path="/activities/:id/expenses"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin", "viewer"]}>
              <ActivityExpenseJournal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin"]}>
              <Accounts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/:id"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin"]}>
              <AccountDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <ProtectedRoute
              allowedRoles={["owner", "admin", "manager", "viewer"]}
            >
              <Attendance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/group-lessons"
          element={
            <ProtectedRoute
              allowedRoles={["owner", "admin", "manager", "viewer"]}
            >
              <GroupLessonsJournal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/groups"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin", "viewer"]}>
              <Groups />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin", "viewer"]}>
              <Staff />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/:id"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin", "viewer"]}>
              <StaffDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff-expenses"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin", "viewer"]}>
              <StaffExpenseJournal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff-payroll"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin", "viewer"]}>
              <StaffPayrollRegistry />
            </ProtectedRoute>
          }
        />
        <Route
          path="/garden-attendance"
          element={
            <ProtectedRoute
              allowedRoles={["owner", "admin", "manager", "viewer"]}
            >
              <GardenAttendanceJournal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/nutrition-report"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin", "viewer"]}>
              <NutritionReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin"]}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/summary-report"
          element={
            <ProtectedRoute allowedRoles={["owner", "admin", "viewer"]}>
              <SummaryReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/debtors"
          element={
            <ProtectedRoute
              allowedRoles={["owner", "admin", "accountant", "viewer"]}
            >
              <DebtorsRegistry />
            </ProtectedRoute>
          }
        />
        <Route
          path="/financial-report"
          element={
            <ProtectedRoute
              allowedRoles={["owner", "admin", "viewer"]}
            >
              <FinancialSummaryReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dividend-journal"
          element={
            <ProtectedRoute
              allowedRoles={["owner", "admin", "viewer"]}
            >
              <DividendJournal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/expenses-report"
          element={
            <ProtectedRoute
              allowedRoles={["owner", "admin", "viewer"]}
            >
              <RealExpensesReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/parent"
          element={
            <ProtectedRoute allowedRoles={["parent"]}>
              <ParentPortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/parent/students/:id"
          element={
            <ProtectedRoute allowedRoles={["parent"]}>
              <ParentStudentDetail />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
