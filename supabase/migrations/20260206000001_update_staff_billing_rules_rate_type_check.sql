-- Allow new staff billing rule types used by the UI
ALTER TABLE public.staff_billing_rules
DROP CONSTRAINT IF EXISTS staff_billing_rules_rate_type_check;

ALTER TABLE public.staff_billing_rules
ADD CONSTRAINT staff_billing_rules_rate_type_check
CHECK (rate_type IN ('fixed', 'percent', 'per_session', 'subscription', 'per_student'));
