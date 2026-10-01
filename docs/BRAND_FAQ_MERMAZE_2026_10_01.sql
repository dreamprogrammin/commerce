-- ═══════════════════════════════════════════════════════════════════════════
--  Вопросы Mermaze — пересобрать после миграции 20261001120000 — 01.10.2026
-- ═══════════════════════════════════════════════════════════════════════════
--  ЗАПУСКАТЬ ПОСЛЕ миграции (Actions → «Миграции Supabase» → dev → APPLY).
--  Без неё файл остановится на проверке и ничего не изменит.
--  Ожидаемо: одна строка; затем первый ответ начинается с «Mermaze Mermaidz —
--  бренд кукол-русалок от MGA Entertainment…».

DO $check$
BEGIN
  IF pg_get_functiondef('public.generate_brand_questions(uuid,boolean)'::regprocedure)
     NOT LIKE '%substring(v_lead from%' THEN
    RAISE EXCEPTION 'Сначала примените миграцию 20261001120000. Ничего не менял.';
  END IF;
END
$check$;

SELECT public.generate_brand_questions(id, true) AS peresobrano
  FROM public.brands
 WHERE slug = 'mermaze';

SELECT q.priority_order, left(q.answer_text, 120) AS otvet
  FROM public.brand_questions q
  JOIN public.brands b ON b.id = q.brand_id
 WHERE b.slug = 'mermaze' AND q.is_auto_generated
 ORDER BY q.priority_order;
