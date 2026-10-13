/**
 * Переставляет ключи объекта по алфавиту — на месте, не подменяя сам объект.
 *
 * Зачем на месте. `payload.data` и `payload._errors` в Nuxt — `shallowReactive`,
 * и сериализатор payload помечает их как реактивные; подменённый простой
 * объект ушёл бы в браузер в другом формате. Порядок ключей обычного объекта в
 * JavaScript — порядок вставки (для нечисловых ключей), поэтому удалить и
 * вставить заново достаточно.
 */
export function sortKeysInPlace(target: Record<string, unknown> | undefined): void {
  if (!target)
    return
  const keys = Object.keys(target)
  const sorted = [...keys].sort()
  if (keys.every((key, i) => key === sorted[i]))
    return
  const entries = sorted.map(key => [key, target[key]] as const)
  for (const key of keys)
    delete target[key]
  for (const [key, value] of entries)
    target[key] = value
}
