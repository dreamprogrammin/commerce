-- ============================================================================
-- МАСТЕР МИГРАЦИЯ: Полная консолидация схемы базы данных
-- ============================================================================
-- Эта миграция гарантирует наличие всех таблиц, колонок и функций
-- Идемпотентная - можно запускать многократно без ошибок
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '╔════════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  НАЧАЛО МАСТЕР МИГРАЦИИ: Консолидация схемы БД                ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════════════╝';
END $$;

-- ============================================================================
-- ТАБЛИЦА: products
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: products';

    -- Создаём таблицу если не существует
    CREATE TABLE IF NOT EXISTS public.products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL DEFAULT 0,
        stock INTEGER NOT NULL DEFAULT 0,
        bonus_points INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Добавляем недостающие колонки
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_new') THEN
        ALTER TABLE public.products ADD COLUMN is_new BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '  ✓ Добавлена колонка: products.is_new';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_on_sale') THEN
        ALTER TABLE public.products ADD COLUMN is_on_sale BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '  ✓ Добавлена колонка: products.is_on_sale';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_featured') THEN
        ALTER TABLE public.products ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '  ✓ Добавлена колонка: products.is_featured';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='featured_order') THEN
        ALTER TABLE public.products ADD COLUMN featured_order INTEGER DEFAULT 0;
        RAISE NOTICE '  ✓ Добавлена колонка: products.featured_order';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='seo_title') THEN
        ALTER TABLE public.products ADD COLUMN seo_title TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: products.seo_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='seo_description') THEN
        ALTER TABLE public.products ADD COLUMN seo_description TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: products.seo_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='seo_keywords') THEN
        ALTER TABLE public.products ADD COLUMN seo_keywords TEXT[];
        RAISE NOTICE '  ✓ Добавлена колонка: products.seo_keywords';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='brand_id') THEN
        ALTER TABLE public.products ADD COLUMN brand_id UUID;
        RAISE NOTICE '  ✓ Добавлена колонка: products.brand_id';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='category_id') THEN
        ALTER TABLE public.products ADD COLUMN category_id UUID;
        RAISE NOTICE '  ✓ Добавлена колонка: products.category_id';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='product_line_id') THEN
        ALTER TABLE public.products ADD COLUMN product_line_id UUID;
        RAISE NOTICE '  ✓ Добавлена колонка: products.product_line_id';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='product_type_id') THEN
        ALTER TABLE public.products ADD COLUMN product_type_id INTEGER;
        RAISE NOTICE '  ✓ Добавлена колонка: products.product_type_id';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='country_id') THEN
        ALTER TABLE public.products ADD COLUMN country_id INTEGER;
        RAISE NOTICE '  ✓ Добавлена колонка: products.country_id';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='material_ids') THEN
        ALTER TABLE public.products ADD COLUMN material_ids INTEGER[];
        RAISE NOTICE '  ✓ Добавлена колонка: products.material_ids';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='min_age') THEN
        ALTER TABLE public.products ADD COLUMN min_age INTEGER;
        RAISE NOTICE '  ✓ Добавлена колонка: products.min_age';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='max_age') THEN
        ALTER TABLE public.products ADD COLUMN max_age INTEGER;
        RAISE NOTICE '  ✓ Добавлена колонка: products.max_age';
    END IF;
END $$;

-- ============================================================================
-- ТАБЛИЦА: categories
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: categories';

    CREATE TABLE IF NOT EXISTS public.categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        parent_id UUID,
        image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='blur_placeholder') THEN
        ALTER TABLE public.categories ADD COLUMN blur_placeholder TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: categories.blur_placeholder';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='allowed_brand_ids') THEN
        ALTER TABLE public.categories ADD COLUMN allowed_brand_ids UUID[];
        RAISE NOTICE '  ✓ Добавлена колонка: categories.allowed_brand_ids';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='allowed_product_line_ids') THEN
        ALTER TABLE public.categories ADD COLUMN allowed_product_line_ids UUID[];
        RAISE NOTICE '  ✓ Добавлена колонка: categories.allowed_product_line_ids';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='seo_title') THEN
        ALTER TABLE public.categories ADD COLUMN seo_title TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: categories.seo_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='seo_description') THEN
        ALTER TABLE public.categories ADD COLUMN seo_description TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: categories.seo_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='seo_keywords') THEN
        ALTER TABLE public.categories ADD COLUMN seo_keywords TEXT[];
        RAISE NOTICE '  ✓ Добавлена колонка: categories.seo_keywords';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='display_order') THEN
        ALTER TABLE public.categories ADD COLUMN display_order INTEGER DEFAULT 0;
        RAISE NOTICE '  ✓ Добавлена колонка: categories.display_order';
    END IF;
END $$;

-- ============================================================================
-- ТАБЛИЦА: brands
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: brands';

    CREATE TABLE IF NOT EXISTS public.brands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        logo_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brands' AND column_name='seo_title') THEN
        ALTER TABLE public.brands ADD COLUMN seo_title TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: brands.seo_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brands' AND column_name='seo_description') THEN
        ALTER TABLE public.brands ADD COLUMN seo_description TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: brands.seo_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brands' AND column_name='seo_keywords') THEN
        ALTER TABLE public.brands ADD COLUMN seo_keywords TEXT[];
        RAISE NOTICE '  ✓ Добавлена колонка: brands.seo_keywords';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brands' AND column_name='blur_placeholder') THEN
        ALTER TABLE public.brands ADD COLUMN blur_placeholder TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: brands.blur_placeholder';
    END IF;
END $$;

-- ============================================================================
-- ТАБЛИЦА: slides
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: slides';

    CREATE TABLE IF NOT EXISTS public.slides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT,
        subtitle TEXT,
        image_url TEXT NOT NULL,
        link_url TEXT,
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='slides' AND column_name='blur_placeholder') THEN
        ALTER TABLE public.slides ADD COLUMN blur_placeholder TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: slides.blur_placeholder';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='slides' AND column_name='image_url_mobile') THEN
        ALTER TABLE public.slides ADD COLUMN image_url_mobile TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: slides.image_url_mobile';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='slides' AND column_name='blur_placeholder_mobile') THEN
        ALTER TABLE public.slides ADD COLUMN blur_placeholder_mobile TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: slides.blur_placeholder_mobile';
    END IF;
END $$;

-- ============================================================================
-- ТАБЛИЦА: banners
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: banners';

    CREATE TABLE IF NOT EXISTS public.banners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT,
        description TEXT,
        image_url TEXT,
        cta_link TEXT,
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='banners' AND column_name='blur_placeholder') THEN
        ALTER TABLE public.banners ADD COLUMN blur_placeholder TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: banners.blur_placeholder';
    END IF;
END $$;

-- ============================================================================
-- ТАБЛИЦА: product_images
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: product_images';

    CREATE TABLE IF NOT EXISTS public.product_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL,
        image_url TEXT NOT NULL,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='product_images' AND column_name='blur_placeholder') THEN
        ALTER TABLE public.product_images ADD COLUMN blur_placeholder TEXT;
        RAISE NOTICE '  ✓ Добавлена колонка: product_images.blur_placeholder';
    END IF;
END $$;

-- ============================================================================
-- ТАБЛИЦА: product_lines
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: product_lines';

    CREATE TABLE IF NOT EXISTS public.product_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        brand_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
END $$;

-- ============================================================================
-- ТАБЛИЦА: orders
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: orders';

    CREATE TABLE IF NOT EXISTS public.orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        status TEXT DEFAULT 'pending',
        total_amount NUMERIC(10,2) NOT NULL,
        bonus_spent NUMERIC(10,2) DEFAULT 0,
        bonuses_awarded INTEGER DEFAULT 0,
        bonuses_activation_date TIMESTAMPTZ,
        delivery_address TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        customer_email TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='guest_checkout_id') THEN
        ALTER TABLE public.orders ADD COLUMN guest_checkout_id UUID;
        RAISE NOTICE '  ✓ Добавлена колонка: orders.guest_checkout_id';
    END IF;
END $$;

-- ============================================================================
-- ТАБЛИЦА: profiles
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: profiles';

    CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY,
        full_name TEXT,
        avatar_url TEXT,
        phone TEXT,
        role TEXT DEFAULT 'user',
        active_bonus_balance INTEGER DEFAULT 0,
        pending_bonus_balance INTEGER DEFAULT 0,
        has_received_welcome_bonus BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
END $$;

-- ============================================================================
-- ТАБЛИЦА: wishlist
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: wishlist';

    CREATE TABLE IF NOT EXISTS public.wishlist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        product_id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, product_id)
    );
END $$;

-- ============================================================================
-- ТАБЛИЦА: attributes
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: attributes';

    CREATE TABLE IF NOT EXISTS public.attributes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        display_type TEXT DEFAULT 'checkbox'
    );
END $$;

-- ============================================================================
-- ТАБЛИЦА: attribute_options
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: attribute_options';

    CREATE TABLE IF NOT EXISTS public.attribute_options (
        id SERIAL PRIMARY KEY,
        attribute_id INTEGER NOT NULL,
        value TEXT NOT NULL,
        meta JSONB
    );
END $$;

-- ============================================================================
-- ТАБЛИЦА: materials
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: materials';

    CREATE TABLE IF NOT EXISTS public.materials (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL
    );
END $$;

-- ============================================================================
-- ТАБЛИЦА: countries
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: countries';

    CREATE TABLE IF NOT EXISTS public.countries (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL
    );
END $$;

-- ============================================================================
-- ТАБЛИЦА: product_types
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '→ Проверка таблицы: product_types';

    CREATE TABLE IF NOT EXISTS public.product_types (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL
    );
END $$;

-- ============================================================================
-- Обновление кэша PostgREST
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '╔════════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  ЗАВЕРШЕНИЕ МАСТЕР МИГРАЦИИ                                    ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════════════╝';
END $$;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
