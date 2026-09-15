ALTER TABLE wanted_responses
  ADD COLUMN IF NOT EXISTS stock_type VARCHAR(20) NOT NULL DEFAULT 'SPOT'
    CHECK (stock_type IN ('SPOT','PRESALE')),
  ADD COLUMN IF NOT EXISTS expected_available_at DATE;

ALTER TABLE wanted_response_offers
  ADD COLUMN IF NOT EXISTS stock_type VARCHAR(20) NOT NULL DEFAULT 'SPOT'
    CHECK (stock_type IN ('SPOT','PRESALE')),
  ADD COLUMN IF NOT EXISTS expected_available_at DATE;

CREATE INDEX IF NOT EXISTS wanted_responses_stock_type_idx
  ON wanted_responses (stock_type, updated_at DESC)
  WHERE status = 'ACTIVE';
