-- Allow manual and auto entries to coexist for the same staff/activity/date
ALTER TABLE public.staff_journal_entries
DROP CONSTRAINT IF EXISTS staff_journal_entries_staff_id_activity_id_date_key;

ALTER TABLE public.staff_journal_entries
DROP CONSTRAINT IF EXISTS staff_journal_entries_staff_id_activity_id_entry_date_key;

ALTER TABLE public.staff_journal_entries
ADD CONSTRAINT staff_journal_entries_staff_id_activity_id_date_manual_key
UNIQUE (staff_id, activity_id, date, is_manual_override);
