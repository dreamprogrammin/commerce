import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'

/**
 * Отчёты Google Analytics 4 (Data API) — с сервера, сервисным аккаунтом.
 *
 * Ключ — `GA_SERVICE_ACCOUNT_JSON` (весь JSON ключа), ресурс — `GA4_PROPERTY_ID`.
 * Библиотек Google не нужно: JWT подписывается `node:crypto`, как в
 * `gsc-queries.mjs`. Токен живёт час — держим его в памяти функции.
 */

interface ServiceAccount { client_email: string, private_key: string }

let cachedToken: { value: string, expires: number } | null = null

function b64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Ключ из конфига. Nuxt разбирает JSON из переменной окружения сам
 * (`NUXT_GA_SERVICE_ACCOUNT` приходит объектом), а `GA_SERVICE_ACCOUNT_JSON`
 * на сборке — строкой: принимаем оба вида.
 */
function serviceAccount(): ServiceAccount | null {
  const raw = useRuntimeConfig().gaServiceAccount as unknown
  if (!raw)
    return null
  const sa = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ServiceAccount
  return sa.client_email && sa.private_key ? sa : null
}

export function ga4Configured() {
  return serviceAccount() !== null
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000)
    return cachedToken.value
  const sa = serviceAccount()
  if (!sa)
    throw createError({ statusCode: 503, message: 'GA не настроена: нет GA_SERVICE_ACCOUNT_JSON' })
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signature = b64url(crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key))
  const res = await $fetch<{ access_token: string, expires_in: number }>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }).toString(),
  })
  cachedToken = { value: res.access_token, expires: Date.now() + res.expires_in * 1000 }
  return res.access_token
}

export interface Ga4Row { dimensionValues?: { value: string }[], metricValues?: { value: string }[] }

export async function ga4Report(body: Record<string, unknown>): Promise<Ga4Row[]> {
  const token = await accessToken()
  const property = useRuntimeConfig().ga4PropertyId
  const res = await $fetch<{ rows?: Ga4Row[] }>(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
  return res.rows ?? []
}
