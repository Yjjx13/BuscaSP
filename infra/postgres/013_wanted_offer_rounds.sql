CREATE TABLE IF NOT EXISTS wanted_response_offers (
  id BIGSERIAL PRIMARY KEY,
  wanted_response_id BIGINT NOT NULL REFERENCES wanted_responses(id) ON DELETE CASCADE,
  sender_user_id BIGINT NOT NULL REFERENCES users(id),
  offer_price NUMERIC(12, 2),
  available_quantity VARCHAR(50) NOT NULL,
  message VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wanted_response_offers_timeline_idx
  ON wanted_response_offers (wanted_response_id, created_at, id);

INSERT INTO wanted_response_offers (wanted_response_id,sender_user_id,offer_price,available_quantity,message,created_at)
SELECT wr.id,wr.responder_user_id,wr.offer_price,COALESCE(wr.available_quantity,'数量面议'),wr.message,wr.created_at
FROM wanted_responses wr
WHERE NOT EXISTS (SELECT 1 FROM wanted_response_offers o WHERE o.wanted_response_id=wr.id);
