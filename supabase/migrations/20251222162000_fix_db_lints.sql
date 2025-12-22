-- Fix Database Lint Errors

-- 1. Enable RLS on public tables
ALTER TABLE public.bonus_activation_skipped ENABLE ROW LEVEL SECURITY;

-- 2. Fix Security Definer Views (Use security_invoker = true to respect RLS)
ALTER VIEW public.all_orders_stats SET (security_invoker = true);
ALTER VIEW public.bonus_system_status SET (security_invoker = true);

-- 3. Set search_path for functions (Fixes Function Search Path Mutable warning)
-- Using a DO block to safely update functions only if they exist
DO $$
DECLARE
    func_record record;
    target_functions text[] := ARRAY[
        'get_category_and_children_ids',
        'get_category_price_range',
        'get_brands_by_category_slug',
        'update_updated_at_column',
        'get_cron_status',
        'notify_guest_checkout_to_telegram',
        'confirm_and_process_order',
        'trigger_order_notification',
        'activate_pending_order_bonuses',
        'cleanup_expired_guest_checkouts',
        'notify_user_order_to_telegram',
        'cancel_order',
        'create_order',
        'update_product_sales_count',
        'get_personalized_recommendations',
        'get_filtered_products',
        'activate_pending_bonuses',
        'recalculate_pending_balances',
        'grant_welcome_bonus_on_first_order',
        'create_guest_checkout',
        'create_user_order'
    ];
BEGIN
    FOR func_record IN 
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = ANY(target_functions)
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
END $$;
