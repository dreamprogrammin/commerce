-- ============================================================================
--  Восстановленная миграция 20260522043812_remote_schema
-- ============================================================================
--  Эта миграция числилась применённой в проде, но файла в репозитории не было:
--  изменения вносили через дашборд, `supabase db pull` сохранил их снимок в
--  таблицу учёта, а сам файл в git не попал. Из-за этого `supabase db push`
--  падал с «Remote migration versions not found in local migrations directory»,
--  выкатка миграций встала, и последующие правки схемы делались руками — так
--  прод и разошёлся с каталогом миграций.
--
--  Текст восстановлен из самой базы: колонка statements строки 20260522043812
--  в supabase_migrations.schema_migrations, 462 оператора. То есть это ровно то,
--  что было применено к проду, а не реконструкция по памяти.
--
--  Файл нужен только чтобы история совпала. Применять его повторно не надо и
--  не получится: в проде он уже отмечен применённым.
-- ============================================================================

drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

drop trigger if exists "trigger_notify_telegram_cancelled" on "public"."guest_checkouts";

drop trigger if exists "trigger_notify_telegram_cancelled" on "public"."orders";

drop trigger if exists "trigger_notify_user_order" on "public"."orders";

drop trigger if exists "update_brand_questions_updated_at" on "public"."brand_questions";

drop trigger if exists "trigger_auto_generate_brand_faq" on "public"."brands";

drop trigger if exists "trigger_auto_generate_category_faq" on "public"."categories";

drop trigger if exists "trigger_categories_updated_at" on "public"."categories";

drop trigger if exists "update_category_brand_seo_updated_at" on "public"."category_brand_seo";

drop trigger if exists "update_category_questions_updated_at" on "public"."category_questions";

drop trigger if exists "handle_updated_at" on "public"."children";

drop trigger if exists "trigger_auto_generate_country_faq" on "public"."countries";

drop trigger if exists "trigger_update_country_questions_updated_at" on "public"."country_questions";

drop trigger if exists "on_guest_order_status_changed" on "public"."guest_checkouts";

drop trigger if exists "trigger_auto_confirm_guest_checkout" on "public"."guest_checkouts";

drop trigger if exists "trigger_guest_checkouts_updated_at" on "public"."guest_checkouts";

drop trigger if exists "trigger_notify_guest_checkout" on "public"."guest_checkouts";

drop trigger if exists "trigger_update_material_questions_updated_at" on "public"."material_questions";

drop trigger if exists "trigger_auto_generate_material_faq" on "public"."materials";

drop trigger if exists "trigger_telegram_on_notification" on "public"."notifications";

drop trigger if exists "on_order_status_changed" on "public"."orders";

drop trigger if exists "trigger_auto_confirm_order" on "public"."orders";

drop trigger if exists "trigger_orders_updated_at" on "public"."orders";

drop trigger if exists "trigger_request_review_on_delivery" on "public"."orders";

drop trigger if exists "trigger_user_bonus_earned" on "public"."orders";

drop trigger if exists "trigger_user_order_status_notification" on "public"."orders";

drop trigger if exists "trigger_update_product_line_questions_updated_at" on "public"."product_line_questions";

drop trigger if exists "trigger_auto_generate_product_line_faq" on "public"."product_lines";

drop trigger if exists "trigger_update_product_lines_updated_at" on "public"."product_lines";

drop trigger if exists "on_question_answered" on "public"."product_questions";

drop trigger if exists "update_product_questions_updated_at" on "public"."product_questions";

drop trigger if exists "trigger_award_bonus_for_review" on "public"."product_reviews";

drop trigger if exists "trigger_update_review_stats" on "public"."product_reviews";

drop trigger if exists "trigger_back_in_stock" on "public"."products";

drop trigger if exists "trigger_products_updated_at" on "public"."products";

drop trigger if exists "trigger_sync_promotion_flag" on "public"."products";

drop trigger if exists "trigger_wishlist_product_change" on "public"."products";

drop trigger if exists "trigger_profiles_updated_at" on "public"."profiles";

drop trigger if exists "trigger_protect_profile_role_update" on "public"."profiles";

drop trigger if exists "trigger_settings_updated_at" on "public"."settings";

drop trigger if exists "trigger_slides_updated_at" on "public"."slides";

drop trigger if exists "trigger_suppliers_updated_at" on "public"."suppliers";

drop policy "Allow admin full access for attribute_options" on "public"."attribute_options";

drop policy "Allow admin full access for attributes" on "public"."attributes";

drop policy "Admins can read all banners" on "public"."banners";

drop policy "Allow admin full access" on "public"."banners";

drop policy "Only admins can delete banners" on "public"."banners";

drop policy "Only admins can insert banners" on "public"."banners";

drop policy "Only admins can update banners" on "public"."banners";

drop policy "Enable delete for question owner or admin" on "public"."brand_questions";

drop policy "Enable insert for authenticated users" on "public"."brand_questions";

drop policy "Enable update for admins" on "public"."brand_questions";

drop policy "Enable delete for admins" on "public"."brands";

drop policy "Enable insert for admins" on "public"."brands";

drop policy "Enable update for admins" on "public"."brands";

drop policy "Admins can manage categories" on "public"."categories";

drop policy "Allow admin full access for category_attributes" on "public"."category_attributes";

drop policy "Enable write for admins" on "public"."category_brand_questions";

drop policy "Admin write access for category_brand_seo" on "public"."category_brand_seo";

drop policy "Enable delete for question owner or admin" on "public"."category_questions";

drop policy "Enable insert for authenticated users" on "public"."category_questions";

drop policy "Enable update for admins" on "public"."category_questions";

drop policy "Enable delete for admins" on "public"."countries";

drop policy "Enable insert for admins" on "public"."countries";

drop policy "Enable update for admins" on "public"."countries";

drop policy "Admins can manage all country questions" on "public"."country_questions";

drop policy "Admins can view guest checkout items" on "public"."guest_checkout_items";

drop policy "Admins can manage guest checkouts" on "public"."guest_checkouts";

drop policy "Admins can view all guest checkouts" on "public"."guest_checkouts";

drop policy "Admins can manage all material questions" on "public"."material_questions";

drop policy "Enable delete for admins" on "public"."materials";

drop policy "Enable insert for admins" on "public"."materials";

drop policy "Enable update for admins" on "public"."materials";

drop policy "Admins can manage all order items" on "public"."order_items";

drop policy "Allow adding items to orders" on "public"."order_items";

drop policy "Users can see their own order items" on "public"."order_items";

drop policy "Admins can manage all orders" on "public"."orders";

drop policy "Allow admin full access for product_attribute_values" on "public"."product_attribute_values";

drop policy "Admins can manage all product line questions" on "public"."product_line_questions";

drop policy "product_lines_admin_delete" on "public"."product_lines";

drop policy "product_lines_admin_insert" on "public"."product_lines";

drop policy "product_lines_admin_update" on "public"."product_lines";

drop policy "Admin delete questions" on "public"."product_questions";

drop policy "Admin update questions" on "public"."product_questions";

drop policy "Admins manage all reviews" on "public"."product_reviews";

drop policy "Admins can manage all products" on "public"."products";

drop policy "Admins can update all profiles" on "public"."profiles";

drop policy "Admins can view all profiles" on "public"."profiles";

drop policy "Admins full access to promo campaign products" on "public"."promo_campaign_products";

drop policy "Public can read promo campaign products" on "public"."promo_campaign_products";

drop policy "Admins full access to promo campaigns" on "public"."promo_campaigns";

drop policy "review_images_admin_all" on "public"."review_images";

drop policy "review_images_author_delete" on "public"."review_images";

drop policy "review_images_author_insert" on "public"."review_images";

drop policy "review_images_author_read" on "public"."review_images";

drop policy "review_images_public_read" on "public"."review_images";

drop policy "Admins can manage settings" on "public"."settings";

drop policy "Admins can manage all slides" on "public"."slides";

drop policy "Admins can do everything with suppliers" on "public"."suppliers";

drop policy "Admins read broadcasts" on "public"."telegram_broadcasts";

alter table "public"."guest_checkouts" drop constraint "guest_checkouts_source_check";

alter table "public"."orders" drop constraint "orders_source_check";

alter table "public"."attribute_options" drop constraint "attribute_options_attribute_id_fkey";

alter table "public"."bonus_activation_skipped" drop constraint "bonus_activation_skipped_order_id_fkey";

alter table "public"."bonus_transactions" drop constraint "bonus_transactions_order_id_fkey";

alter table "public"."bonus_transactions" drop constraint "bonus_transactions_user_id_fkey";

alter table "public"."brand_questions" drop constraint "brand_questions_brand_id_fkey";

alter table "public"."brand_questions" drop constraint "brand_questions_user_id_fkey";

alter table "public"."categories" drop constraint "categories_parent_id_fkey";

alter table "public"."category_attributes" drop constraint "category_attributes_attribute_id_fkey";

alter table "public"."category_attributes" drop constraint "category_attributes_category_id_fkey";

alter table "public"."category_brand_questions" drop constraint "category_brand_questions_brand_id_fkey";

alter table "public"."category_brand_questions" drop constraint "category_brand_questions_category_id_fkey";

alter table "public"."category_brand_seo" drop constraint "category_brand_seo_brand_id_fkey";

alter table "public"."category_brand_seo" drop constraint "category_brand_seo_category_id_fkey";

alter table "public"."category_questions" drop constraint "category_questions_category_id_fkey";

alter table "public"."category_questions" drop constraint "category_questions_user_id_fkey";

alter table "public"."country_questions" drop constraint "country_questions_country_id_fkey";

alter table "public"."country_questions" drop constraint "country_questions_user_id_fkey";

alter table "public"."guest_checkout_items" drop constraint "guest_checkout_items_checkout_id_fkey";

alter table "public"."guest_checkout_items" drop constraint "guest_checkout_items_product_id_fkey";

alter table "public"."material_questions" drop constraint "material_questions_material_id_fkey";

alter table "public"."material_questions" drop constraint "material_questions_user_id_fkey";

alter table "public"."order_items" drop constraint "order_items_order_id_fkey";

alter table "public"."order_items" drop constraint "order_items_product_id_fkey";

alter table "public"."order_return_items" drop constraint "order_return_items_product_id_fkey";

alter table "public"."order_return_items" drop constraint "order_return_items_return_id_fkey";

alter table "public"."order_returns" drop constraint "order_returns_created_by_fkey";

alter table "public"."order_returns" drop constraint "order_returns_guest_checkout_id_fkey";

alter table "public"."order_returns" drop constraint "order_returns_order_id_fkey";

alter table "public"."orders" drop constraint "orders_user_id_fkey";

alter table "public"."product_accessories" drop constraint "product_accessories_accessory_product_id_fkey";

alter table "public"."product_accessories" drop constraint "product_accessories_main_product_id_fkey";

alter table "public"."product_attribute_values" drop constraint "product_attribute_values_attribute_id_fkey";

alter table "public"."product_attribute_values" drop constraint "product_attribute_values_option_id_fkey";

alter table "public"."product_attribute_values" drop constraint "product_attribute_values_product_id_fkey";

alter table "public"."product_images" drop constraint "product_images_product_id_fkey";

alter table "public"."product_line_questions" drop constraint "product_line_questions_product_line_id_fkey";

alter table "public"."product_line_questions" drop constraint "product_line_questions_user_id_fkey";

alter table "public"."product_lines" drop constraint "product_lines_brand_id_fkey";

alter table "public"."product_questions" drop constraint "product_questions_product_id_fkey";

alter table "public"."product_questions" drop constraint "product_questions_profile_fk";

alter table "public"."product_reviews" drop constraint "product_reviews_order_id_fkey";

alter table "public"."product_reviews" drop constraint "product_reviews_product_id_fkey";

alter table "public"."product_reviews" drop constraint "product_reviews_profile_id_fkey";

alter table "public"."products" drop constraint "products_brand_id_fkey";

alter table "public"."products" drop constraint "products_category_id_fkey";

alter table "public"."products" drop constraint "products_material_id_fkey";

alter table "public"."products" drop constraint "products_origin_country_id_fkey";

alter table "public"."products" drop constraint "products_product_line_id_fkey";

alter table "public"."products" drop constraint "products_supplier_id_fkey";

alter table "public"."promo_campaign_products" drop constraint "promo_campaign_products_campaign_id_fkey";

alter table "public"."promo_campaign_products" drop constraint "promo_campaign_products_product_id_fkey";

alter table "public"."promo_campaigns" drop constraint "promo_campaigns_brand_id_fkey";

alter table "public"."promo_campaigns" drop constraint "promo_campaigns_category_id_fkey";

alter table "public"."promo_codes" drop constraint "promo_codes_user_id_fkey";

alter table "public"."reminder_logs" drop constraint "reminder_logs_notification_id_fkey";

alter table "public"."review_images" drop constraint "review_images_review_id_fkey";

alter table "public"."stock_alerts" drop constraint "stock_alerts_product_id_fkey";

alter table "public"."stock_alerts" drop constraint "stock_alerts_user_id_fkey";

alter table "public"."wishlist" drop constraint "wishlist_product_id_fkey";

drop function if exists "public"."get_filtered_products"(p_category_slug text, p_subcategory_ids uuid[], p_brand_ids text[], p_price_min numeric, p_price_max numeric, p_sort_by text, p_page_number integer, p_page_size integer, p_attributes attribute_filter[], p_country_ids text[], p_material_ids text[], p_product_line_ids text[], p_piece_count_min integer, p_piece_count_max integer);

drop view if exists "public"."all_orders_stats";

drop view if exists "public"."bonus_system_status";

drop function if exists "public"."get_category_brand_combinations"();

drop function if exists "public"."get_category_brand_seo"(p_category_slug text, p_brand_slug text);

alter table "public"."attribute_options" alter column "id" set default nextval('public.attribute_options_id_seq'::regclass);

alter table "public"."attributes" alter column "id" set default nextval('public.attributes_id_seq'::regclass);

alter table "public"."bonus_transactions" add column "profile_id" uuid;

alter table "public"."bonus_transactions" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."bonus_transactions" alter column "user_id" drop not null;

alter table "public"."categories" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."children" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."countries" alter column "id" set default nextval('public.countries_id_seq'::regclass);

alter table "public"."guest_checkout_items" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."guest_checkouts" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."guest_checkouts" alter column "source" set default 'web'::text;

alter table "public"."guest_checkouts" alter column "source" drop not null;

alter table "public"."materials" alter column "id" set default nextval('public.materials_id_seq'::regclass);

alter table "public"."notifications" add column "photo_url" text;

alter table "public"."notifications" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."order_items" drop column "bonus_points_per_item";

alter table "public"."order_items" drop column "price_per_item";

alter table "public"."order_items" add column "created_at" timestamp with time zone default now();

alter table "public"."order_items" add column "price_at_purchase" numeric(10,2) not null;

alter table "public"."order_items" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."order_return_items" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."order_returns" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."orders" add column "comment" text;

alter table "public"."orders" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."orders" alter column "source" set default 'web'::text;

alter table "public"."orders" alter column "source" drop not null;

alter table "public"."product_images" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."product_questions" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."product_types" alter column "id" set default nextval('public.product_types_id_seq'::regclass);

alter table "public"."products" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."slides" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."telegram_broadcasts" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."telegram_link_codes" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."telegram_reverse_links" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."user_addresses" alter column "id" set default extensions.uuid_generate_v4();

CREATE INDEX idx_bonus_transactions_profile_id ON public.bonus_transactions USING btree (profile_id);

alter table "public"."bonus_transactions" add constraint "bonus_transactions_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."bonus_transactions" validate constraint "bonus_transactions_profile_id_fkey";

alter table "public"."attribute_options" add constraint "attribute_options_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES public.attributes(id) ON DELETE CASCADE not valid;

alter table "public"."attribute_options" validate constraint "attribute_options_attribute_id_fkey";

alter table "public"."bonus_activation_skipped" add constraint "bonus_activation_skipped_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."bonus_activation_skipped" validate constraint "bonus_activation_skipped_order_id_fkey";

alter table "public"."bonus_transactions" add constraint "bonus_transactions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL not valid;

alter table "public"."bonus_transactions" validate constraint "bonus_transactions_order_id_fkey";

alter table "public"."bonus_transactions" add constraint "bonus_transactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."bonus_transactions" validate constraint "bonus_transactions_user_id_fkey";

alter table "public"."brand_questions" add constraint "brand_questions_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE not valid;

alter table "public"."brand_questions" validate constraint "brand_questions_brand_id_fkey";

alter table "public"."brand_questions" add constraint "brand_questions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."brand_questions" validate constraint "brand_questions_user_id_fkey";

alter table "public"."categories" add constraint "categories_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL not valid;

alter table "public"."categories" validate constraint "categories_parent_id_fkey";

alter table "public"."category_attributes" add constraint "category_attributes_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES public.attributes(id) ON DELETE CASCADE not valid;

alter table "public"."category_attributes" validate constraint "category_attributes_attribute_id_fkey";

alter table "public"."category_attributes" add constraint "category_attributes_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE not valid;

alter table "public"."category_attributes" validate constraint "category_attributes_category_id_fkey";

alter table "public"."category_brand_questions" add constraint "category_brand_questions_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE not valid;

alter table "public"."category_brand_questions" validate constraint "category_brand_questions_brand_id_fkey";

alter table "public"."category_brand_questions" add constraint "category_brand_questions_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE not valid;

alter table "public"."category_brand_questions" validate constraint "category_brand_questions_category_id_fkey";

alter table "public"."category_brand_seo" add constraint "category_brand_seo_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE not valid;

alter table "public"."category_brand_seo" validate constraint "category_brand_seo_brand_id_fkey";

alter table "public"."category_brand_seo" add constraint "category_brand_seo_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE not valid;

alter table "public"."category_brand_seo" validate constraint "category_brand_seo_category_id_fkey";

alter table "public"."category_questions" add constraint "category_questions_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE not valid;

alter table "public"."category_questions" validate constraint "category_questions_category_id_fkey";

alter table "public"."category_questions" add constraint "category_questions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."category_questions" validate constraint "category_questions_user_id_fkey";

alter table "public"."country_questions" add constraint "country_questions_country_id_fkey" FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE CASCADE not valid;

alter table "public"."country_questions" validate constraint "country_questions_country_id_fkey";

alter table "public"."country_questions" add constraint "country_questions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."country_questions" validate constraint "country_questions_user_id_fkey";

alter table "public"."guest_checkout_items" add constraint "guest_checkout_items_checkout_id_fkey" FOREIGN KEY (checkout_id) REFERENCES public.guest_checkouts(id) ON DELETE CASCADE not valid;

alter table "public"."guest_checkout_items" validate constraint "guest_checkout_items_checkout_id_fkey";

alter table "public"."guest_checkout_items" add constraint "guest_checkout_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT not valid;

alter table "public"."guest_checkout_items" validate constraint "guest_checkout_items_product_id_fkey";

alter table "public"."material_questions" add constraint "material_questions_material_id_fkey" FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE not valid;

alter table "public"."material_questions" validate constraint "material_questions_material_id_fkey";

alter table "public"."material_questions" add constraint "material_questions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."material_questions" validate constraint "material_questions_user_id_fkey";

alter table "public"."order_items" add constraint "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."order_items" validate constraint "order_items_order_id_fkey";

alter table "public"."order_items" add constraint "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT not valid;

alter table "public"."order_items" validate constraint "order_items_product_id_fkey";

alter table "public"."order_return_items" add constraint "order_return_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."order_return_items" validate constraint "order_return_items_product_id_fkey";

alter table "public"."order_return_items" add constraint "order_return_items_return_id_fkey" FOREIGN KEY (return_id) REFERENCES public.order_returns(id) ON DELETE CASCADE not valid;

alter table "public"."order_return_items" validate constraint "order_return_items_return_id_fkey";

alter table "public"."order_returns" add constraint "order_returns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) not valid;

alter table "public"."order_returns" validate constraint "order_returns_created_by_fkey";

alter table "public"."order_returns" add constraint "order_returns_guest_checkout_id_fkey" FOREIGN KEY (guest_checkout_id) REFERENCES public.guest_checkouts(id) ON DELETE CASCADE not valid;

alter table "public"."order_returns" validate constraint "order_returns_guest_checkout_id_fkey";

alter table "public"."order_returns" add constraint "order_returns_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."order_returns" validate constraint "order_returns_order_id_fkey";

alter table "public"."orders" add constraint "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."orders" validate constraint "orders_user_id_fkey";

alter table "public"."product_accessories" add constraint "product_accessories_accessory_product_id_fkey" FOREIGN KEY (accessory_product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_accessories" validate constraint "product_accessories_accessory_product_id_fkey";

alter table "public"."product_accessories" add constraint "product_accessories_main_product_id_fkey" FOREIGN KEY (main_product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_accessories" validate constraint "product_accessories_main_product_id_fkey";

alter table "public"."product_attribute_values" add constraint "product_attribute_values_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES public.attributes(id) ON DELETE CASCADE not valid;

alter table "public"."product_attribute_values" validate constraint "product_attribute_values_attribute_id_fkey";

alter table "public"."product_attribute_values" add constraint "product_attribute_values_option_id_fkey" FOREIGN KEY (option_id) REFERENCES public.attribute_options(id) ON DELETE CASCADE not valid;

alter table "public"."product_attribute_values" validate constraint "product_attribute_values_option_id_fkey";

alter table "public"."product_attribute_values" add constraint "product_attribute_values_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_attribute_values" validate constraint "product_attribute_values_product_id_fkey";

alter table "public"."product_images" add constraint "product_images_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_images" validate constraint "product_images_product_id_fkey";

alter table "public"."product_line_questions" add constraint "product_line_questions_product_line_id_fkey" FOREIGN KEY (product_line_id) REFERENCES public.product_lines(id) ON DELETE CASCADE not valid;

alter table "public"."product_line_questions" validate constraint "product_line_questions_product_line_id_fkey";

alter table "public"."product_line_questions" add constraint "product_line_questions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."product_line_questions" validate constraint "product_line_questions_user_id_fkey";

alter table "public"."product_lines" add constraint "product_lines_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE not valid;

alter table "public"."product_lines" validate constraint "product_lines_brand_id_fkey";

alter table "public"."product_questions" add constraint "product_questions_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_questions" validate constraint "product_questions_product_id_fkey";

alter table "public"."product_questions" add constraint "product_questions_profile_fk" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."product_questions" validate constraint "product_questions_profile_fk";

alter table "public"."product_reviews" add constraint "product_reviews_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL not valid;

alter table "public"."product_reviews" validate constraint "product_reviews_order_id_fkey";

alter table "public"."product_reviews" add constraint "product_reviews_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_reviews" validate constraint "product_reviews_product_id_fkey";

alter table "public"."product_reviews" add constraint "product_reviews_profile_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."product_reviews" validate constraint "product_reviews_profile_id_fkey";

alter table "public"."products" add constraint "products_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES public.brands(id) not valid;

alter table "public"."products" validate constraint "products_brand_id_fkey";

alter table "public"."products" add constraint "products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL not valid;

alter table "public"."products" validate constraint "products_category_id_fkey";

alter table "public"."products" add constraint "products_material_id_fkey" FOREIGN KEY (material_id) REFERENCES public.materials(id) not valid;

alter table "public"."products" validate constraint "products_material_id_fkey";

alter table "public"."products" add constraint "products_origin_country_id_fkey" FOREIGN KEY (origin_country_id) REFERENCES public.countries(id) not valid;

alter table "public"."products" validate constraint "products_origin_country_id_fkey";

alter table "public"."products" add constraint "products_product_line_id_fkey" FOREIGN KEY (product_line_id) REFERENCES public.product_lines(id) ON DELETE SET NULL not valid;

alter table "public"."products" validate constraint "products_product_line_id_fkey";

alter table "public"."products" add constraint "products_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL not valid;

alter table "public"."products" validate constraint "products_supplier_id_fkey";

alter table "public"."promo_campaign_products" add constraint "promo_campaign_products_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.promo_campaigns(id) ON DELETE CASCADE not valid;

alter table "public"."promo_campaign_products" validate constraint "promo_campaign_products_campaign_id_fkey";

alter table "public"."promo_campaign_products" add constraint "promo_campaign_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."promo_campaign_products" validate constraint "promo_campaign_products_product_id_fkey";

alter table "public"."promo_campaigns" add constraint "promo_campaigns_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL not valid;

alter table "public"."promo_campaigns" validate constraint "promo_campaigns_brand_id_fkey";

alter table "public"."promo_campaigns" add constraint "promo_campaigns_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL not valid;

alter table "public"."promo_campaigns" validate constraint "promo_campaigns_category_id_fkey";

alter table "public"."promo_codes" add constraint "promo_codes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."promo_codes" validate constraint "promo_codes_user_id_fkey";

alter table "public"."reminder_logs" add constraint "reminder_logs_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE SET NULL not valid;

alter table "public"."reminder_logs" validate constraint "reminder_logs_notification_id_fkey";

alter table "public"."review_images" add constraint "review_images_review_id_fkey" FOREIGN KEY (review_id) REFERENCES public.product_reviews(id) ON DELETE CASCADE not valid;

alter table "public"."review_images" validate constraint "review_images_review_id_fkey";

alter table "public"."stock_alerts" add constraint "stock_alerts_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."stock_alerts" validate constraint "stock_alerts_product_id_fkey";

alter table "public"."stock_alerts" add constraint "stock_alerts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."stock_alerts" validate constraint "stock_alerts_user_id_fkey";

alter table "public"."wishlist" add constraint "wishlist_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."wishlist" validate constraint "wishlist_product_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.can_assign_order(p_order_id uuid, p_table_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  IF p_table_name = 'orders' THEN
    SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  ELSE
    SELECT status INTO v_status FROM public.guest_checkouts WHERE id = p_order_id;
  END IF;
  
  -- Можно взять только если статус 'new'
  RETURN v_status = 'new';
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_guest_checkout(p_cart_items jsonb, p_guest_info jsonb, p_delivery_method text, p_delivery_address jsonb DEFAULT NULL::jsonb, p_payment_method text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_new_checkout_id UUID;
  v_total_price NUMERIC := 0;
  v_cart_item RECORD;
  v_product_record RECORD;
BEGIN
  -- Валидация гостевых данных
  IF p_guest_info->>'name' IS NULL OR p_guest_info->>'email' IS NULL OR p_guest_info->>'phone' IS NULL THEN
    RAISE EXCEPTION 'Необходимо указать имя, email и телефон';
  END IF;

  -- Рассчитываем общую стоимость и проверяем наличие
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price, stock_quantity INTO v_product_record
    FROM public.products WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    v_total_price := v_total_price + (v_product_record.price * v_cart_item.quantity);
  END LOOP;

  -- ИСПРАВЛЕНИЕ: Явно указываем source = 'online'
  INSERT INTO public.guest_checkouts (
    guest_name, guest_email, guest_phone,
    total_amount, final_amount, delivery_method, delivery_address, payment_method, status, source
  )
  VALUES (
    p_guest_info->>'name', p_guest_info->>'email', p_guest_info->>'phone',
    v_total_price, v_total_price, p_delivery_method, p_delivery_address, p_payment_method, 'new', 'online'
  )
  RETURNING id INTO v_new_checkout_id;

  -- Добавляем товары в гостевой заказ
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price INTO v_product_record FROM public.products WHERE id = v_cart_item.product_id;

    INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
    VALUES (v_new_checkout_id, v_cart_item.product_id, v_cart_item.quantity, v_product_record.price);
  END LOOP;

  RETURN v_new_checkout_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_user_order(p_cart_items jsonb, p_delivery_method text, p_delivery_address jsonb DEFAULT NULL::jsonb, p_payment_method text DEFAULT 'card'::text, p_bonuses_to_spend integer DEFAULT 0, p_promo_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_user_profile RECORD;
  v_cart_item RECORD;
  v_product RECORD;
  v_total_price NUMERIC := 0;
  v_total_award_bonuses INTEGER := 0;
  v_calculated_discount NUMERIC := 0;
  v_final_price NUMERIC;
  v_bonus_rate NUMERIC;
  v_new_order_id UUID;
  v_validated_items JSONB := '[]'::JSONB;
  v_is_first_order BOOLEAN;
  v_new_active_balance NUMERIC;
  v_promo RECORD;
  v_promo_discount NUMERIC := 0;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Пользователь не авторизован';
  END IF;

  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;
  IF v_user_profile IS NULL THEN
    RAISE EXCEPTION 'Профиль пользователя не найден';
  END IF;

  -- Проверка промокода
  IF p_promo_code IS NOT NULL THEN
    SELECT * INTO v_promo FROM public.promo_codes
    WHERE code = p_promo_code
      AND is_active = TRUE
      AND (valid_from IS NULL OR valid_from <= NOW())
      AND (valid_until IS NULL OR valid_until >= NOW())
      AND (usage_limit IS NULL OR usage_count < usage_limit);

    IF v_promo IS NULL THEN
      RAISE EXCEPTION 'Промокод недействителен или истек';
    END IF;

    IF v_promo.min_order_amount IS NOT NULL THEN
      SELECT SUM(p.final_price * (item->>'quantity')::INTEGER)
      INTO v_total_price
      FROM jsonb_array_elements(p_cart_items) AS item
      JOIN public.products p ON p.id = (item->>'product_id')::UUID;

      IF v_total_price < v_promo.min_order_amount THEN
        RAISE EXCEPTION 'Минимальная сумма заказа для промокода: %', v_promo.min_order_amount;
      END IF;
    END IF;
  END IF;

  -- Валидация товаров
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT id, final_price, stock_quantity, bonus_points_award, is_active
    INTO v_product
    FROM public.products
    WHERE id = v_cart_item.product_id;

    IF v_product IS NULL OR NOT v_product.is_active THEN
      RAISE EXCEPTION 'Товар не найден или неактивен: %', v_cart_item.product_id;
    END IF;

    IF v_product.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе. Доступно: % шт.', v_product.stock_quantity;
    END IF;

    v_total_price := v_total_price + (v_product.final_price * v_cart_item.quantity);
    v_total_award_bonuses := v_total_award_bonuses + (COALESCE(v_product.bonus_points_award, 0) * v_cart_item.quantity);

    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_product.id,
      'quantity', v_cart_item.quantity,
      'final_price', v_product.final_price,
      'bonus_points', COALESCE(v_product.bonus_points_award, 0)
    );
  END LOOP;

  -- Применение промокода
  IF v_promo IS NOT NULL THEN
    IF v_promo.discount_type = 'percentage' THEN
      v_promo_discount := v_total_price * (v_promo.discount_value / 100.0);
    ELSIF v_promo.discount_type = 'fixed' THEN
      v_promo_discount := v_promo.discount_value;
    END IF;
    v_promo_discount := LEAST(v_promo_discount, v_total_price);
  END IF;

  -- Применение бонусов
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    IF COALESCE(v_user_profile.active_bonus_balance, 0) < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %', COALESCE(v_user_profile.active_bonus_balance, 0);
    END IF;

    SELECT COALESCE((value->>'bonus_conversion_rate')::NUMERIC, 1.0)
    INTO v_bonus_rate FROM public.settings WHERE key = 'bonus_system';

    v_calculated_discount := p_bonuses_to_spend * COALESCE(v_bonus_rate, 1.0);
  END IF;

  v_calculated_discount := v_calculated_discount + v_promo_discount;
  v_final_price := GREATEST(COALESCE(v_total_price, 0) - COALESCE(v_calculated_discount, 0), 0);

  -- ИСПРАВЛЕНИЕ: Явно указываем source = 'online'
  INSERT INTO public.orders (
    user_id, total_amount, discount_amount, final_amount,
    bonuses_spent, bonuses_awarded, delivery_method, delivery_address, payment_method, status, source
  )
  VALUES (
    v_current_user_id,
    COALESCE(v_total_price, 0),
    COALESCE(v_calculated_discount, 0),
    COALESCE(v_final_price, 0),
    COALESCE(p_bonuses_to_spend, 0),
    COALESCE(v_total_award_bonuses, 0),
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    'new',
    'online'  -- ДОБАВЛЕНО: явное указание source
  )
  RETURNING id INTO v_new_order_id;

  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(v_validated_items) AS x(product_id UUID, quantity INTEGER, final_price NUMERIC, bonus_points INTEGER) LOOP
    INSERT INTO public.order_items (order_id, product_id, quantity, price_per_item, bonus_points_per_item)
    VALUES (v_new_order_id, v_cart_item.product_id, v_cart_item.quantity, v_cart_item.final_price, v_cart_item.bonus_points);
  END LOOP;

  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    v_new_active_balance := GREATEST(COALESCE(v_user_profile.active_bonus_balance, 0) - p_bonuses_to_spend, 0);

    UPDATE public.profiles
    SET active_bonus_balance = v_new_active_balance
    WHERE id = v_current_user_id;

    INSERT INTO public.bonus_transactions (profile_id, order_id, transaction_type, amount, balance_after, description)
    VALUES (
      v_current_user_id,
      v_new_order_id,
      'spent',
      -p_bonuses_to_spend,
      v_new_active_balance,
      'Списание бонусов при оформлении заказа'
    );
  END IF;

  SELECT NOT EXISTS(SELECT 1 FROM public.orders WHERE user_id = v_current_user_id AND id != v_new_order_id)
  INTO v_is_first_order;

  IF v_is_first_order AND NOT COALESCE(v_user_profile.has_received_welcome_bonus, FALSE) THEN
    UPDATE public.profiles
    SET active_bonus_balance = COALESCE(active_bonus_balance, 0) + 1000,
        has_received_welcome_bonus = TRUE
    WHERE id = v_current_user_id;

    INSERT INTO public.bonus_transactions (profile_id, order_id, transaction_type, amount, balance_after, description)
    VALUES (
      v_current_user_id,
      v_new_order_id,
      'earned',
      1000,
      COALESCE(v_user_profile.active_bonus_balance, 0) + 1000,
      'Приветственный бонус за первый заказ'
    );
  END IF;

  IF COALESCE(v_total_award_bonuses, 0) > 0 THEN
    UPDATE public.profiles
    SET pending_bonus_balance = COALESCE(pending_bonus_balance, 0) + v_total_award_bonuses
    WHERE id = v_current_user_id;

    INSERT INTO public.bonus_transactions (
      profile_id, order_id, transaction_type, amount, balance_after,
      description, activation_date
    )
    VALUES (
      v_current_user_id,
      v_new_order_id,
      'pending',
      v_total_award_bonuses,
      COALESCE(v_user_profile.pending_bonus_balance, 0) + v_total_award_bonuses,
      'Бонусы за покупку (активируются через 14 дней)',
      NOW() + INTERVAL '14 days'
    );
  END IF;

  IF v_promo IS NOT NULL THEN
    UPDATE public.promo_codes
    SET usage_count = usage_count + 1
    WHERE id = v_promo.id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_new_order_id,
    'total', COALESCE(v_total_price, 0),
    'discount', COALESCE(v_calculated_discount, 0),
    'final', COALESCE(v_final_price, 0),
    'bonuses_spent', COALESCE(p_bonuses_to_spend, 0),
    'bonuses_awarded', COALESCE(v_total_award_bonuses, 0)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_filtered_products(p_category_slug text, p_subcategory_ids uuid[] DEFAULT NULL::uuid[], p_brand_ids text[] DEFAULT NULL::text[], p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_sort_by text DEFAULT 'popularity'::text, p_page_number integer DEFAULT 1, p_page_size integer DEFAULT 12, p_attributes public.attribute_filter[] DEFAULT NULL::public.attribute_filter[], p_country_ids text[] DEFAULT NULL::text[], p_material_ids text[] DEFAULT NULL::text[], p_product_line_ids text[] DEFAULT NULL::text[], p_piece_count_min integer DEFAULT NULL::integer, p_piece_count_max integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, name text, slug text, description text, price numeric, category_id uuid, bonus_points_award integer, stock_quantity integer, sales_count integer, is_active boolean, min_age_years integer, max_age_years integer, gender text, accessory_ids uuid[], is_accessory boolean, barcode text, brand_id uuid, origin_country_id integer, material_id integer, discount_percentage numeric, created_at timestamp with time zone, updated_at timestamp with time zone, final_price numeric, avg_rating numeric, review_count integer, product_images json, brand_name text, brand_slug text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_offset INT;
    v_category_ids UUID[];
    v_subcategory_ids_expanded UUID[];
BEGIN
    v_offset := (p_page_number - 1) * p_page_size;

    -- Если переданы подкатегории, расширяем их рекурсивно (включая дочерние категории)
    IF p_subcategory_ids IS NOT NULL AND CARDINALITY(p_subcategory_ids) > 0 THEN
        SELECT ARRAY(
            SELECT DISTINCT cat.id
            FROM unnest(p_subcategory_ids) AS parent_id
            CROSS JOIN LATERAL public.get_category_and_children_ids_by_uuid(parent_id) cat
        ) INTO v_subcategory_ids_expanded;
    END IF;

    -- Логика для получения всех ID категорий, если slug не 'all'
    IF p_category_slug <> 'all' THEN
      SELECT ARRAY(SELECT cat.id FROM public.get_category_and_children_ids(p_category_slug) cat) INTO v_category_ids;
    END IF;

    RETURN QUERY
    WITH filtered_products AS (
        SELECT
            p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
            p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
            p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
            -- ⭐ ДОБАВЛЕНО: final_price (generated column с психологическим округлением)
            p.final_price,
            -- Рейтинг и отзывы
            p.avg_rating,
            p.review_count,
            b.name AS brand_name,
            b.slug AS brand_slug
        FROM
            public.products p
        LEFT JOIN
            public.brands b ON p.brand_id = b.id
        WHERE
            p.is_active = TRUE
            -- 1. Фильтр по категориям / подкатегориям (с рекурсивной поддержкой дочерних категорий)
            AND (
                -- Если выбраны подкатегории, используем расширенный массив (включая дочерние)
                (v_subcategory_ids_expanded IS NOT NULL AND CARDINALITY(v_subcategory_ids_expanded) > 0
                    AND p.category_id = ANY(v_subcategory_ids_expanded))
                -- Если подкатегории не выбраны, используем основную категорию (с дочерними)
                OR (v_subcategory_ids_expanded IS NULL AND (p_category_slug = 'all' OR p.category_id = ANY(v_category_ids)))
            )
            -- 2. Фильтр по брендам
            AND (p_brand_ids IS NULL OR p.brand_id::TEXT = ANY(p_brand_ids))
            -- 3. Фильтр по линейкам продуктов
            AND (p_product_line_ids IS NULL OR p.product_line_id::TEXT = ANY(p_product_line_ids))
            -- 4. Фильтр по цене (используем final_price для учета скидок)
            AND (p_price_min IS NULL OR COALESCE(p.final_price, p.price) >= p_price_min)
            AND (p_price_max IS NULL OR COALESCE(p.final_price, p.price) <= p_price_max)
            -- 5. Фильтр по стране происхождения
            AND (p_country_ids IS NULL OR p.origin_country_id::TEXT = ANY(p_country_ids))
            -- 6. Фильтр по материалу
            AND (p_material_ids IS NULL OR p.material_id::TEXT = ANY(p_material_ids))
            -- 7. Фильтр по количеству деталей (для конструкторов)
            AND (p_piece_count_min IS NULL OR p.piece_count >= p_piece_count_min)
            AND (p_piece_count_max IS NULL OR p.piece_count <= p_piece_count_max)
            -- 8. Фильтр по атрибутам (цвет, размер и т.д.)
            AND (
                p_attributes IS NULL
                OR p.id IN (
                    SELECT pav.product_id
                    FROM public.product_attribute_values pav
                    WHERE (pav.option_id = ANY(
                        SELECT unnest(
                            ARRAY_AGG(attr.option_ids)
                        )
                        FROM unnest(p_attributes) AS attr
                    ))
                    GROUP BY pav.product_id
                    HAVING COUNT(DISTINCT pav.attribute_id) = CARDINALITY(p_attributes)
                )
            )
    )
    SELECT
        fp.id, fp.name, fp.slug, fp.description, fp.price, fp.category_id, fp.bonus_points_award, fp.stock_quantity,
        fp.sales_count, fp.is_active, fp.min_age_years, fp.max_age_years, fp.gender, fp.accessory_ids, fp.is_accessory,
        fp.barcode, fp.brand_id, fp.origin_country_id, fp.material_id, fp.discount_percentage, fp.created_at, fp.updated_at,
        -- ⭐ ДОБАВЛЕНО: final_price
        fp.final_price,
        -- Рейтинг и отзывы
        fp.avg_rating,
        fp.review_count,
        -- Галерея изображений (JSON)
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', pi.id,
                        'image_url', pi.image_url,
                        'display_order', pi.display_order,
                        'alt_text', pi.alt_text,
                        'blur_placeholder', pi.blur_placeholder
                    )
                    ORDER BY pi.display_order ASC
                )
                FROM public.product_images pi
                WHERE pi.product_id = fp.id
            ),
            '[]'::json
        ) AS product_images,
        fp.brand_name,
        fp.brand_slug
    FROM
        filtered_products fp
    ORDER BY
        CASE
            WHEN p_sort_by = 'popularity' THEN fp.sales_count
            WHEN p_sort_by = 'newest' THEN EXTRACT(EPOCH FROM fp.created_at)::INT
            ELSE NULL
        END DESC NULLS LAST,
        CASE
            WHEN p_sort_by = 'price_asc' THEN COALESCE(fp.final_price, fp.price)
            ELSE NULL
        END ASC NULLS LAST,
        CASE
            WHEN p_sort_by = 'price_desc' THEN COALESCE(fp.final_price, fp.price)
            ELSE NULL
        END DESC NULLS LAST,
        fp.name ASC
    LIMIT p_page_size
    OFFSET v_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_bonus_transaction_user_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.profile_id IS NOT NULL AND NEW.user_id IS NULL THEN
    NEW.user_id := NEW.profile_id;
  END IF;
  IF NEW.user_id IS NOT NULL AND NEW.profile_id IS NULL THEN
    NEW.profile_id := NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

create or replace view "public"."all_orders_stats" as  SELECT 'user'::text AS order_type,
    count(*) AS total_orders,
    sum(orders.final_amount) AS total_revenue,
    sum(orders.bonuses_spent) AS total_bonuses_spent,
    sum(orders.bonuses_awarded) AS total_bonuses_awarded
   FROM public.orders
UNION ALL
 SELECT 'guest'::text AS order_type,
    count(*) AS total_orders,
    sum(guest_checkouts.final_amount) AS total_revenue,
    0 AS total_bonuses_spent,
    0 AS total_bonuses_awarded
   FROM public.guest_checkouts;

CREATE OR REPLACE FUNCTION public.award_bonus_for_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_profile RECORD;
  v_new_active INTEGER;
BEGIN
  IF NEW.is_published = true AND (OLD.is_published = false OR OLD.is_published IS NULL) THEN
    -- Проверяем, не давали ли уже бонус за этот отзыв
    IF EXISTS (
      SELECT 1 FROM public.bonus_transactions
      WHERE profile_id = NEW.user_id
        AND transaction_type = 'review'
        AND description LIKE '%' || NEW.id::text || '%'
    ) THEN
      RETURN NEW;
    END IF;

    -- Получаем текущие балансы
    SELECT active_bonus_balance, pending_bonus_balance
    INTO v_user_profile
    FROM public.profiles
    WHERE id = NEW.user_id;

    v_new_active := COALESCE(v_user_profile.active_bonus_balance, 0) + 500;

    -- Начисляем бонусы СРАЗУ в active (не в pending)
    INSERT INTO public.bonus_transactions (
      profile_id, user_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status, activation_date, created_at
    ) VALUES (
      NEW.user_id, NEW.user_id, 'review', 500,
      v_new_active,
      COALESCE(v_user_profile.pending_bonus_balance, 0),
      'Бонусы за отзыв (review: ' || NEW.id || ')',
      'completed',
      now(),
      now()
    );

    -- Обновляем active_bonus_balance (не pending!)
    UPDATE public.profiles
    SET active_bonus_balance = v_new_active
    WHERE id = NEW.user_id;

    -- Уведомление
    INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
    VALUES (
      NEW.user_id, 'bonus_earned',
      '🎁 Вам начислено 500 бонусов!',
      'Спасибо за отзыв! Бонусы уже доступны для использования.',
      '/profile/bonuses',
      false
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'award_bonus_for_review error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

create or replace view "public"."bonus_system_status" as  SELECT ( SELECT count(*) AS count
           FROM public.profiles
          WHERE (profiles.pending_bonus_balance > 0)) AS users_with_pending_bonuses,
    ( SELECT count(*) AS count
           FROM public.profiles
          WHERE (profiles.active_bonus_balance > 0)) AS users_with_active_bonuses,
    ( SELECT COALESCE(sum(profiles.pending_bonus_balance), (0)::bigint) AS "coalesce"
           FROM public.profiles) AS total_pending_bonuses,
    ( SELECT COALESCE(sum(profiles.active_bonus_balance), (0)::bigint) AS "coalesce"
           FROM public.profiles) AS total_active_bonuses,
    ( SELECT count(*) AS count
           FROM public.orders
          WHERE ((orders.status = ANY (ARRAY['confirmed'::text, 'delivered'::text])) AND (orders.bonuses_activation_date IS NOT NULL) AND (orders.bonuses_activation_date <= now()) AND (orders.bonuses_awarded > 0))) AS orders_ready_for_activation,
    ( SELECT COALESCE(sum(orders.bonuses_awarded), (0)::bigint) AS "coalesce"
           FROM public.orders
          WHERE ((orders.status = ANY (ARRAY['confirmed'::text, 'delivered'::text])) AND (orders.bonuses_activation_date IS NOT NULL) AND (orders.bonuses_activation_date <= now()) AND (orders.bonuses_awarded > 0))) AS bonuses_ready_for_activation;

CREATE OR REPLACE FUNCTION public.create_user_order(p_cart_items jsonb, p_delivery_method text, p_payment_method text DEFAULT NULL::text, p_delivery_address jsonb DEFAULT NULL::jsonb, p_bonuses_to_spend integer DEFAULT 0, p_promo_code text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_delivery_cost numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_user_id     UUID    := auth.uid();
  v_user_profile        RECORD;
  v_new_order_id        UUID;
  v_total_price         NUMERIC := 0;
  v_total_award_bonuses INTEGER := 0;
  v_final_price         NUMERIC;
  v_calculated_discount NUMERIC := 0;
  v_cart_item           RECORD;
  v_product_record      RECORD;
  v_bonus_rate          NUMERIC := 1.0;
  v_new_active_balance  INTEGER;
  v_new_pending_balance INTEGER;
  v_user_email          TEXT;
  v_user_name           TEXT;
  v_validated_items     JSONB   := '[]'::JSONB;
  v_promo_record        RECORD;
  v_contact_name        TEXT;
  v_contact_phone       TEXT;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация для оформления заказа';
  END IF;

  v_contact_name  := NULLIF(TRIM(COALESCE(p_contact_name,  '')), '');
  v_contact_phone := NULLIF(TRIM(COALESCE(p_contact_phone, '')), '');

  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

  IF v_user_profile IS NULL THEN
    SELECT email,
           COALESCE(
             raw_user_meta_data->>'first_name',
             raw_user_meta_data->>'full_name',
             raw_user_meta_data->>'name',
             split_part(email, '@', 1),
             'Гость'
           )
    INTO v_user_email, v_user_name
    FROM auth.users WHERE id = v_current_user_id;

    INSERT INTO public.profiles (
      id, first_name, active_bonus_balance, pending_bonus_balance, created_at, updated_at
    ) VALUES (
      v_current_user_id, v_user_name, 0, 0, NOW(), NOW()
    );

    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;
  END IF;

  IF p_bonuses_to_spend > v_user_profile.active_bonus_balance THEN
    RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %, запрошено: %',
      v_user_profile.active_bonus_balance, p_bonuses_to_spend;
  END IF;

  IF p_promo_code IS NOT NULL AND TRIM(p_promo_code) <> '' THEN
    SELECT * INTO v_promo_record
    FROM public.promo_campaigns
    WHERE code = UPPER(TRIM(p_promo_code))
      AND is_active = TRUE
      AND (valid_from IS NULL OR valid_from <= NOW())
      AND (valid_until IS NULL OR valid_until >= NOW());

    IF v_promo_record IS NOT NULL THEN
      v_bonus_rate := v_promo_record.bonus_multiplier;
    END IF;
  END IF;

  FOR v_cart_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
  LOOP
    SELECT * INTO v_product_record
    FROM public.products
    WHERE id = (v_cart_item.value->>'product_id')::UUID
      AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар % не найден или неактивен', v_cart_item.value->>'product_id';
    END IF;

    IF v_product_record.stock_quantity < (v_cart_item.value->>'quantity')::INTEGER THEN
      RAISE EXCEPTION 'Недостаточно товара "%" на складе. Доступно: %, запрошено: %',
        v_product_record.name,
        v_product_record.stock_quantity,
        (v_cart_item.value->>'quantity')::INTEGER;
    END IF;

    UPDATE public.products
    SET stock_quantity = stock_quantity - (v_cart_item.value->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = v_product_record.id;

    v_total_price := v_total_price + (v_product_record.final_price * (v_cart_item.value->>'quantity')::INTEGER);
    v_total_award_bonuses := v_total_award_bonuses +
      (COALESCE(v_product_record.bonus_points_award, 0) * (v_cart_item.value->>'quantity')::INTEGER);

    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_product_record.id,
      'quantity', (v_cart_item.value->>'quantity')::INTEGER,
      'price', v_product_record.final_price
    );
  END LOOP;

  v_calculated_discount := LEAST(p_bonuses_to_spend, v_total_price);
  v_final_price := v_total_price - v_calculated_discount + p_delivery_cost;

  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  v_total_award_bonuses := FLOOR(v_total_award_bonuses * v_bonus_rate);

  INSERT INTO public.orders (
    user_id,
    total_amount,
    discount_amount,
    final_amount,
    delivery_method,
    delivery_address,
    payment_method,
    bonuses_spent,
    bonuses_awarded,
    bonuses_activation_date,
    status,
    source,
    customer_name,
    customer_phone,
    delivery_cost,
    created_at,
    updated_at
  ) VALUES (
    v_current_user_id,
    v_total_price,
    v_calculated_discount,
    v_final_price,
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    p_bonuses_to_spend,
    v_total_award_bonuses,
    NOW() + INTERVAL '14 days',
    'new',
    'web',
    COALESCE(v_contact_name, v_user_profile.first_name),
    COALESCE(v_contact_phone, v_user_profile.phone),
    p_delivery_cost,
    NOW(),
    NOW()
  ) RETURNING id INTO v_new_order_id;

  FOR v_cart_item IN SELECT * FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      quantity,
      price_at_purchase,
      created_at
    ) VALUES (
      v_new_order_id,
      (v_cart_item.value->>'product_id')::UUID,
      (v_cart_item.value->>'quantity')::INTEGER,
      (v_cart_item.value->>'price')::NUMERIC,
      NOW()
    );
  END LOOP;

  IF p_bonuses_to_spend > 0 THEN
    v_new_active_balance := v_user_profile.active_bonus_balance - p_bonuses_to_spend;

    UPDATE public.profiles
    SET active_bonus_balance = v_new_active_balance,
        updated_at = NOW()
    WHERE id = v_current_user_id;

    INSERT INTO public.bonus_transactions (
      profile_id,
      amount,
      transaction_type,
      description,
      order_id,
      created_at
    ) VALUES (
      v_current_user_id,
      -p_bonuses_to_spend,
      'spent',
      'Списание бонусов за заказ',
      v_new_order_id,
      NOW()
    );
  END IF;

  v_new_pending_balance := v_user_profile.pending_bonus_balance + v_total_award_bonuses;

  UPDATE public.profiles
  SET pending_bonus_balance = v_new_pending_balance,
      updated_at = NOW()
  WHERE id = v_current_user_id;

  INSERT INTO public.bonus_transactions (
    profile_id,
    amount,
    transaction_type,
    description,
    order_id,
    activation_date,
    created_at
  ) VALUES (
    v_current_user_id,
    v_total_award_bonuses,
    'pending',
    'Начисление бонусов за заказ (ожидание активации)',
    v_new_order_id,
    NOW() + INTERVAL '14 days',
    NOW()
  );

  RETURN v_new_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_profile_exists()
 RETURNS public.profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_profile    public.profiles;
  v_first_name TEXT;
  v_last_name  TEXT;
  v_full_name  TEXT;
  v_phone      TEXT;
  v_avatar_url TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация (auth.uid() is NULL)';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF v_profile IS NOT NULL THEN
    -- Профиль есть, но без аватарки — пробуем заполнить
    IF v_profile.avatar_url IS NULL THEN
      UPDATE public.profiles p
      SET avatar_url = COALESCE(
        NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', '')), ''),
        NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'picture',    '')), '')
      )
      FROM auth.users u
      WHERE p.id = v_user_id AND u.id = v_user_id
        AND (
          NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', '')), '') IS NOT NULL
          OR NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'picture',    '')), '') IS NOT NULL
        );
      SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
    END IF;
    RETURN v_profile;
  END IF;

  -- Профиля нет — создаём с умным парсингом имени
  SELECT
    raw_user_meta_data->>'first_name',
    raw_user_meta_data->>'last_name',
    TRIM(COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '')),
    phone,
    COALESCE(
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'avatar_url', '')), ''),
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'picture',    '')), '')
    )
  INTO v_first_name, v_last_name, v_full_name, v_phone, v_avatar_url
  FROM auth.users
  WHERE id = v_user_id;

  -- Нормализуем first_name
  v_first_name := NULLIF(TRIM(COALESCE(v_first_name, '')), '');
  v_last_name  := NULLIF(TRIM(COALESCE(v_last_name,  '')), '');

  IF v_first_name IS NULL THEN
    v_full_name := NULLIF(v_full_name, '');
    IF v_full_name IS NOT NULL THEN
      IF position(' ' IN v_full_name) > 0 THEN
        v_first_name := split_part(v_full_name, ' ', 1);
        v_last_name  := NULLIF(TRIM(substring(v_full_name FROM position(' ' IN v_full_name) + 1)), '');
      ELSE
        v_first_name := v_full_name;
      END IF;
    END IF;
  END IF;

  IF v_first_name IS NULL THEN
    SELECT COALESCE(
      NULLIF(TRIM(split_part(COALESCE(email, ''), '@', 1)), ''),
      'Гость'
    ) INTO v_first_name FROM auth.users WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (
    id, first_name, last_name, phone, avatar_url,
    role, active_bonus_balance, pending_bonus_balance, has_received_welcome_bonus
  )
  VALUES (
    v_user_id, v_first_name, v_last_name, v_phone, v_avatar_url,
    'user', 0, 0, FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Не удалось создать профиль для пользователя %', v_user_id;
  END IF;

  RETURN v_profile;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_category_brand_combinations()
 RETURNS TABLE(category_id uuid, category_name text, category_slug text, brand_id uuid, brand_name text, brand_slug text, products_count bigint, min_price numeric, max_price numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as category_id,
    c.name as category_name,
    c.slug as category_slug,
    b.id as brand_id,
    b.name as brand_name,
    b.slug as brand_slug,
    COUNT(p.id) as products_count,
    MIN(p.final_price) as min_price,
    MAX(p.final_price) as max_price
  FROM categories c
  CROSS JOIN brands b
  INNER JOIN products p ON p.category_id = c.id AND p.brand_id = b.id
  WHERE p.is_active = true
  GROUP BY c.id, c.name, c.slug, b.id, b.name, b.slug
  HAVING COUNT(p.id) >= 3  -- Минимум 3 товара для создания SEO-страницы
  ORDER BY products_count DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_category_brand_seo(p_category_slug text, p_brand_slug text)
 RETURNS TABLE(brand_id uuid, seo_h1 text, seo_title text, seo_description text, seo_text text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    cbs.brand_id,
    cbs.seo_h1,
    cbs.seo_title,
    cbs.seo_description,
    cbs.seo_text
  FROM category_brand_seo cbs
  JOIN categories c ON c.id = cbs.category_id
  JOIN brands b ON b.id = cbs.brand_id
  WHERE c.slug = p_category_slug
    AND b.slug = p_brand_slug
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_send_telegram_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_chat_id BIGINT;
  v_magic_url TEXT;
  v_buttons JSONB;
  v_photos JSONB;
  v_body_payload JSONB;
BEGIN
  SELECT telegram_chat_id INTO v_chat_id
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Генерируем magic link если есть ссылка
  v_buttons := NULL;
  IF NEW.link IS NOT NULL AND NEW.link <> '' THEN
    v_magic_url := public.generate_magic_link(NEW.user_id, NEW.link);
    v_buttons := jsonb_build_array(
      jsonb_build_object('text', '🔗 Открыть на сайте', 'url', v_magic_url)
    );
  END IF;

  -- Добавляем фото если есть
  v_photos := NULL;
  IF NEW.photo_url IS NOT NULL AND NEW.photo_url <> '' THEN
    v_photos := jsonb_build_array(
      jsonb_build_object('url', NEW.photo_url)
    );
  END IF;

  -- Формируем payload
  v_body_payload := jsonb_build_object(
    'chat_id', v_chat_id,
    'title', NEW.title,
    'body', COALESCE(NEW.body, '')
  );

  IF v_buttons IS NOT NULL THEN
    v_body_payload := v_body_payload || jsonb_build_object('buttons', v_buttons);
  END IF;

  IF v_photos IS NOT NULL THEN
    v_body_payload := v_body_payload || jsonb_build_object('photos', v_photos);
  END IF;

  PERFORM net.http_post(
    url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/send-user-telegram',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_body_payload
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_send_telegram_notification error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

create policy "Allow admin full access for attribute_options"
  on "public"."attribute_options"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());

create policy "Allow admin full access for attributes"
  on "public"."attributes"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can read all banners"
  on "public"."banners"
  as permissive
  for select
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

create policy "Allow admin full access"
  on "public"."banners"
  as permissive
  for all
  to public
using (((auth.role() = 'authenticated'::text) AND public.is_admin()));

create policy "Only admins can delete banners"
  on "public"."banners"
  as permissive
  for delete
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

create policy "Only admins can insert banners"
  on "public"."banners"
  as permissive
  for insert
  to public
with check ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

create policy "Only admins can update banners"
  on "public"."banners"
  as permissive
  for update
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

create policy "Enable delete for question owner or admin"
  on "public"."brand_questions"
  as permissive
  for delete
  to public
using (((auth.uid() = user_id) OR public.is_admin()));

create policy "Enable insert for authenticated users"
  on "public"."brand_questions"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR public.is_admin()));

create policy "Enable update for admins"
  on "public"."brand_questions"
  as permissive
  for update
  to public
using (public.is_admin());

create policy "Enable delete for admins"
  on "public"."brands"
  as permissive
  for delete
  to public
using (public.is_admin());

create policy "Enable insert for admins"
  on "public"."brands"
  as permissive
  for insert
  to public
with check (public.is_admin());

create policy "Enable update for admins"
  on "public"."brands"
  as permissive
  for update
  to public
using (public.is_admin());

create policy "Admins can manage categories"
  on "public"."categories"
  as permissive
  for all
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Allow admin full access for category_attributes"
  on "public"."category_attributes"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());

create policy "Enable write for admins"
  on "public"."category_brand_questions"
  as permissive
  for all
  to public
using (public.is_admin());

create policy "Admin write access for category_brand_seo"
  on "public"."category_brand_seo"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Enable delete for question owner or admin"
  on "public"."category_questions"
  as permissive
  for delete
  to public
using (((auth.uid() = user_id) OR public.is_admin()));

create policy "Enable insert for authenticated users"
  on "public"."category_questions"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR public.is_admin()));

create policy "Enable update for admins"
  on "public"."category_questions"
  as permissive
  for update
  to public
using (public.is_admin());

create policy "Enable delete for admins"
  on "public"."countries"
  as permissive
  for delete
  to public
using (public.is_admin());

create policy "Enable insert for admins"
  on "public"."countries"
  as permissive
  for insert
  to public
with check (public.is_admin());

create policy "Enable update for admins"
  on "public"."countries"
  as permissive
  for update
  to public
using (public.is_admin());

create policy "Admins can manage all country questions"
  on "public"."country_questions"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Admins can view guest checkout items"
  on "public"."guest_checkout_items"
  as permissive
  for select
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Admins can manage guest checkouts"
  on "public"."guest_checkouts"
  as permissive
  for all
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Admins can view all guest checkouts"
  on "public"."guest_checkouts"
  as permissive
  for select
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Admins can manage all material questions"
  on "public"."material_questions"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Enable delete for admins"
  on "public"."materials"
  as permissive
  for delete
  to public
using (public.is_admin());

create policy "Enable insert for admins"
  on "public"."materials"
  as permissive
  for insert
  to public
with check (public.is_admin());

create policy "Enable update for admins"
  on "public"."materials"
  as permissive
  for update
  to public
using (public.is_admin());

create policy "Admins can manage all order items"
  on "public"."order_items"
  as permissive
  for all
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Allow adding items to orders"
  on "public"."order_items"
  as permissive
  for insert
  to public
with check ((((auth.role() = 'authenticated'::text) AND (auth.uid() = ( SELECT orders.user_id
   FROM public.orders
  WHERE (orders.id = order_items.order_id)))) OR ((auth.role() = 'anon'::text) AND (( SELECT orders.user_id
   FROM public.orders
  WHERE (orders.id = order_items.order_id)) IS NULL))));

create policy "Users can see their own order items"
  on "public"."order_items"
  as permissive
  for select
  to authenticated
using ((( SELECT orders.user_id
   FROM public.orders
  WHERE (orders.id = order_items.order_id)) = auth.uid()));

create policy "Admins can manage all orders"
  on "public"."orders"
  as permissive
  for all
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Allow admin full access for product_attribute_values"
  on "public"."product_attribute_values"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage all product line questions"
  on "public"."product_line_questions"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "product_lines_admin_delete"
  on "public"."product_lines"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "product_lines_admin_insert"
  on "public"."product_lines"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "product_lines_admin_update"
  on "public"."product_lines"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Admin delete questions"
  on "public"."product_questions"
  as permissive
  for delete
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

create policy "Admin update questions"
  on "public"."product_questions"
  as permissive
  for update
  to public
using ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

create policy "Admins manage all reviews"
  on "public"."product_reviews"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Admins can manage all products"
  on "public"."products"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can update all profiles"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Admins can view all profiles"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Admins full access to promo campaign products"
  on "public"."promo_campaign_products"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Public can read promo campaign products"
  on "public"."promo_campaign_products"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.promo_campaigns
  WHERE ((promo_campaigns.id = promo_campaign_products.campaign_id) AND (promo_campaigns.is_active = true)))));

create policy "Admins full access to promo campaigns"
  on "public"."promo_campaigns"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "review_images_admin_all"
  on "public"."review_images"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "review_images_author_delete"
  on "public"."review_images"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.product_reviews
  WHERE ((product_reviews.id = review_images.review_id) AND (product_reviews.user_id = auth.uid())))));

create policy "review_images_author_insert"
  on "public"."review_images"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.product_reviews
  WHERE ((product_reviews.id = review_images.review_id) AND (product_reviews.user_id = auth.uid())))));

create policy "review_images_author_read"
  on "public"."review_images"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.product_reviews
  WHERE ((product_reviews.id = review_images.review_id) AND (product_reviews.user_id = auth.uid())))));

create policy "review_images_public_read"
  on "public"."review_images"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.product_reviews
  WHERE ((product_reviews.id = review_images.review_id) AND (product_reviews.is_published = true)))));

create policy "Admins can manage settings"
  on "public"."settings"
  as permissive
  for all
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Admins can manage all slides"
  on "public"."slides"
  as permissive
  for all
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Admins can do everything with suppliers"
  on "public"."suppliers"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Admins read broadcasts"
  on "public"."telegram_broadcasts"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

CREATE TRIGGER sync_bonus_transaction_user_id_trigger BEFORE INSERT OR UPDATE ON public.bonus_transactions FOR EACH ROW EXECUTE FUNCTION public.sync_bonus_transaction_user_id();

CREATE TRIGGER orders_telegram_notification_v2 AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_user_order_to_telegram();

CREATE TRIGGER update_brand_questions_updated_at BEFORE UPDATE ON public.brand_questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_auto_generate_brand_faq AFTER INSERT ON public.brands FOR EACH ROW EXECUTE FUNCTION public.auto_generate_brand_faq();

CREATE TRIGGER trigger_auto_generate_category_faq AFTER INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.auto_generate_category_faq();

CREATE TRIGGER trigger_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_category_brand_seo_updated_at BEFORE UPDATE ON public.category_brand_seo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_category_questions_updated_at BEFORE UPDATE ON public.category_questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.children FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

CREATE TRIGGER trigger_auto_generate_country_faq AFTER INSERT ON public.countries FOR EACH ROW EXECUTE FUNCTION public.auto_generate_country_faq();

CREATE TRIGGER trigger_update_country_questions_updated_at BEFORE UPDATE ON public.country_questions FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

CREATE TRIGGER on_guest_order_status_changed AFTER UPDATE OF status ON public.guest_checkouts FOR EACH ROW EXECUTE FUNCTION public.sync_order_status_to_telegram();

CREATE TRIGGER trigger_auto_confirm_guest_checkout AFTER UPDATE ON public.guest_checkouts FOR EACH ROW WHEN (((new.status = 'confirmed'::text) AND (old.status <> 'confirmed'::text))) EXECUTE FUNCTION public.trigger_process_confirmed_guest_checkout();

CREATE TRIGGER trigger_guest_checkouts_updated_at BEFORE UPDATE ON public.guest_checkouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_notify_guest_checkout AFTER INSERT ON public.guest_checkouts FOR EACH ROW EXECUTE FUNCTION public.notify_guest_checkout_to_telegram();

CREATE TRIGGER trigger_update_material_questions_updated_at BEFORE UPDATE ON public.material_questions FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

CREATE TRIGGER trigger_auto_generate_material_faq AFTER INSERT ON public.materials FOR EACH ROW EXECUTE FUNCTION public.auto_generate_material_faq();

CREATE TRIGGER trigger_telegram_on_notification AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.trigger_send_telegram_notification();

CREATE TRIGGER on_order_status_changed AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.sync_order_status_to_telegram();

CREATE TRIGGER trigger_auto_confirm_order AFTER UPDATE ON public.orders FOR EACH ROW WHEN (((new.status = 'confirmed'::text) AND (old.status <> 'confirmed'::text))) EXECUTE FUNCTION public.trigger_process_confirmed_order();

CREATE TRIGGER trigger_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_request_review_on_delivery AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.request_review_on_delivery();

CREATE TRIGGER trigger_user_bonus_earned AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_user_bonus_earned();

CREATE TRIGGER trigger_user_order_status_notification AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_user_order_status_changed();

CREATE TRIGGER trigger_update_product_line_questions_updated_at BEFORE UPDATE ON public.product_line_questions FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

CREATE TRIGGER trigger_auto_generate_product_line_faq AFTER INSERT ON public.product_lines FOR EACH ROW EXECUTE FUNCTION public.auto_generate_product_line_faq();

CREATE TRIGGER trigger_update_product_lines_updated_at BEFORE UPDATE ON public.product_lines FOR EACH ROW EXECUTE FUNCTION public.update_product_lines_updated_at();

CREATE TRIGGER on_question_answered AFTER UPDATE ON public.product_questions FOR EACH ROW EXECUTE FUNCTION public.notify_question_answered();

CREATE TRIGGER update_product_questions_updated_at BEFORE UPDATE ON public.product_questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_award_bonus_for_review AFTER UPDATE ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.award_bonus_for_review();

CREATE TRIGGER trigger_update_review_stats AFTER INSERT OR DELETE OR UPDATE ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.update_product_review_stats();

CREATE TRIGGER trigger_back_in_stock AFTER UPDATE OF stock_quantity ON public.products FOR EACH ROW EXECUTE FUNCTION public.notify_back_in_stock();

CREATE TRIGGER trigger_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_sync_promotion_flag BEFORE INSERT OR UPDATE OF discount_percentage ON public.products FOR EACH ROW EXECUTE FUNCTION public.sync_promotion_flag();

CREATE TRIGGER trigger_wishlist_product_change AFTER UPDATE OF price, discount_percentage, stock_quantity ON public.products FOR EACH ROW EXECUTE FUNCTION public.notify_wishlist_on_product_change();

CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_protect_profile_role_update BEFORE UPDATE OF role ON public.profiles FOR EACH ROW WHEN ((old.role IS DISTINCT FROM new.role)) EXECUTE FUNCTION public.protect_profile_role_update();

CREATE TRIGGER trigger_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_slides_updated_at BEFORE UPDATE ON public.slides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_suppliers_updated_at();

drop trigger if exists "on_auth_user_created" on "auth"."users";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Служебные триггеры storage: их состав зависит от версии расширения, и на
-- локальном стеке таблицы storage.prefixes может не быть вовсе. Гасим ошибку
-- «relation does not exist» — платформа эти триггеры создаёт и восстанавливает
-- сама, к схеме приложения они отношения не имеют.
DO $storage_triggers$
BEGIN
  BEGIN
    EXECUTE 'drop trigger if exists "objects_delete_delete_prefix" on "storage"."objects"';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'drop trigger if exists "objects_insert_create_prefix" on "storage"."objects"';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'drop trigger if exists "objects_update_create_prefix" on "storage"."objects"';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'drop trigger if exists "prefixes_create_hierarchy" on "storage"."prefixes"';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'drop trigger if exists "prefixes_delete_hierarchy" on "storage"."prefixes"';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END
$storage_triggers$;





drop policy "Admins can delete images" on "storage"."objects";

drop policy "Admins can insert images" on "storage"."objects";

drop policy "Admins can update images" on "storage"."objects";

drop policy "Only admins can delete banners" on "storage"."objects";

drop policy "Only admins can update banners" on "storage"."objects";

drop policy "Only admins can upload banners" on "storage"."objects";

drop policy "product_line_logos_admin_delete" on "storage"."objects";

drop policy "product_line_logos_admin_insert" on "storage"."objects";

drop policy "product_line_logos_admin_update" on "storage"."objects";

create policy "Admins can delete images"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Admins can insert images"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (public.current_user_has_role_internal('admin'::text));

create policy "Admins can update images"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (public.current_user_has_role_internal('admin'::text));

create policy "Only admins can delete banners"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'banners'::text) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

create policy "Only admins can update banners"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'banners'::text) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

create policy "Only admins can upload banners"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'banners'::text) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

create policy "product_line_logos_admin_delete"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'product-line-logos'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy "product_line_logos_admin_insert"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'product-line-logos'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy "product_line_logos_admin_update"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'product-line-logos'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

-- Защитные триггеры storage: на локальном стеке их создаёт более ранняя
-- миграция, в проде они были пересозданы дампом. Повторное создание не
-- считаем ошибкой.
DO $$
BEGIN
  EXECUTE 'CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete()';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Защитные триггеры storage: на локальном стеке их создаёт более ранняя
-- миграция, в проде они были пересозданы дампом. Повторное создание не
-- считаем ошибкой.
DO $$
BEGIN
  EXECUTE 'CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete()';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;