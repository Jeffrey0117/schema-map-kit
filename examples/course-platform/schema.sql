-- 示範用:一個多租戶線上課程平台的主幹資料表(SQLite 寫法)。
-- 這份結構是「真實系統長出來的樣子」,故意保留了幾個設計上的毛病,
-- 對照 DESIGN-RULES.md 看哪裡歪了。

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  is_active BOOLEAN,
  plan_tier TEXT,
  enabled_features JSON,
  created_at DATETIME
);

CREATE TABLE site_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  site_name TEXT,
  site_description TEXT,
  logo_url TEXT,
  og_image TEXT,
  brand_color TEXT,
  dark_mode BOOLEAN NOT NULL DEFAULT 0,
  contact_email TEXT,
  privacy_policy TEXT,
  terms_of_service TEXT,
  home_sections JSON,
  announcement_bar JSON,
  promo_banner JSON,
  entry_popup JSON,
  tracking_settings JSON,
  bio_page_enabled BOOLEAN,
  bio_page_theme TEXT,
  bio_page_layout TEXT,
  bio_links JSON,
  bio_carousel JSON,
  bio_text_blocks JSON
);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  user_type TEXT,
  is_blocked BOOLEAN,
  created_at DATETIME
);

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  short_id TEXT,
  content_type TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  thumbnail_url TEXT,
  is_published BOOLEAN,
  price NUMERIC,
  original_price INTEGER NOT NULL DEFAULT 0,
  sale_price INTEGER,
  content TEXT,
  is_members_only BOOLEAN,
  seo_elements JSON,
  created_at DATETIME
);

CREATE TABLE sections (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL
);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  section_id TEXT REFERENCES sections(id),
  tenant_id TEXT REFERENCES tenants(id),
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  video_url TEXT,
  duration INTEGER,
  is_free_preview BOOLEAN
);

CREATE TABLE lesson_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id),
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  completed BOOLEAN,
  position_seconds INTEGER NOT NULL DEFAULT 0,
  last_watched_at DATETIME
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  short_id TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  is_published BOOLEAN,
  original_price INTEGER,
  sale_price INTEGER,
  product_type TEXT,
  delivery_type TEXT,
  stock_quantity INTEGER,
  course_id TEXT REFERENCES courses(id),
  shipping_options JSON,
  variants JSON
);

CREATE TABLE discount_codes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value INTEGER NOT NULL,
  is_active BOOLEAN,
  valid_until DATETIME,
  max_uses INTEGER,
  used_count INTEGER
);

CREATE TABLE enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  tenant_id TEXT REFERENCES tenants(id),
  status TEXT,
  payment_method TEXT,
  final_price INTEGER,
  discount_code_id TEXT REFERENCES discount_codes(id),
  billing_name TEXT,
  billing_email TEXT,
  enrolled_at DATETIME,
  expires_at DATETIME
);

CREATE TABLE product_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  status TEXT,
  payment_method TEXT,
  final_price INTEGER,
  discount_code_id TEXT REFERENCES discount_codes(id),
  billing_name TEXT,
  billing_email TEXT,
  shipping_status TEXT,
  shipping_info JSON,
  purchased_at DATETIME
);

CREATE TABLE club_posts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  cover_image TEXT,
  is_published BOOLEAN NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME
);

CREATE TABLE communities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  slug TEXT,
  is_active BOOLEAN,
  member_count INTEGER,
  settings JSON
);

CREATE TABLE sales_pages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  linked_course_id TEXT REFERENCES courses(id),
  linked_product_id TEXT REFERENCES products(id),
  view_count INTEGER,
  content JSON NOT NULL
);
