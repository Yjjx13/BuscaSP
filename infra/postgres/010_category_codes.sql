ALTER TABLE categories ADD COLUMN IF NOT EXISTS code VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS categories_code_unique_idx ON categories(code) WHERE code IS NOT NULL;
