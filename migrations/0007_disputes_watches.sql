ALTER TABLE orders ADD COLUMN dispute_id text;
ALTER TABLE orders ADD COLUMN dispute_status text;
ALTER TABLE orders ADD COLUMN dispute_reason text;

CREATE TABLE price_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  subscription_id text,
  title text NOT NULL,
  image_url text,
  currency text NOT NULL DEFAULT 'USD',
  target_cents integer,
  start_cents integer,
  last_cents integer,
  last_in_stock boolean,
  alert text,
  alerted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
CREATE INDEX price_watches_product_id_idx ON price_watches (product_id);
CREATE INDEX price_watches_user_id_idx ON price_watches (user_id);

CREATE TABLE webhook_events (
  id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);
