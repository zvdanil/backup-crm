-- ============================================
-- KINDER CRM - Complete Database Schema
-- ============================================
-- This script creates all tables, enums, triggers, and policies
-- for the Kinder CRM system.
-- Execute this in Supabase SQL Editor

-- ============================================
-- 1. CREATE ENUMS
-- ============================================

-- Payment type enum
CREATE TYPE public.payment_type AS ENUM ('subscription', 'per_session');

-- Attendance status enum
CREATE TYPE public.attendance_status AS ENUM ('present', 'sick', 'absent', 'vacation');

-- Activity category enum
CREATE TYPE public.activity_category AS ENUM ('income', 'expense', 'additional_income', 'household_expense', 'salary');

-- Staff tariff type enum
CREATE TYPE public.staff_tariff_type AS ENUM ('fixed', 'percent', 'per_session');

-- Transaction type enum
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense', 'payment', 'salary', 'household');

-- ============================================
-- 2. CREATE TABLES
-- ============================================

-- Students table (Діти)
CREATE TABLE public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    birth_date DATE,
    guardian_name TEXT,
    guardian_phone TEXT,
    guardian_email TEXT,
    status TEXT DEFAULT 'active',
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Activities table (Активності)
CREATE TABLE public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    default_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_type public.payment_type DEFAULT 'per_session',
    teacher_payment_percent DECIMAL(5,2) DEFAULT 50,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    is_active BOOLEAN DEFAULT true,
    category public.activity_category NOT NULL DEFAULT 'income',
    fixed_teacher_rate DECIMAL(10,2) DEFAULT 0,
    payment_mode TEXT DEFAULT 'default',
    auto_journal BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Staff table (Персонал)
CREATE TABLE public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    position TEXT NOT NULL,
    tariff_type public.staff_tariff_type NOT NULL DEFAULT 'fixed',
    tariff_value DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enrollments table (Записи на активності)
CREATE TABLE public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    custom_price DECIMAL(10,2),
    discount_percent DECIMAL(5,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    unenrolled_at TIMESTAMP WITH TIME ZONE,
    effective_from DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(student_id, activity_id)
);

-- Attendance table (Відвідуваність)
CREATE TABLE public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status public.attendance_status DEFAULT 'present',
    charged_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    value DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(enrollment_id, date)
);

-- Activity Teacher History table (Історія викладачів)
CREATE TABLE public.activity_teacher_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    effective_to DATE,
    fixed_rate DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Finance Transactions table (Фінансові транзакції)
CREATE TABLE public.finance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type public.transaction_type NOT NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    category TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_finance_transactions_date ON public.finance_transactions(date);
CREATE INDEX idx_finance_transactions_student_id ON public.finance_transactions(student_id);
CREATE INDEX idx_finance_transactions_activity_id ON public.finance_transactions(activity_id);
CREATE INDEX idx_finance_transactions_type ON public.finance_transactions(type);
CREATE INDEX idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX idx_enrollments_activity_id ON public.enrollments(activity_id);
CREATE INDEX idx_attendance_enrollment_id ON public.attendance(enrollment_id);
CREATE INDEX idx_attendance_date ON public.attendance(date);

-- ============================================
-- 4. CREATE FUNCTIONS
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. CREATE TRIGGERS
-- ============================================

CREATE TRIGGER update_students_updated_at 
    BEFORE UPDATE ON public.students 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_activities_updated_at 
    BEFORE UPDATE ON public.activities 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_enrollments_updated_at 
    BEFORE UPDATE ON public.enrollments 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at 
    BEFORE UPDATE ON public.attendance 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_updated_at 
    BEFORE UPDATE ON public.staff 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_activity_teacher_history_updated_at 
    BEFORE UPDATE ON public.activity_teacher_history 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_finance_transactions_updated_at 
    BEFORE UPDATE ON public.finance_transactions 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 6. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_teacher_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. CREATE POLICIES (Allow all access for MVP)
-- ============================================

-- Students policies
CREATE POLICY "Allow all access to students" 
    ON public.students 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Activities policies
CREATE POLICY "Allow all access to activities" 
    ON public.activities 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Enrollments policies
CREATE POLICY "Allow all access to enrollments" 
    ON public.enrollments 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Attendance policies
CREATE POLICY "Allow all access to attendance" 
    ON public.attendance 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Staff policies
CREATE POLICY "Allow all access to staff" 
    ON public.staff 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Activity Teacher History policies
CREATE POLICY "Allow all access to activity_teacher_history" 
    ON public.activity_teacher_history 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Finance Transactions policies
CREATE POLICY "Allow all access to finance_transactions" 
    ON public.finance_transactions 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- ============================================
-- END OF SCRIPT
-- ============================================
-- All tables, enums, indexes, triggers, and policies have been created.
-- The database is ready to use with RLS enabled but with permissive policies
-- allowing all operations for development/testing purposes.
