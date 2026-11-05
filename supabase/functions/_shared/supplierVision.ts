/**
 * Чтение поста поставщика — для Deno: функции Supabase и стенд
 * `scripts/supplier-vision/compare.ts`. Сам модуль — supplierVisionCore.ts,
 * здесь к нему подставлен SDK Anthropic с esm.sh. Сервер сайта берёт тот же
 * модуль с SDK из npm.
 */
import type { Env, ReadResult, SupplierPost } from './supplierVisionCore.ts'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.123.0'
import { readSupplierPost as readWith } from './supplierVisionCore.ts'

export type { Env, PostImage, RateLimit, RateLimits, ReadItem, ReadResult, SupplierPost } from './supplierVisionCore.ts'
export { DEFAULT_MODEL, EFFORT, MAX_OUTPUT_TOKENS, normArticle, parseItems, parseModelSpec, pickPrice, PROVIDERS, rateLimits, READ_SCHEMA, SYSTEM_PROMPT } from './supplierVisionCore.ts'

/**
 * Прочесть пост выбранной моделью. `env` — откуда брать ключи (в функции
 * Supabase это Deno.env.get, на стенде — тоже, но можно подменить).
 */
export function readSupplierPost(post: SupplierPost, spec: string, env: Env): Promise<ReadResult> {
  return readWith(post, spec, env, options => new Anthropic(options))
}
