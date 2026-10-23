-- PayPal checkouts started from an AI chat.
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid,
  paypal_order_id text NOT NULL UNIQUE,
  status text NOT NULL,
  currency text NOT NULL,
  total_cents integer NOT NULL,
  items jsonb NOT NULL,
  approve_url text,
  capture_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_id_idx ON orders (user_id);
