/**
 * Сводка по распределению оценок.
 *
 * `get_category_rating_distribution` отдаёт количество отзывов по каждой
 * звезде для ВСЕЙ категории с подкатегориями. Из этого же массива честно
 * выводятся и общее число отзывов, и средняя оценка — отдельный источник
 * для них не нужен.
 *
 * Так было не всегда: сводку брали из `categoryStats`, которая суммирует
 * `review_count` по товарам ТЕКУЩЕЙ СТРАНИЦЫ выдачи. Из-за этого блок отзывов
 * то появлялся, то исчезал при смене страницы или фильтра, а проценты в
 * распределении считались от страничного числа при категорийном числителе —
 * и могли перевалить за 100%.
 */

export interface RatingBucket {
  stars: number
  count: number
}

export interface RatingSummary {
  /** Сколько всего отзывов в категории. */
  total: number
  /** Средняя оценка, `null` если отзывов нет. */
  average: number | null
  /** Пять строк, от 5 звёзд к 1, включая нулевые — чтобы шкала не скакала. */
  buckets: { stars: number, count: number, percentage: number }[]
}

const STARS_DESC = [5, 4, 3, 2, 1]

function toCount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function summarizeRatingDistribution(
  distribution: RatingBucket[] | null | undefined,
): RatingSummary {
  const byStars = new Map<number, number>()
  for (const item of distribution ?? []) {
    const stars = Number(item?.stars)
    if (!STARS_DESC.includes(stars))
      continue
    byStars.set(stars, (byStars.get(stars) ?? 0) + toCount(item?.count))
  }

  let total = 0
  let weighted = 0
  for (const stars of STARS_DESC) {
    const count = byStars.get(stars) ?? 0
    total += count
    weighted += stars * count
  }

  const buckets = STARS_DESC.map((stars) => {
    const count = byStars.get(stars) ?? 0
    return {
      stars,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }
  })

  return {
    total,
    average: total > 0 ? weighted / total : null,
    buckets,
  }
}

/** Средняя оценка в том виде, в каком её показывают: «4,7». */
export function formatAverageRating(average: number | null): string {
  return average === null ? '—' : average.toFixed(1).replace('.', ',')
}
