DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'newregistration';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
