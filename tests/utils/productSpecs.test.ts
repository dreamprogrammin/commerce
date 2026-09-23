import { describe, expect, it } from 'vitest'
import { explainSpecs, extractSpecs, matchSpecsToOptions } from '@/utils/productSpecs'

/*
 * Характеристики из названия и описания (23 сентября 2026). Фразы — из
 * описаний товаров на бою; на каждой из них правило однажды ошиблось или
 * могло ошибиться.
 */
const specs = (description: string, name = 'Игрушка') => extractSpecs(name, description)

describe('питание', () => {
  it('аккумулятор главнее «батарейки не нужны» — так пишут как раз у аккумуляторных', () => {
    expect(specs('Встроенный аккумулятор заряжается по USB — батарейки не нужны').pitanie).toBe('Аккумулятор')
    expect(specs('USB зарядка — никаких расходов на батарейки').pitanie).toBe('Аккумулятор')
  })

  it('у техники с аккумулятором пульт на батарейках — питание по самой игрушке', () => {
    expect(specs('USB-зарядка робота, пульт на батарейках').pitanie).toBe('Аккумулятор')
    expect(specs('Работает от аккумулятора Ni-Cd 4,8V. В пульт необходимы 2 батарейки АА').pitanie).toBe('Аккумулятор')
  })

  it('механическая каталка — без батареек', () => {
    expect(specs('Полностью механическая игрушка — никаких батареек, при движении светятся колёса').pitanie).toBe('Без батареек')
  })

  it('«механические клавиши» у брелока — это не «без батареек»', () => {
    expect(specs('9 механических клавиш, LED-подсветка').pitanie).toBeUndefined()
  })

  it('«игрушечный аккумулятор» у LEGO — деталь набора, а не питание', () => {
    expect(specs('Корабль с раскладывающимися двигателями активируется игрушечным аккумулятором').pitanie).toBeUndefined()
  })

  it('батарейки и USB-кабель в комплекте — не угадываем', () => {
    expect(specs('В комплекте оригинальная коробка, батарейки, пульт управления и USB кабель').pitanie).toBeUndefined()
  })

  it('обычные батарейки', () => {
    expect(specs('Работает от 3 батареек АА — не входят в комплект').pitanie).toBe('Батарейки')
  })
})

describe('световые и звуковые эффекты', () => {
  it('«со звуковыми и световыми эффектами» — и то, и другое', () => {
    const s = specs('Толокар-машинка со звуковыми и световыми эффектами')
    expect(s['zvukovye-effekty']).toBe('Есть')
    expect(s['svetovye-effekty']).toBe('Есть')
  })

  it('«звуковое и цветовое восприятие» — про ребёнка, не про игрушку', () => {
    expect(specs('Развивает память, логику, цветовое и звуковое восприятие')).toEqual({})
  })

  it('«переливается при свете» — не подсветка', () => {
    expect(specs('корпус переливается разными цветами при свете')['svetovye-effekty']).toBeUndefined()
  })

  it('«сиреневый жакет» — не сирена, «голосование» — не голос', () => {
    expect(specs('Кукла шатенка в сиреневом жакете')['zvukovye-effekty']).toBeUndefined()
    expect(specs('Кто не достоин спасения — выбудет голосованием')['zvukovye-effekty']).toBeUndefined()
  })

  it('сирена, голос, мелодии — звук', () => {
    expect(specs('воспроизводит звук сирены')['zvukovye-effekty']).toBe('Есть')
    expect(specs('с жестовым управлением и записью голоса')['zvukovye-effekty']).toBe('Есть')
    expect(specs('9 мелодий и голос диктора')['zvukovye-effekty']).toBe('Есть')
  })

  it('светящиеся колёса, фары, маячки — свет', () => {
    expect(specs('светящиеся колёса')['svetovye-effekty']).toBe('Есть')
    expect(specs('есть световые эффекты фар')['svetovye-effekty']).toBe('Есть')
    expect(specs('светит проблесковыми маячками')['svetovye-effekty']).toBe('Есть')
  })
})

describe('радиоуправление', () => {
  it('частота во всех написаниях', () => {
    expect(specs('пульт 2.4G для детей')['chastota-upravleniya']).toBe('2,4 ГГц')
    expect(specs('гусеничный ход, 2.4 GHz, свет и звук')['chastota-upravleniya']).toBe('2,4 ГГц')
    expect(specs('на радиоуправлении 2,4 ГГц 397 деталей')['chastota-upravleniya']).toBe('2,4 ГГц')
    expect(specs('пульт 27 МГц')['chastota-upravleniya']).toBe('27 МГц')
  })

  it('масштаб', () => {
    expect(specs('в масштабе 1:16 размером 30×11×15 см').masshtab).toBe('1:16')
  })

  it('вид техники — по названию, первым более узкий', () => {
    const vid = (name: string) => extractSpecs(name)['vid-tehniki']
    expect(vid('Радиоуправляемый башенный кран 6390-3')).toBe('Спецтехника')
    expect(vid('Машинка-трактор Синий Трактор NF2024-3 на радиоуправлении')).toBe('Спецтехника')
    expect(vid('Радиоуправляемая пожарная машина MOKA 2075')).toBe('Спецтехника')
    expect(vid('Радиоуправляемая машина-перевёртыш MOKA STUNT BIG 2053B')).toBe('Машина-перевёртыш')
    expect(vid('Радиоуправляемое такси TAXI CITY Range Rover T9012A')).toBe('Легковая машина')
    expect(vid('Квадрокоптер E88 чёрный — камера, Wi-Fi')).toBe('Квадрокоптер')
    expect(vid('Радиоуправляемый танк MOKA M1A2 2033')).toBe('Танк')
    // «экран» — не «кран»
    expect(vid('Детский планшет с большим экраном')).toBeUndefined()
  })
})

describe('число деталей', () => {
  it('из названия или описания', () => {
    expect(extractSpecs('Конструктор Sluban M38-B1174 Охота за сокровищами 404 детали')['kolichestvo-detaley']).toBe('404')
    expect(specs('240 деталей, размер в сборе 4×17×22 см')['kolichestvo-detaley']).toBe('240')
  })

  it('размеры и артикулы — не детали', () => {
    expect(extractSpecs('Толокар 5566B, 60х28х37 см')['kolichestvo-detaley']).toBeUndefined()
  })
})

describe('цвет — по названию', () => {
  it('одно слово цвета', () => {
    expect(extractSpecs('Толокар-машинка Sport 5566Y жёлтый').color).toBe('Жёлтый')
    expect(extractSpecs('Каталка-твистер Bibi Car Капибара KS105K коричневая').color).toBe('Коричневый')
  })

  it('«серия» — не «серый», два цвета — не угадываем', () => {
    expect(extractSpecs('Новая серия фигурок').color).toBeUndefined()
    expect(extractSpecs('Палатка белая с розовым').color).toBeUndefined()
    expect(extractSpecs('Мяч красно-синий').color).toBeUndefined()
  })

  it('цвет в описании не читается — только название', () => {
    expect(extractSpecs('Мяч', 'выполнен в жёлтом цвете').color).toBeUndefined()
  })
})

describe('откуда взялось значение', () => {
  it('рядом со значением — фрагмент текста', () => {
    const e = explainSpecs('Кран', 'Для работы необходимы 3 батарейки АА — не входят в комплект')
    expect(e.pitanie?.value).toBe('Батарейки')
    expect(e.pitanie?.evidence).toContain('3 батарейки АА')
  })
})

describe('matchSpecsToOptions — номера вариантов для формы', () => {
  const attributes = [
    { id: 7, slug: 'pitanie', attribute_options: [{ id: 70, value: 'Аккумулятор' }, { id: 71, value: 'Батарейки' }] },
    { id: 8, slug: 'svetovye-effekty', attribute_options: [{ id: 80, value: 'Есть' }] },
    { id: 9, slug: 'masshtab', attribute_options: [{ id: 90, value: '1:16' }] },
  ]

  it('только атрибуты раздела и только существующие варианты', () => {
    const found = extractSpecs('Машина', 'Работает от 3 батареек АА, световые эффекты, масштаб 1:24, 2.4 GHz')
    expect(matchSpecsToOptions(found, attributes)).toEqual({ 7: 71, 8: 80 })
  })
})

describe('тип — по названию, у каждого семейства свой', () => {
  const t = (name: string) => extractSpecs(name)

  it('толокар или каталка-твистер', () => {
    expect(t('Толокар-машинка Sport 5566B голубой')['tip-katalki']).toBe('Толокар')
    expect(t('Каталка-твистер Bibi Car Капибара KS105G зелёная')['tip-katalki']).toBe('Каталка-твистер')
  })

  it('игровой набор: магазин раньше кухни', () => {
    expect(t('Игровой магазин мороженого 922-06C — 45 предметов')['tip-nabora']).toBe('Магазин')
    expect(t('Игровой набор Супермаркет 668-83 — касса со светом и звуком')['tip-nabora']).toBe('Магазин')
    expect(t('Игровой набор Доктор Tourist 008-605A чемодан 3в1')['tip-nabora']).toBe('Доктор')
    expect(t('Игровой набор Трюмо Tourist 008-603A чемодан 3в1')['tip-nabora']).toBe('Трюмо')
    expect(t('Игровой набор посуды Little Chef А432-83A — плита, чайник')['tip-nabora']).toBe('Кухня')
    expect(t('Игровой набор рюкзак-трансформер Mickey Mouse D8989A Фастфуд — кухня')['tip-nabora']).toBe('Кухня')
    expect(t('Игровой кулер My Little Home A1010-4 чёрный')['tip-nabora']).toBeUndefined()
  })

  it('развивающие: говорящая книга — не планшет, «столик» — отдельным словом', () => {
    expect(t('Обучающая говорящая книга 3103 — алфавит, счёт')['tip-igrushki']).toBe('Говорящая книга')
    expect(t('Говорящая развивающая книга QD-5055 — 21 тема')['tip-igrushki']).toBe('Говорящая книга')
    expect(t('Говорящий планшет 66-2RUS — 112 карточек')['tip-igrushki']).toBe('Обучающий планшет')
    expect(t('Детский ноутбук 7004 розовый — 35 функций')['tip-igrushki']).toBe('Детский ноутбук')
    expect(t('Развивающий столик-робот HOLA HE8975 — 9 в 1')['tip-igrushki']).toBe('Развивающий столик')
    expect(t('Huanger HE0811 синий — 3 в 1 бизиборд, пианино-слоник')['tip-igrushki']).toBe('Бизиборд')
    expect(t('Говорящий казахский алфавит Сөйлейтін Әліппе 7064 — интерактивный плакат')['tip-igrushki']).toBeUndefined()
  })

  it('куклы: русалка или шарнирная', () => {
    expect(t('Кукла DEFA Lucy 8188DF принцесса-русалка 29 см')['tip-kukly']).toBe('Кукла-русалка')
    expect(t('Кукла русалка Mermaze Mermaidz Riviera 580812')['tip-kukly']).toBe('Кукла-русалка')
    expect(t('Кукла шарнирная DEFA Lucy 8493 — 10 шарниров')['tip-kukly']).toBe('Шарнирная кукла')
    expect(t('Кукла Barbie Extra GYJ78 в радужном платье')['tip-kukly']).toBeUndefined()
  })
})
