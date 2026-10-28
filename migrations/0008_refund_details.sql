ALTER TABLE orders ADD COLUMN refunds jsonb NOT NULL DEFAULT '[]'::jsonb;
