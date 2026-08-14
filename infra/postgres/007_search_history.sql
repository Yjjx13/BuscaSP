CREATE TABLE search_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_text VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_history_query_not_blank CHECK (char_length(btrim(query_text)) > 0)
);

CREATE INDEX search_history_user_created_idx ON search_history(user_id, created_at DESC);
