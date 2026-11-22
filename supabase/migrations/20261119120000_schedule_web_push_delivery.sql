-- Requires pg_cron, pg_net and Vault to be enabled in the target project.
-- Credentials are provisioned separately in Vault; never embed them here.
-- Missing Vault entries make this run a no-op until rollout is complete.
SELECT cron.schedule(
  'trackasuwa-push-delivery',
  '*/5 * * * *',
  $job$
    SELECT net.http_get(
      url := endpoint.decrypted_secret,
      headers := jsonb_build_object('Authorization', 'Bearer ' || secret.decrypted_secret),
      timeout_milliseconds := 10000
    )
    FROM vault.decrypted_secrets AS endpoint
    CROSS JOIN vault.decrypted_secrets AS secret
    WHERE endpoint.name = 'trackasuwa_push_delivery_url'
      AND secret.name = 'trackasuwa_push_cron_secret';
  $job$
);
