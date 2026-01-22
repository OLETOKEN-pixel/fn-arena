-- Reinstall extensions into a non-public schema (pg_net doesn't support SET SCHEMA)
CREATE SCHEMA IF NOT EXISTS extensions;

-- No scheduled jobs exist yet, safe to reinstall
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

DROP EXTENSION IF EXISTS pg_cron;
CREATE EXTENSION pg_cron WITH SCHEMA extensions;
