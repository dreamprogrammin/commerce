import type { IconFixResult } from '@/utils/iconNames'
import { toast } from 'vue-sonner'
import { extractIconNames, FALLBACK_ICON, fixIconNames } from '@/utils/iconNames'

/**
 * Проверка имён иконок перед сохранением текстов в админке.
 *
 * Зачем. 21 сентября 2026 пустые иконки нашлись на 102 карточках товаров из
 * 178, в текстах разделов, брендов и линеек: в data-icon стояли имена,
 * которых нет в коллекции. Тексты вставляются в админке как есть — в том
 * числе из бренд-генератора, у которого валидатор проверял только
 * НАПИСАНИЕ имени, но не то, существует ли иконка. Здесь единственная точка,
 * через которую проходит всё, что попадает в эти поля.
 *
 * Существование спрашиваем у собственного сервера иконок сайта: он отдаёт
 * только те имена, которые знает, остальные в ответе просто отсутствуют.
 * Список коллекции в админку не тащим — он весит под сотню килобайт.
 *
 * Сохранение не блокируется никогда. Известные ошибки правятся по
 * справочнику (utils/iconNames.ts), незнакомые несуществующие имена
 * заменяются на ✨, и человеку показывается, что именно поменялось. Если
 * сервер иконок не ответил — правятся только известные ошибки, а незнакомые
 * имена остаются: без проверки мы не знаем, что они битые.
 */

/** Какие из имён одной коллекции существуют. */
export type IconExistenceFetcher = (prefix: string, names: string[]) => Promise<Set<string>>

const defaultFetcher: IconExistenceFetcher = async (prefix, names) => {
  const data = await $fetch<{ icons?: Record<string, unknown>, aliases?: Record<string, unknown> }>(
    `/api/_nuxt_icon/${prefix}.json`,
    { query: { icons: names.join(',') } },
  )
  return new Set([...Object.keys(data?.icons ?? {}), ...Object.keys(data?.aliases ?? {})])
}

export interface IconGuardReport {
  fixed: IconFixResult['fixed']
  unknown: string[]
  /** Сервер иконок не ответил — незнакомые имена не проверены. */
  checkFailed: boolean
}

/** Поля записи, где есть иконки. Тип поля не важен: берём любые строки с data-icon. */
function iconFields(row: Record<string, unknown>): string[] {
  return Object.keys(row).filter(k => typeof row[k] === 'string' && (row[k] as string).includes('data-icon='))
}

/**
 * Проверить и исправить иконки во всех текстовых полях записей.
 * Возвращает НОВЫЕ объекты — исходные не трогаются.
 */
export async function sanitizeIconRows<T extends Record<string, unknown>>(
  rows: T[],
  fetcher: IconExistenceFetcher = defaultFetcher,
): Promise<{ rows: T[], report: IconGuardReport }> {
  const report: IconGuardReport = { fixed: [], unknown: [], checkFailed: false }

  // Один запрос на коллекцию на все записи сразу — у разделов их сохраняется много.
  const byPrefix = new Map<string, Set<string>>()
  for (const row of rows) {
    for (const k of iconFields(row)) {
      for (const full of extractIconNames(row[k] as string)) {
        const [prefix, name] = full.split(':')
        if (!byPrefix.has(prefix))
          byPrefix.set(prefix, new Set())
        byPrefix.get(prefix)!.add(name)
      }
    }
  }
  if (byPrefix.size === 0)
    return { rows, report }

  let existing: Set<string> | null = new Set()
  try {
    for (const [prefix, names] of byPrefix) {
      const found = await fetcher(prefix, [...names])
      for (const n of found)
        existing.add(`${prefix}:${n}`)
    }
  }
  catch {
    existing = null
    report.checkFailed = true
  }
  const exists = existing ? (full: string) => existing!.has(full) : null

  const out = rows.map((row) => {
    const fields = iconFields(row)
    if (fields.length === 0)
      return row
    const copy: Record<string, unknown> = { ...row }
    for (const k of fields) {
      const res = fixIconNames(copy[k] as string, exists)
      copy[k] = res.html
      for (const f of res.fixed) {
        if (!report.fixed.some(x => x.from === f.from))
          report.fixed.push(f)
      }
      for (const u of res.unknown) {
        if (!report.unknown.includes(u))
          report.unknown.push(u)
      }
    }
    return copy as T
  })

  return { rows: out, report }
}

/** То же для одной записи. */
export async function sanitizeIconRow<T extends Record<string, unknown>>(
  row: T,
  fetcher?: IconExistenceFetcher,
): Promise<{ row: T, report: IconGuardReport }> {
  const { rows, report } = await sanitizeIconRows([row], fetcher)
  return { row: rows[0], report }
}

/**
 * Сказать человеку, что поменялось. Молчит, если менять было нечего.
 *
 * Без эмодзи в тексте: в браузере без шрифта с эмодзи «✨» рисовался пустым
 * квадратиком — проверено на снимке 21 сентября 2026. И коротко: уведомление
 * обрезает описание по двум строкам, а важны именно имена.
 */
export function announceIconFixes(report: IconGuardReport): void {
  const short = (n: string) => n.replace('fluent-emoji-flat:', '')
  const pairs = [
    ...report.fixed.map(f => `${short(f.from)} → ${short(f.to)}`),
    ...report.unknown.map(n => `${short(n)} → ${short(FALLBACK_ICON)} (такой нет)`),
  ]
  const parts: string[] = []
  if (pairs.length)
    parts.push(pairs.join(', '))
  if (report.checkFailed)
    parts.push('сервер иконок не ответил, незнакомые имена не проверены')
  if (parts.length)
    toast.warning('Иконки в тексте поправлены', { description: parts.join('; '), duration: 8000 })
}
