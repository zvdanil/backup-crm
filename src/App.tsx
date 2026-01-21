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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Data is considered stale immediately
      cacheTime: 5 * 60 * 1000, // Cache for 5 minutes
    },
  },
});

// Expose queryClient to window for manual cache clearing (development/debugging)
if (typeof window !== 'undefined') {
  (window as any).clearCache = () => {
    queryClient.clear();
    console.log('✅ Кеш очищено! Обновіть сторінку.');
  };
  (window as any).invalidateAll = () => {
    queryClient.invalidateQueries();
    console.log('✅ Всі запити інвалідовано!');
  };
}

const AppRoutes = () => {
  const location = useLocation();
  const isLogin = location.pathname === '/login';

  if (isLogin) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <AppLayout>
      <Routes>
        <Route
          path="/"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'viewer']}>
              <Index />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/students"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer']}>
              <Students />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/students/:id"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer']}>
              <StudentDetail />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/activities"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer']}>
              <Activities />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/activities/:id/expenses"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer']}>
              <ActivityExpenseJournal />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/accounts"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'accountant']}>
              <Accounts />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/attendance"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer']}>
              <Attendance />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/group-lessons"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer']}>
              <GroupLessonsJournal />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/groups"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer']}>
              <Groups />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/staff"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'accountant', 'viewer']}>
              <Staff />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/staff/:id"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'accountant', 'viewer']}>
              <StaffDetail />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/staff-expenses"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer']}>
              <StaffExpenseJournal />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/staff-payroll"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'accountant', 'viewer']}>
              <StaffPayrollRegistry />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/garden-attendance"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer']}>
              <GardenAttendanceJournal />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/nutrition-report"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer']}>
              <NutritionReport />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/users"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin']}>
              <Users />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/pending"
          element={(
            <ProtectedRoute allowedRoles={['owner', 'admin', 'manager', 'accountant', 'viewer', 'parent', 'newregistration']}>
              <PendingActivation />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/parent"
          element={(
            <ProtectedRoute allowedRoles={['parent']}>
              <ParentPortal />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/parent/students/:id"
          element={(
            <ProtectedRoute allowedRoles={['parent']}>
              <ParentStudentDetail />
            </ProtectedRoute>
          )}
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
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
