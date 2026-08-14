CREATE TABLE user_contacts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_type VARCHAR(20) NOT NULL CHECK (contact_type IN ('PHONE', 'WECHAT')),
  value_cipher TEXT NOT NULL,
  masked_value VARCHAR(80) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, contact_type)
);

CREATE TABLE contact_events (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewer_user_id BIGINT NOT NULL REFERENCES users(id),
  publisher_user_id BIGINT NOT NULL REFERENCES users(id),
  contact_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX contact_events_publisher_idx ON contact_events(publisher_user_id, created_at DESC);
CREATE INDEX contact_events_product_idx ON contact_events(product_id, created_at DESC);

