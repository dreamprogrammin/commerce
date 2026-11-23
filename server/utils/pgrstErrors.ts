/*
 * «Нет миграции» на ЗАПИСИ (23 ноября 2026).
 *
 * Бой и локальный стенд — PostgREST 12 (бой проверен 23.11.2026: чтение
 * несуществующей таблицы отвечает 42P01; версия 13 ответила бы PGRST205).
 * У него «таблицы нет» выглядит по-разному:
 *  - чтение и удаление идут в базу — Postgres отвечает 42P01;
 *  - запись (insert / update / upsert) с колонками он сначала сверяет со своей
 *    схемой, таблицы там нет — 404 с телом `{}`. У ошибки supabase-js тогда
 *    ни кода, ни текста, и проверки *NotInstalled по кодам её пропускали:
 *    вместо 409 «нужна миграция» сервер отдавал 500 «Server Error».
 *
 * Иных ошибок без кода и текста supabase-js не даёт: у ответов PostgREST есть
 * code и message, у сетевого сбоя — message.
 */
export function pgrstTableNotFound(error: { code?: string, message?: string } | null | undefined): boolean {
  return !!error && !error.code && !error.message
}
