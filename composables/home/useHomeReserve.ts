import {
  HOME_RESERVE_HINT_KEY,
  HOME_RESERVE_HINT_TTL,
  HOME_RESERVE_PARTS,
} from '@/constants'

type ReservePart = keyof typeof HOME_RESERVE_PARTS

interface ReserveHint {
  order?: number
  wishlist?: number
  at: number
}

/**
 * Резерв места под персональные секции главной.
 *
 * Зачем: карточка активного заказа и лента «Ваше избранное» приходят только
 * после гидрации — в SSR-разметке их быть не может, она общая и лежит в
 * ISR-кеше. Пока их нет, места под них нет тоже, и в момент появления они
 * выталкивают всё, что ниже. Замерено на стенде (390px, Slow 4G, CPU ×4):
 * карточка заказа сдвигала страницу на 112px, избранное — на 518px, причём
 * второе происходило ниже экрана и потому в CLS не попадало вовсе: видно
 * только глазами при скролле.
 *
 * Как: измеренные высоты кладутся в localStorage, а инлайн-скрипт в <head>
 * главной читает их ДО первой отрисовки и ставит переменные на <html>. Пока
 * данные едут, зарезервированное место занимает скелетон.
 *
 * Подсказки нет — резерв нулевой. Это важнее точности: лучше один сдвиг у
 * того, кто зашёл впервые, чем пустая полоса у гостя на каждом заходе.
 */
export function useHomeReserve() {
  function read(): ReserveHint | null {
    try {
      const raw = JSON.parse(localStorage.getItem(HOME_RESERVE_HINT_KEY) || 'null')
      if (raw && typeof raw.at === 'number' && Date.now() - raw.at < HOME_RESERVE_HINT_TTL)
        return raw as ReserveHint
    }
    catch {}
    return null
  }

  /** Есть ли живая подсказка по этой части. */
  function has(part: ReservePart): boolean {
    const px = read()?.[part]
    return typeof px === 'number' && px > 0
  }

  function save(part: ReservePart, px: number) {
    if (!(px > 0))
      return
    try {
      localStorage.setItem(
        HOME_RESERVE_HINT_KEY,
        JSON.stringify({ ...read(), [part]: px, at: Date.now() }),
      )
    }
    catch {}
    document.documentElement.style.setProperty(HOME_RESERVE_PARTS[part], `${px}px`)
  }

  /** Снять резерв по одной части: секции в этот визит не оказалось. */
  function drop(part: ReservePart) {
    try {
      const hint = read()
      if (hint) {
        delete hint[part]
        localStorage.setItem(HOME_RESERVE_HINT_KEY, JSON.stringify({ ...hint, at: Date.now() }))
      }
    }
    catch {}
    document.documentElement.style.removeProperty(HOME_RESERVE_PARTS[part])
  }

  /** Снять резерв целиком: гость, логаут или админ — персональных секций не будет. */
  function dropAll() {
    try {
      localStorage.removeItem(HOME_RESERVE_HINT_KEY)
    }
    catch {}
    for (const cssVar of Object.values(HOME_RESERVE_PARTS))
      document.documentElement.style.removeProperty(cssVar)
  }

  return { has, save, drop, dropAll }
}

/**
 * Тело инлайн-скрипта для <head>: ставит переменные резерва до первой отрисовки.
 * Обязан быть блокирующим и без defer, иначе отработает уже после неё.
 */
export function homeReserveInlineScript(): string {
  const parts = JSON.stringify(HOME_RESERVE_PARTS)
  return `try{var h=JSON.parse(localStorage.getItem('${HOME_RESERVE_HINT_KEY}')||'null');`
    + `if(h&&Date.now()-h.at<${HOME_RESERVE_HINT_TTL}){var m=${parts};`
    + `for(var k in m){if(h[k]>0)document.documentElement.style.setProperty(m[k],h[k]+'px')}}}catch(e){}`
}
