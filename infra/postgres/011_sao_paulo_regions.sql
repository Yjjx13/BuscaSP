-- São Paulo trading areas. Codes are stored on users and may be inherited by
-- their products when a product does not have a more specific region set.
CREATE TABLE IF NOT EXISTS sao_paulo_regions (
  code VARCHAR(20) PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  city_code VARCHAR(20) NOT NULL DEFAULT 'SAO_PAULO',
  sort_order INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE INDEX IF NOT EXISTS idx_sao_paulo_regions_active_sort
  ON sao_paulo_regions (status, sort_order, code);
CREATE INDEX IF NOT EXISTS idx_users_region_code ON users (region_code);
CREATE INDEX IF NOT EXISTS idx_products_region_code ON products (region_code);

INSERT INTO sao_paulo_regions (code, name, sort_order) VALUES
  ('CENTRO', 'Centro', 1),
  ('BRAS', 'Brás', 2),
  ('BOM_RETIRO', 'Bom Retiro', 3),
  ('PARI', 'Pari', 4),
  ('MOOCA', 'Mooca', 5),
  ('BELENZINHO', 'Belenzinho', 6),
  ('LIBERDADE', 'Liberdade', 7),
  ('SE', 'Sé', 8),
  ('REPUBLICA', 'República', 9),
  ('SANTA_CECILIA', 'Santa Cecília', 10),
  ('CONSOLACAO', 'Consolação', 11),
  ('ACLIMACAO', 'Aclimação', 12),
  ('VILA_MARIANA', 'Vila Mariana', 13),
  ('PINHEIROS', 'Pinheiros', 14),
  ('ITAIM_BIBI', 'Itaim Bibi', 15),
  ('LAPA', 'Lapa', 16),
  ('BARRA_FUNDA', 'Barra Funda', 17),
  ('TATUAPE', 'Tatuapé', 18),
  ('VILA_PRUDENTE', 'Vila Prudente', 19),
  ('SANTO_AMARO', 'Santo Amaro', 20),
  ('PENHA', 'Penha', 21),
  ('CASA_VERDE', 'Casa Verde', 22),
  ('VILA_LEOPOLDINA', 'Vila Leopoldina', 23),
  ('GUAIANASES', 'Guaianases', 24)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order, status='ACTIVE';

-- Give the three local test merchants distinct, immediately visible areas.
UPDATE users SET region_code='CENTRO' WHERE id=1;
UPDATE users SET region_code='BRAS' WHERE id=2;
UPDATE users SET region_code='BOM_RETIRO' WHERE id=3;
