-- Create enum for staff tariff types
CREATE TYPE staff_tariff_type AS ENUM ('fixed', 'percent', 'per_session');

-- Create table for staff (Персонал)
CREATE TABLE public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    position TEXT NOT NULL,
    tariff_type staff_tariff_type NOT NULL DEFAULT 'fixed',
    tariff_value DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add new columns to activities table
ALTER TABLE public.activities 
ADD COLUMN fixed_teacher_rate DECIMAL(10,2) DEFAULT 0,
ADD COLUMN payment_mode TEXT DEFAULT 'default';

-- Create table for teacher history in activities (історія викладачів)
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

-- Add teacher_id to enrollments for current teacher
ALTER TABLE public.enrollments 
ADD COLUMN teacher_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

-- Add auto_journal flag to activities
ALTER TABLE public.activities 
ADD COLUMN auto_journal BOOLEAN DEFAULT false;

-- Add value field to attendance (для довільних чисел)
ALTER TABLE public.attendance 
ADD COLUMN value DECIMAL(10,2) DEFAULT 0;

-- Enable RLS for new tables
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_teacher_history ENABLE ROW LEVEL SECURITY;

-- Policies for staff
CREATE POLICY "Allow all access to staff" ON public.staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to activity_teacher_history" ON public.activity_teacher_history FOR ALL USING (true) WITH CHECK (true);

-- Trigger for staff updated_at
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_activity_teacher_history_updated_at BEFORE UPDATE ON public.activity_teacher_history FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
