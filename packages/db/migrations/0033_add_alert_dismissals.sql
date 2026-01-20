CREATE TABLE IF NOT EXISTS "alert_dismissals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "alert_id" text NOT NULL,
  "dismissed_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_alert_dismissals_user_alert"
  ON "alert_dismissals" ("user_id", "alert_id");

CREATE INDEX IF NOT EXISTS "idx_alert_dismissals_user"
  ON "alert_dismissals" ("user_id");

