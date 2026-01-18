import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Students from "./pages/Students";
import StudentDetail from "./pages/StudentDetail";
import Activities from "./pages/Activities";
import ActivityExpenseJournal from "./pages/ActivityExpenseJournal";
import Attendance from "./pages/Attendance";
import Groups from "./pages/Groups";
import Staff from "./pages/Staff";
import StaffDetail from "./pages/StaffDetail";
import StaffExpenseJournal from "./pages/StaffExpenseJournal";
import StaffPayrollRegistry from "./pages/StaffPayrollRegistry";
import GardenAttendanceJournal from "./pages/GardenAttendanceJournal";
import NutritionReport from "./pages/NutritionReport";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/activities/:id/expenses" element={<ActivityExpenseJournal />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/staff/:id" element={<StaffDetail />} />
            <Route path="/staff-expenses" element={<StaffExpenseJournal />} />
            <Route path="/staff-payroll" element={<StaffPayrollRegistry />} />
            <Route path="/garden-attendance" element={<GardenAttendanceJournal />} />
            <Route path="/nutrition-report" element={<NutritionReport />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
