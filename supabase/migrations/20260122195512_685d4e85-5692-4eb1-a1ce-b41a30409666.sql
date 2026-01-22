-- Enable required extensions for scheduled function invocations
-- Note: extensions are created in the database; no app code changes required.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
