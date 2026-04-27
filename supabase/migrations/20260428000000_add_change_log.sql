-- Audit log table: tracks who created/modified records
CREATE TABLE public.change_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_change_log_record_id ON public.change_log (record_id);
CREATE INDEX idx_change_log_created_at ON public.change_log (created_at DESC);

ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_admin_read_change_log" ON public.change_log
  FOR SELECT USING (public.has_app_role(ARRAY['owner','admin']::public.user_role[]));

CREATE POLICY "service_insert_change_log" ON public.change_log
  FOR INSERT WITH CHECK (true);

-- Trigger function: EXCEPTION block ensures audit failure never breaks main transaction
CREATE OR REPLACE FUNCTION public.log_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO public.change_log (table_name, record_id, action, user_id)
    VALUES (
      TG_TABLE_NAME,
      CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
      TG_OP,
      auth.uid()
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Students
CREATE TRIGGER trg_students_log
  AFTER INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Staff
CREATE TRIGGER trg_staff_log
  AFTER INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Activities
CREATE TRIGGER trg_activities_log
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Enrollments
CREATE TRIGGER trg_enrollments_log
  AFTER INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Attendance: INSERT + UPDATE (who set or last changed the mark)
CREATE TRIGGER trg_attendance_log
  AFTER INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Finance transactions
CREATE TRIGGER trg_finance_transactions_log
  AFTER INSERT ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Expense journal entries: INSERT + UPDATE
CREATE TRIGGER trg_expense_journal_entries_log
  AFTER INSERT OR UPDATE ON public.expense_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Staff journal entries: INSERT + UPDATE
CREATE TRIGGER trg_staff_journal_entries_log
  AFTER INSERT OR UPDATE ON public.staff_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Staff billing rules: INSERT + UPDATE (payroll condition changes)
CREATE TRIGGER trg_staff_billing_rules_log
  AFTER INSERT OR UPDATE ON public.staff_billing_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Staff payouts
CREATE TRIGGER trg_staff_payouts_log
  AFTER INSERT ON public.staff_payouts
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Calendar events
CREATE TRIGGER trg_calendar_events_log
  AFTER INSERT ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Account transfers
CREATE TRIGGER trg_account_transfers_log
  AFTER INSERT ON public.account_transfers
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Payment account adjustments
CREATE TRIGGER trg_payment_account_adjustments_log
  AFTER INSERT ON public.payment_account_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- Cash withdrawals
CREATE TRIGGER trg_cash_withdrawals_log
  AFTER INSERT ON public.cash_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.log_change();
