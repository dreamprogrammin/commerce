<script setup lang="ts">
import type { Database } from '@/types'
import StarRating from '@/components/product/StarRating.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { SHOP } from '@/constants/shop'

/*
 * Отзыв по ссылке из письма «Заказ доставлен» (13 октября 2026) — без входа.
 * Раньше отзыв можно было написать, только войдя в аккаунт; гость не мог
 * вовсе — отзывов почти не было, а с ними и звёзд в выдаче. Ссылка одноразовая,
 * на один товар, живёт 60 дней; доступ даёт сам токен (64 шестнадцатеричных
 * знака). Решают всё функции базы `get_review_invite` и
 * `submit_review_by_invite` (миграция 20261013120000); отзыв уходит на
 * модерацию, как и написанный на сайте.
 *
 * Эдж-функция письма проверяет эту страницу HEAD-запросом и шлёт ссылки,
 * только если получила 200, — поэтому живая ссылка обязана отвечать 200, а
 * неизвестная честно отвечает 404.
 */

type InviteStatus = 'ok' | 'used' | 'expired' | 'not_found' | 'already_reviewed'
type ViewStatus = InviteStatus | 'sent' | 'error'

interface Invite {
  status: InviteStatus
  product_name: string | null
  product_slug: string | null
  image_url: string | null
  author_name: string | null
  is_guest: boolean | null
}

const NOT_FOUND: Invite = { status: 'not_found', product_name: null, product_slug: null, image_url: null, author_name: null, is_guest: null }

const route = useRoute()
const supabase = useSupabaseClient<Database>()
const token = computed(() => String(route.params.token ?? '').toLowerCase())

const { data: invite, error: loadError, refresh, pending } = await useAsyncData(
  `review-invite-${token.value}`,
  async (): Promise<Invite> => {
    if (!/^[0-9a-f]{64}$/.test(token.value))
      return NOT_FOUND
    const { data, error } = await supabase.rpc('get_review_invite', { p_token: token.value })
    if (error)
      throw error
    return (data?.[0] as Invite | undefined) ?? NOT_FOUND
  },
)

if (invite.value?.status === 'not_found')
  setResponseStatus(useRequestEvent(), 404)

useHead({ title: 'Отзыв о покупке — Ухтышка' })

// После отправки состояние меняет сама страница, без повторного запроса
const override = ref<ViewStatus | null>(null)
const status = computed<ViewStatus>(() => override.value ?? (loadError.value ? 'error' : invite.value?.status ?? 'not_found'))
const isGuest = computed(() => invite.value?.is_guest === true)

const rating = ref(0)
const text = ref('')
const authorName = ref(invite.value?.author_name ?? '')
const isSubmitting = ref(false)
const formError = ref('')

const { getVariantUrl } = useSupabaseStorage()
const imageSrc = computed(() => invite.value?.image_url ? getVariantUrl(BUCKET_NAME_PRODUCT, invite.value.image_url, 'sm') : null)
const productPath = computed(() => invite.value?.product_slug ? `/catalog/products/${invite.value.product_slug}` : null)
const phoneHref = `tel:${SHOP.phone.replace(/[^\d+]/g, '')}`

/** Отказы функции приходят кодом в тексте ошибки — см. миграцию. */
const STATUS_BY_ERROR: Record<string, InviteStatus> = {
  review_invite_used: 'used',
  review_invite_expired: 'expired',
  review_invite_not_found: 'not_found',
  review_invite_already_reviewed: 'already_reviewed',
}

async function submit() {
  if (!rating.value || isSubmitting.value)
    return
  isSubmitting.value = true
  formError.value = ''
  const { error } = await supabase.rpc('submit_review_by_invite', {
    p_token: token.value,
    p_rating: rating.value,
    p_text: text.value,
    // Имя с формы — только у гостя; у покупателя с аккаунтом оно из профиля
    ...(isGuest.value ? { p_author_name: authorName.value } : {}),
  })
  isSubmitting.value = false
  if (!error) {
    override.value = 'sent'
    return
  }
  const code = Object.keys(STATUS_BY_ERROR).find(c => error.message.includes(c))
  if (code) {
    override.value = STATUS_BY_ERROR[code]!
    return
  }
  formError.value = error.message.includes('review_invite_text_too_long')
    ? 'Отзыв длиннее 2000 знаков — сократите, пожалуйста.'
    : 'Не получилось отправить. Проверьте интернет и попробуйте ещё раз.'
}

const message = computed(() => {
  switch (status.value) {
    case 'sent':
      return {
        title: 'Спасибо за отзыв!',
        text: isGuest.value
          ? 'Он появится на сайте после проверки.'
          : 'Он появится на сайте после проверки — тогда же начислим 500 бонусов.',
      }
    case 'used':
      return { title: 'Отзыв уже отправлен', text: 'По этой ссылке отзыв уже оставлен. Спасибо!' }
    case 'already_reviewed':
      return { title: 'Отзыв уже есть', text: 'Вы уже оставляли отзыв на этот товар. Спасибо!' }
    case 'expired':
      return { title: 'Ссылка устарела', text: 'Ссылка на отзыв действует 60 дней после получения заказа.' }
    case 'error':
      return { title: 'Не удалось открыть ссылку', text: 'Похоже, пропал интернет. Попробуйте ещё раз.' }
    default:
      return { title: 'Ссылка не найдена', text: 'Проверьте, что ссылка из письма открылась целиком.' }
  }
})
</script>

<template>
  <div class="mx-auto max-w-[560px] px-4 py-6 md:py-10 space-y-4">
    <section v-if="invite?.product_name" class="rounded-2xl border bg-card p-4 flex items-center gap-3">
      <img v-if="imageSrc" :src="imageSrc" :alt="invite.product_name" class="size-16 shrink-0 rounded-xl object-cover bg-muted">
      <div v-else class="size-16 shrink-0 rounded-xl bg-muted" />
      <div class="min-w-0">
        <p class="text-[13px] text-muted-foreground">
          Ваша покупка
        </p>
        <NuxtLink v-if="productPath" :to="productPath" class="line-clamp-2 font-semibold hover:underline">
          {{ invite.product_name }}
        </NuxtLink>
        <span v-else class="line-clamp-2 font-semibold">{{ invite.product_name }}</span>
      </div>
    </section>

    <form v-if="status === 'ok'" class="rounded-2xl border bg-card p-5 space-y-5" @submit.prevent="submit">
      <h1 class="text-xl font-extrabold">
        Как вам товар?
      </h1>

      <div>
        <p class="text-sm text-muted-foreground mb-1.5">
          Оценка
        </p>
        <StarRating v-model="rating" size="lg" />
      </div>

      <div>
        <label for="review-text" class="text-sm text-muted-foreground mb-1.5 block">Отзыв — по желанию</label>
        <Textarea
          id="review-text"
          v-model="text"
          :rows="4"
          maxlength="2000"
          placeholder="Что понравилось, подошёл ли по возрасту, как ребёнок играет"
        />
      </div>

      <div v-if="isGuest">
        <label for="review-name" class="text-sm text-muted-foreground mb-1.5 block">Имя на сайте</label>
        <Input id="review-name" v-model="authorName" maxlength="40" autocomplete="given-name" placeholder="Покупатель" />
        <p class="mt-1.5 text-[13px] text-muted-foreground">
          Так подпишем отзыв. Можно стереть — будет «Покупатель».
        </p>
      </div>

      <p v-if="formError" class="text-sm text-destructive" role="alert">
        {{ formError }}
      </p>

      <Button type="submit" size="lg" class="w-full" :disabled="!rating || isSubmitting">
        {{ isSubmitting ? 'Отправляем…' : 'Отправить отзыв' }}
      </Button>
      <p class="text-center text-[13px] text-muted-foreground">
        {{ rating ? 'Отзыв появится на сайте после проверки.' : 'Выберите оценку — звёзды выше.' }}
      </p>
    </form>

    <section v-else class="rounded-2xl border bg-card p-6 text-center space-y-3">
      <h1 class="text-xl font-bold">
        {{ message.title }}
      </h1>
      <p class="text-sm text-muted-foreground">
        {{ message.text }}
      </p>
      <Button v-if="status === 'error'" variant="outline" :disabled="pending" @click="refresh()">
        Попробовать ещё раз
      </Button>
      <Button v-else-if="productPath" variant="outline" as-child>
        <NuxtLink :to="productPath">
          К товару
        </NuxtLink>
      </Button>
      <p class="text-sm text-muted-foreground">
        Вопросы —
        <a :href="phoneHref" class="text-primary hover:underline whitespace-nowrap">{{ SHOP.phoneHuman }}</a>
      </p>
    </section>
  </div>
</template>
