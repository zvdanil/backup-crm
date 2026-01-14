-- ============================================
-- Groups System Migration
-- ============================================

-- 1. Create groups table
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(name)
);

-- 2. Add group_id column to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_groups_name ON public.groups(name);
CREATE INDEX IF NOT EXISTS idx_students_group_id ON public.students(group_id);

-- 4. Enable RLS for groups
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- 5. Create policy for groups
CREATE POLICY "Allow all access to groups" 
    ON public.groups 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- 6. Create trigger for updated_at on groups
CREATE TRIGGER update_groups_updated_at 
    BEFORE UPDATE ON public.groups 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();
