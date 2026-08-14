CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  wechat_openid VARCHAR(64) UNIQUE,
  phone_cipher VARCHAR(255),
  nickname VARCHAR(80) NOT NULL DEFAULT '找货用户',
  avatar_url VARCHAR(500),
  region_code VARCHAR(20),
  contact_policy VARCHAR(20) NOT NULL DEFAULT 'LOGIN_ONLY',
  wechat_id_cipher VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  limited_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT REFERENCES categories(id),
  name VARCHAR(80) NOT NULL,
  level SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3),
  sort_order INT NOT NULL DEFAULT 0,
  attribute_schema JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  category_id BIGINT REFERENCES categories(id),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 2 AND 1000),
  price_type VARCHAR(20) NOT NULL DEFAULT 'FIXED',
  price NUMERIC(12, 2),
  price_unit VARCHAR(30),
  quantity NUMERIC(14, 3),
  quantity_unit VARCHAR(30),
  spec_text VARCHAR(200),
  extra_attrs JSONB NOT NULL DEFAULT '{}',
  region_code VARCHAR(20),
  status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
  review_status VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUIRED',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT products_price_check CHECK ((price_type = 'FIXED' AND price IS NOT NULL AND price >= 0) OR price_type = 'NEGOTIABLE')
);

CREATE TABLE product_images (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  object_key VARCHAR(500) NOT NULL,
  thumb_key VARCHAR(500),
  sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 1 AND 9),
  is_cover BOOLEAN NOT NULL DEFAULT FALSE,
  moderation_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  image_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, sort_order)
);
CREATE UNIQUE INDEX product_images_one_cover ON product_images(product_id) WHERE is_cover;

CREATE TABLE wanted_posts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  category_id BIGINT REFERENCES categories(id),
  description TEXT,
  target_price NUMERIC(12, 2),
  quantity VARCHAR(50),
  spec_text VARCHAR(200),
  region_code VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE wanted_images (
  id BIGSERIAL PRIMARY KEY,
  wanted_post_id BIGINT NOT NULL REFERENCES wanted_posts(id) ON DELETE CASCADE,
  object_key VARCHAR(500) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wanted_responses (
  id BIGSERIAL PRIMARY KEY,
  wanted_post_id BIGINT NOT NULL REFERENCES wanted_posts(id) ON DELETE CASCADE,
  responder_user_id BIGINT NOT NULL REFERENCES users(id),
  product_id BIGINT REFERENCES products(id),
  message VARCHAR(300),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wanted_post_id, responder_user_id)
);

CREATE TABLE favorites (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_user_id BIGINT NOT NULL REFERENCES users(id),
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('PRODUCT', 'WANTED', 'USER')),
  target_id BIGINT NOT NULL,
  reason_code VARCHAR(30) NOT NULL,
  description VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  resolution VARCHAR(30),
  handled_by BIGINT REFERENCES users(id),
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_views (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewer_user_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX products_feed_idx ON products(status, published_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX products_owner_idx ON products(user_id, status, updated_at DESC);
CREATE INDEX products_category_idx ON products(category_id, status, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX products_expiry_idx ON products(expires_at) WHERE status = 'PUBLISHED';
CREATE INDEX products_description_trgm_idx ON products USING GIN (description gin_trgm_ops);
CREATE INDEX wanted_posts_feed_idx ON wanted_posts(status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX reports_open_idx ON reports(status, created_at DESC);

INSERT INTO categories (name, level, sort_order) VALUES
  ('全部货源', 1, 1), ('库存尾货', 1, 2), ('设备配件', 1, 3), ('原材料', 1, 4), ('其他', 1, 99);

