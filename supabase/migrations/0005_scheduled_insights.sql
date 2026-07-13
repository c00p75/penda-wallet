create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The service-role key used to authorize this call lives in Supabase Vault
-- under the name 'service_role_key' (set once via the CLI, never committed to
-- source) so the cron job definition itself contains no secret material.
select
  cron.schedule(
    'weekly-insights',
    '0 20 * * 0', -- Sundays at 20:00 UTC
    $$
    select net.http_post(
      url := 'https://vnlfnepnhbkgwqthzxds.supabase.co/functions/v1/generate-insights',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $$
  );
