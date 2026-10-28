ALTER TABLE users ADD COLUMN username_key text;

UPDATE users u
SET username_key = k.key
FROM (
  SELECT DISTINCT ON (translate(lower(username), '01i35_', 'olles'))
    id,
    translate(lower(username), '01i35_', 'olles') AS key
  FROM users
  ORDER BY translate(lower(username), '01i35_', 'olles'), created_at
) k
WHERE u.id = k.id;

CREATE UNIQUE INDEX users_username_key_unique ON users (username_key);

ALTER TABLE orders ADD COLUMN refund_request jsonb;
