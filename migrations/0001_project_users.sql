-- Shoppers: username + scrypt password hash.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  -- Sandbox PayPal login the shopper linked; pre-fills checkout.
  paypal_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
