-- Create enum for transaction types
CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'payment', 'salary', 'household');

-- Create table for finance transactions
CREATE TABLE public.finance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type transaction_type NOT NULL,
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

-- Enable RLS
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

-- Policy for finance_transactions
CREATE POLICY "Allow all access to finance_transactions" ON public.finance_transactions FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_finance_transactions_updated_at BEFORE UPDATE ON public.finance_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for better performance
CREATE INDEX idx_finance_transactions_date ON public.finance_transactions(date);
CREATE INDEX idx_finance_transactions_student_id ON public.finance_transactions(student_id);
CREATE INDEX idx_finance_transactions_activity_id ON public.finance_transactions(activity_id);
CREATE INDEX idx_finance_transactions_type ON public.finance_transactions(type);
