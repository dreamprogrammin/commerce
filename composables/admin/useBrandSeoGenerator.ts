/**
 * Генерация SEO-полей бренда через edge-функцию `generate-brand-seo`.
 *
 * Функция ничего не пишет в базу — она возвращает тексты, а сохраняет их
 * человек обычным «Сохранить» в форме бренда. Здесь только вызов и разбор
 * ответа.
 *
 * Зовём через `supabase.functions.invoke`, а не голым `fetch`: клиент сам
 * подставляет токен ТЕКУЩЕГО пользователя. Соседний вызов
 * (`useBrandQuestions.ts`) шлёт в заголовке публичный анонимный ключ — то
 * есть функцию может дёрнуть кто угодно, у кого этот ключ есть, а он лежит
 * в разметке сайта. Здесь так нельзя: на той стороне стоит проверка роли,
 * и она работает только по настоящему токену.
 */

export interface GeneratedBrandSeo {
  brand_id: string
  brand_slug: string
  brand_name: string
  meta_title: string
  seo_h1: string
  seo_description: string
  /** Пусто, если у бренда уже есть свой текст «О бренде». */
  description: string
  /** Что стоит поправить руками: длины, эмодзи, отсутствие названия магазина. */
  warnings: string[]
}

interface GenerateResponse {
  brands?: GeneratedBrandSeo[]
  error?: string
  usage?: { input_tokens: number, output_tokens: number, model: string }
}

export function useBrandSeoGenerator() {
  const supabase = useSupabaseClient()
  const isGenerating = ref(false)

  /**
   * Возвращает тексты по брендам либо строку с ошибкой — вызывающий сам
   * решает, показывать её тостом или в диалоге.
   */
  async function generate(
    brandIds: string[],
  ): Promise<{ brands: GeneratedBrandSeo[] } | { error: string }> {
    if (brandIds.length === 0)
      return { error: 'Не выбран ни один бренд' }

    isGenerating.value = true
    try {
      const { data, error } = await supabase.functions.invoke<GenerateResponse>(
        'generate-brand-seo',
        { body: { brand_ids: brandIds } },
      )

      if (error) {
        /*
         * У FunctionsHttpError текст ошибки лежит в теле ответа, а не в
         * `error.message` — там только «Edge Function returned a non-2xx
         * status code». Без этого разбора админ увидел бы одну и ту же
         * фразу и на «нет прав», и на «не настроен ключ».
         */
        const detail = await (error as any)?.context?.json?.().catch(() => null)
        return { error: detail?.error || error.message || 'Не удалось сгенерировать' }
      }

      if (!data?.brands?.length)
        return { error: data?.error || 'Модель не вернула тексты' }

      return { brands: data.brands }
    }
    catch (err: any) {
      return { error: err?.message || String(err) }
    }
    finally {
      isGenerating.value = false
    }
  }

  return { generate, isGenerating }
}
