CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  brand text,
  description text,
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  currency text NOT NULL DEFAULT 'USD',
  compare_at_cents integer,
  in_stock boolean NOT NULL DEFAULT true,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  channel3_id text,
  supplier_name text,
  supplier_url text,
  supplier_cents integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_channel3_id_idx ON products (channel3_id) WHERE channel3_id IS NOT NULL;
