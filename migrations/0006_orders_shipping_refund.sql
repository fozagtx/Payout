-- PayPal now collects a delivery address, and paid orders can be refunded.
ALTER TABLE orders ADD COLUMN shipping jsonb;
ALTER TABLE orders ADD COLUMN refund_id text;
CREATE INDEX orders_capture_id_idx ON orders (capture_id);
