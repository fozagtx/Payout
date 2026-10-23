-- An order row is written before PayPal is called (status CREATING), so it
-- has no PayPal order id yet. UNIQUE still holds for the ids that exist.
ALTER TABLE orders ALTER COLUMN paypal_order_id DROP NOT NULL;
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);
