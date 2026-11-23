import { describe, expect, it } from 'vitest'
import { pgrstTableNotFound } from '~/server/utils/pgrstErrors'
import { siteHealthNotInstalled } from '~/server/utils/siteHealth'
import { meterNotInstalled } from '~/server/utils/usageMeters'

// PostgREST 12 (бой и стенд) на запись в таблицу, которой нет в его схеме, отвечает
// 404 с телом `{}` — supabase-js отдаёт пустую ошибку (23.11.2026)
const writeWithoutTable = {}

describe('pgrstTableNotFound — запись без миграции на PostgREST 12', () => {
  it('пустая ошибка — таблицы нет', () => {
    expect(pgrstTableNotFound(writeWithoutTable)).toBe(true)
  })

  it('ошибки с кодом или текстом — другое', () => {
    expect(pgrstTableNotFound({ code: '42P01', message: 'relation "public.paid_services" does not exist' })).toBe(false)
    expect(pgrstTableNotFound({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false)
    // Сетевой сбой supabase-js: кода нет, текст есть
    expect(pgrstTableNotFound({ code: '', message: 'TypeError: fetch failed' })).toBe(false)
    // Ответ не JSON — только текст
    expect(pgrstTableNotFound({ message: '<html>502</html>' })).toBe(false)
  })

  it('ошибки нет — не она', () => {
    expect(pgrstTableNotFound(null)).toBe(false)
    expect(pgrstTableNotFound(undefined)).toBe(false)
  })
})

describe('проверки «нет миграции» узнают запись без таблицы', () => {
  it('платные сервисы и батарейки: 409, а не 500', () => {
    expect(siteHealthNotInstalled(writeWithoutTable)).toBe(true)
    expect(meterNotInstalled(writeWithoutTable)).toBe(true)
  })

  it('прежние коды на месте', () => {
    expect(siteHealthNotInstalled({ code: '42P01', message: 'relation does not exist' })).toBe(true)
    expect(meterNotInstalled({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true)
    expect(siteHealthNotInstalled({ code: '23505', message: 'duplicate key' })).toBe(false)
  })
})
