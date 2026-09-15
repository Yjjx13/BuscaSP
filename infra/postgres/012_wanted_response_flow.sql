ALTER TABLE wanted_responses
  ADD COLUMN IF NOT EXISTS offer_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS available_quantity VARCHAR(50),
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS wanted_responses_owner_unread_idx
  ON wanted_responses (wanted_post_id, read_at, created_at DESC)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS wanted_contact_events (
  id BIGSERIAL PRIMARY KEY,
  wanted_response_id BIGINT NOT NULL REFERENCES wanted_responses(id) ON DELETE CASCADE,
  viewer_user_id BIGINT NOT NULL REFERENCES users(id),
  responder_user_id BIGINT NOT NULL REFERENCES users(id),
  contact_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wanted_contact_events_response_idx
  ON wanted_contact_events (wanted_response_id, created_at DESC);
