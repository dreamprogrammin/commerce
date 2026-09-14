/**
 * Три возрастные карточки лендинга — макет `Бренд LEGO v2.dc.html`.
 *
 * Границы совпадают с теми, по которым отбирает ползунок возраста, чтобы
 * нажатие на карточку показывало ровно те наборы, что она обещает.
 */
export interface BrandAgeCard {
  id: string
  age: string
  title: string
  note: string
  lo: number
  hi: number
  tone: 'green' | 'blue' | 'pink'
}

export const BRAND_AGE_CARDS: BrandAgeCard[] = [
  {
    id: '4-6',
    age: '4–6 лет',
    title: 'Первые конструкторы',
    note: 'Крупные детали, простая сборка за один вечер, знакомые сюжеты.',
    lo: 4,
    hi: 6,
    tone: 'green',
  },
  {
    id: '7-9',
    age: '7–9 лет',
    title: 'Сюжетная игра',
    note: 'Герои, техника и спасатели — сборка на час-другой без взрослых.',
    lo: 7,
    hi: 9,
    tone: 'blue',
  },
  {
    id: '10+',
    age: '10+ лет',
    title: 'Коллекционные наборы',
    note: 'Сотни деталей, подвижные механизмы и фигурки для витрины.',
    lo: 10,
    hi: 16,
    tone: 'pink',
  },
]
