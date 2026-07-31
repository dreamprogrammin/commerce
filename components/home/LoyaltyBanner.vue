<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'

/**
 * Баннер лояльности + стеклянная бонусная карта (Homepage.dc.html: loyalty banner).
 *
 * Ветку «войти / показать баланс» держим на authStore.isLoggedIn (=!!user),
 * а не на profileStore.isLoggedIn (=!!user && !!profile) — иначе кнопка мигает,
 * пока догружается профиль.
 */
const CASHBACK_MAX = 10 // % — в дизайне захардкожено «до 10%»

const authStore = useAuthStore()
const profileStore = useProfileStore()
const modalStore = useModalStore()

const { isLoggedIn, user } = storeToRefs(authStore)
const { bonusBalance } = storeToRefs(profileStore)

onMounted(() => {
  if (user.value && !profileStore.profile)
    profileStore.loadProfile()
})

const bonusLabel = computed(() =>
  isLoggedIn.value ? (bonusBalance.value ?? 0).toLocaleString('ru-KZ') : '0',
)

const benefits = [
  { icon: 'lucide:percent', text: `Кешбэк до ${CASHBACK_MAX}%` },
  { icon: 'lucide:gift', text: 'Бонусы за отзывы' },
  { icon: 'lucide:calendar-check', text: 'Подарок в день рождения' },
]

function onLogin() {
  modalStore.openLoginModal()
}
</script>

<template>
  <div class="loyalty">
    <span class="loyalty__blob loyalty__blob--1" />
    <span class="loyalty__blob loyalty__blob--2" />

    <div class="loyalty__body">
      <span class="loyalty__badge">
        <Icon name="lucide:gift" class="size-3.5" />
        Бонусная программа
      </span>
      <h3 class="loyalty__title">
        Кешбэк до {{ CASHBACK_MAX }}% бонусами<br>с каждой покупки
      </h3>
      <div class="loyalty__pills">
        <span v-for="b in benefits" :key="b.text" class="loyalty__pill">
          <Icon :name="b.icon" class="size-3.5" />
          {{ b.text }}
        </span>
      </div>
      <div class="loyalty__actions">
        <button v-if="!isLoggedIn" type="button" class="loyalty__btn loyalty__btn--primary" @click="onLogin">
          <Icon name="lucide:log-in" class="size-[17px]" />
          Войти и копить
        </button>
        <NuxtLink to="/profile/bonuses" class="loyalty__btn loyalty__btn--ghost">
          <Icon name="lucide:info" class="size-[17px]" />
          Правила
        </NuxtLink>
      </div>
    </div>

    <!-- стеклянная бонусная карта -->
    <div class="loyalty__card-wrap">
      <div class="loyalty__card">
        <span class="loyalty__card-sheen" />
        <span class="loyalty__card-glow" />
        <div class="loyalty__card-top">
          <span class="loyalty__wordmark">
            <svg viewBox="11 0 64 78" width="17" height="21" aria-label="Юла">
              <g transform="translate(2 0)"><g transform="rotate(-9 42 72)">
                <rect x="37.5" y="4" width="9" height="13" rx="4.5" fill="#fff" />
                <rect x="34" y="15.5" width="16" height="5.5" rx="2.75" fill="rgba(255,255,255,.65)" />
                <path d="M16 36 C16 22.5 68 22.5 68 36 L68 36.5 C68 40.6 64.6 44 60.5 44 L23.5 44 C19.4 44 16 40.6 16 36.5 Z" fill="#fff" />
                <rect x="20" y="46.5" width="44" height="6" rx="3" fill="#ffd34d" />
                <path d="M23 55 L61 55 C57.5 61.5 50 64 45 70 A3.8 3.8 0 0 1 39 70 C34 64 26.5 61.5 23 55 Z" fill="#ff8ac2" />
              </g></g>
            </svg>
            Ухтышка
          </span>
          <span class="loyalty__card-chip">до {{ CASHBACK_MAX }}%</span>
        </div>
        <div class="loyalty__card-balance">
          <div class="loyalty__card-label">
            Бонусный счёт
          </div>
          <div class="loyalty__card-amount">
            <ClientOnly>
              <span class="loyalty__card-num">{{ bonusLabel }}</span>
              <template #fallback>
                <span class="loyalty__card-num">0</span>
              </template>
            </ClientOnly>
            <span class="loyalty__card-unit">бонусов</span>
          </div>
          <ClientOnly>
            <div v-if="isLoggedIn" class="loyalty__card-rate">
              1 БОНУС = 1 ₸
            </div>
            <div v-else class="loyalty__card-locked">
              <Icon name="lucide:lock" class="size-3" />
              Войдите, чтобы копить
            </div>
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loyalty {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  background: linear-gradient(120deg, #0f52d9 0%, #2b7fff 52%, #5aa0ff 100%);
  color: #fff;
  padding: clamp(26px, 3vw, 44px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: clamp(24px, 3vw, 44px);
  flex-wrap: wrap;
  box-shadow: 0 20px 46px -20px rgb(43 127 255 / 0.7);
}

.loyalty__blob {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.loyalty__blob--1 {
  top: -90px;
  left: -40px;
  width: 260px;
  height: 260px;
  background: rgb(255 255 255 / 0.1);
}

.loyalty__blob--2 {
  bottom: -120px;
  right: 34%;
  width: 240px;
  height: 240px;
  background: rgb(255 255 255 / 0.07);
}

.loyalty__body {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  min-width: 260px;
  flex: 1 1 340px;
}

.loyalty__badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 999px;
  padding: 7px 15px;
  font-weight: 700;
  font-size: 12.5px;
  background: rgb(255 255 255 / 0.16);
  border: 1px solid rgb(255 255 255 / 0.32);
  backdrop-filter: blur(6px);
}

.loyalty__title {
  margin: 0;
  font-weight: 800;
  font-size: clamp(26px, 3vw, 42px);
  line-height: 1.08;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

.loyalty__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.loyalty__pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 600;
  font-size: 13px;
  background: rgb(255 255 255 / 0.14);
  border: 1px solid rgb(255 255 255 / 0.2);
}

.loyalty__actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.loyalty__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 48px;
  border-radius: 14px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  text-decoration: none;
  transition:
    transform 0.1s ease,
    background 0.15s ease;
}

.loyalty__btn--primary {
  padding: 0 24px;
  border: none;
  background: #fff;
  color: var(--primary);
  box-shadow: 0 8px 20px -8px rgb(0 0 0 / 0.45);
}

.loyalty__btn--primary:active {
  transform: scale(0.97);
}

.loyalty__btn--ghost {
  padding: 0 20px;
  border: 1px solid rgb(255 255 255 / 0.55);
  background: rgb(255 255 255 / 0.1);
  color: #fff;
  backdrop-filter: blur(6px);
}

.loyalty__btn--ghost:hover {
  background: rgb(255 255 255 / 0.22);
}

.loyalty__card-wrap {
  position: relative;
  flex: 0 0 auto;
}

.loyalty__card {
  position: relative;
  width: clamp(260px, 26vw, 320px);
  aspect-ratio: 1.6 / 1;
  border-radius: 22px;
  background: linear-gradient(140deg, #1657d6 0%, #3b8bff 100%);
  box-shadow: 0 26px 60px -16px rgb(0 10 40 / 0.6);
  transform: rotate(-4deg);
  overflow: hidden;
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.loyalty__card-sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(125deg, rgb(255 255 255 / 0.4) 0%, rgb(255 255 255 / 0) 42%);
  pointer-events: none;
}

.loyalty__card-glow {
  position: absolute;
  right: -40px;
  top: -40px;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(255 255 255 / 0.28), transparent 65%);
  pointer-events: none;
}

.loyalty__card-top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.loyalty__wordmark {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 15px;
  color: #fff;
}

.loyalty__card-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 5px 11px;
  font-weight: 800;
  font-size: 12px;
  color: #1657d6;
  background: rgb(255 255 255 / 0.95);
}

.loyalty__card-balance {
  position: relative;
}

.loyalty__card-label {
  font-weight: 500;
  font-size: 12px;
  color: rgb(255 255 255 / 0.75);
  margin-bottom: 2px;
}

.loyalty__card-amount {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.loyalty__card-num {
  font-weight: 800;
  font-size: 32px;
  letter-spacing: -0.02em;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.loyalty__card-unit {
  font-weight: 600;
  font-size: 14px;
  color: rgb(255 255 255 / 0.85);
}

.loyalty__card-rate {
  font-weight: 500;
  font-size: 11.5px;
  color: rgb(255 255 255 / 0.7);
  margin-top: 8px;
  letter-spacing: 0.04em;
}

.loyalty__card-locked {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 11.5px;
  color: rgb(255 255 255 / 0.92);
  margin-top: 8px;
}
</style>
