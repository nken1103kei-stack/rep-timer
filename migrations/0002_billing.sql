-- Pro subscription per user, kept in sync by Stripe webhooks.
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT,
  subscription_id TEXT,
  status TEXT NOT NULL,
  -- End of the paid period in ms; NULL until Stripe reports it.
  current_period_end INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS subscriptions_customer ON subscriptions (customer_id);
