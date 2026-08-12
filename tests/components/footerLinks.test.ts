import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

/**
 * Футер и личный кабинет обязаны вести «Избранное» в одно и то же место.
 * Пока это было не так, ссылка из футера уводила на `/profile/favorites` —
 * страницу-заглушку с голым заголовком, тогда как настоящий список живёт
 * на `/profile/wishlist`, куда ведут шапка и навигация профиля.
 *
 * Проверяем по исходникам, а не монтированием: обе разметки — статические
 * списки ссылок, поднимать ради них Nuxt-окружение с автоимпортами дороже,
 * чем прочитать файл.
 */
function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

/** Ищет `to="..."` у NuxtLink, внутри которого лежит заданная подпись. */
function footerLinkTarget(source: string, label: string): string | null {
  const pattern = new RegExp(`<NuxtLink\\s+to="([^"]+)"[^>]*>\\s*${label}\\s*</NuxtLink>`)
  return source.match(pattern)?.[1] ?? null
}

/** Ищет `to` в массиве navItems по полю `label`. */
function navItemTarget(source: string, label: string): string | null {
  const pattern = new RegExp(`\\{\\s*to:\\s*'([^']+)'[^}]*label:\\s*'${label}'`)
  return source.match(pattern)?.[1] ?? null
}

describe('ссылки футера', () => {
  const footer = read('components/common/Footer.vue')
  const profileNav = read('components/profile/ProfileNav.vue')

  it('«Избранное» ведёт на страницу списка, а не на заглушку', () => {
    expect(footerLinkTarget(footer, 'Избранное')).toBe('/profile/wishlist')
  })

  it('футер и навигация профиля ведут «Избранное» в одно место', () => {
    const fromNav = navItemTarget(profileNav, 'Избранное')

    expect(fromNav, 'в ProfileNav не нашлась ссылка «Избранное»').not.toBeNull()
    expect(footerLinkTarget(footer, 'Избранное')).toBe(fromNav)
  })
})
