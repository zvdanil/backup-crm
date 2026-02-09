
-- This script creates the main table for storing calendar events.

-- Drop the table if it exists to ensure a clean slate (optional, be careful in production)
-- DROP TABLE IF EXISTS public.calendar_events;

-- 1. Create the calendar_events table
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Foreign keys to link with other tables
  -- ON DELETE SET NULL means if the linked activity or staff is deleted,
  -- this field will become NULL instead of deleting the event.
  activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,

  -- Core event details
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  color TEXT,

  -- The date of the FIRST occurrence of an event.
  -- For a single event, it's just the date of the event.
  -- For a recurring series, it's the date the series begins.
  start_date DATE NOT NULL,

  -- Recurrence rule based on iCalendar RRULE format.
  -- Stored in a flexible JSONB format.
  -- e.g., { "freq": "weekly", "byday": [1, 3], "until": "2024-12-31" }
  -- This will be NULL for single (non-recurring) events.
  rrule JSONB,

  -- A list of dates (as strings in 'YYYY-MM-DD' format) to exclude
  -- from a recurring event series.
  -- e.g., ["2024-10-28", "2024-11-04"]
  excluded_dates JSONB,
  
  -- A field to store any overrides for a specific instance of a recurring event.
  -- For example, if one class is moved to a different time or has a substitute teacher.
  -- The key is the instance date ('YYYY-MM-DD') and the value is an object with the changes.
  -- e.g., { "2024-11-05": { "start_time": "11:00", "teacher_id": "..." } }
  overrides JSONB
);

-- 2. Add comments to columns for better understanding in the Supabase UI
COMMENT ON TABLE public.calendar_events IS 'Stores master records for calendar lessons and events.';
COMMENT ON COLUMN public.calendar_events.start_date IS 'The date the event or series begins.';
COMMENT ON COLUMN public.calendar_events.rrule IS 'Recurrence rule in JSON format (similar to iCal RRULE).';
COMMENT ON COLUMN public.calendar_events.excluded_dates IS 'Dates to skip within a recurring series.';
COMMENT ON COLUMN public.calendar_events.overrides IS 'Specific modifications for individual instances of a recurring event.';


-- 3. Enable Row-Level Security (RLS)
-- This is a crucial security step. By default, no one can access the table.
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;


-- 4. Create RLS Policies
-- These policies define who can do what.
-- For now, we will allow any logged-in user to do anything.
-- You can restrict this later based on user roles (e.g., only admins can delete).

CREATE POLICY "Allow ALL for authenticated users"
ON public.calendar_events
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Optional but recommended: A function and trigger to automatically update the 'updated_at' timestamp.

-- 5. Create the function
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create the trigger to call the function before any update
CREATE TRIGGER set_timestamp_on_calendar_events
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Final message
SELECT 'SUCCESS: The "calendar_events" table has been created and configured.';
