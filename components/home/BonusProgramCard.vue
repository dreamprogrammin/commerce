<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'

import { useModalStore } from '@/stores/modal/useModalStore'

const profileStore = useProfileStore()
const authStore = useAuthStore()
const modalStore = useModalStore()

const { profile, isLoading, bonusBalance } = storeToRefs(profileStore)
const { isLoggedIn: isAuth } = storeToRefs(authStore)

onMounted(() => {
  if (isAuth.value && !profile.value) {
    profileStore.loadProfile()
  }
})
</script>

<template>
  <div class="relative overflow-hidden rounded-xl bg-card border border-border hover:shadow-lg transition-shadow duration-300 h-full flex flex-col">
    <div class="p-4 flex-1 flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <div class="size-9 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:gift" class="size-4.5 text-primary-foreground" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-bold text-foreground truncate">
              Бонусная программа
            </h3>
          </div>
        </div>
        <div class="flex items-center gap-1 bg-primary/10 rounded-lg px-2 py-1 border border-primary/20 flex-shrink-0">
          <Icon name="lucide:coins" class="size-3 text-primary" />
          <span class="text-xs font-bold text-primary">1=1₸</span>
        </div>
      </div>

      <!-- Balance Section -->
      <ClientOnly>
        <div v-if="isAuth" class="mb-3">
          <div v-if="isLoading" class="h-20 flex items-center justify-center bg-muted rounded-lg">
            <Icon name="lucide:loader-2" class="size-5 animate-spin text-primary" />
          </div>
          <div v-else-if="profile" class="p-3 bg-primary/5 rounded-lg border border-primary/20">
            <div class="flex items-center gap-2.5">
              <div class="size-11 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon name="lucide:wallet" class="size-5.5 text-primary-foreground" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-muted-foreground mb-0.5">
                  Ваш баланс
                </p>
                <div class="flex items-baseline gap-1">
                  <p class="text-2xl font-black text-foreground truncate">
                    {{ bonusBalance }}
                  </p>
                  <span class="text-xs text-muted-foreground">бонусов</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <template #fallback>
          <div class="p-3 bg-muted rounded-lg mb-3">
            <div class="flex items-center gap-2.5">
              <div class="size-11 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon name="lucide:gift" class="size-5.5 text-primary-foreground" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-foreground">
                  Начните копить
                </p>
                <p class="text-xs text-muted-foreground">
                  Войдите для получения бонусов
                </p>
              </div>
            </div>
          </div>
        </template>
      </ClientOnly>

      <!-- Benefits -->
      <div class="flex flex-col gap-1.5 mb-3">
        <div class="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
          <div class="size-7 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:percent" class="size-3.5 text-primary-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold text-foreground">
              До 10% кешбэка
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
          <div class="size-7 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:shopping-bag" class="size-3.5 text-primary-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold text-foreground">
              Оплата до 100%
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
          <div class="size-7 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:infinity" class="size-3.5 text-primary-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold text-foreground">
              Не сгорают
            </p>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-auto">
        <ClientOnly>
          <div v-if="isAuth" class="flex flex-col gap-1.5">
            <Button
              as-child
              class="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 text-xs font-semibold"
            >
              <NuxtLink to="/profile/bonuses">
                <Icon name="lucide:history" class="size-3.5 mr-1.5" />
                История бонусов
              </NuxtLink>
            </Button>
            <Button
              as-child
              variant="outline"
              class="w-full rounded-lg h-9 text-xs font-medium"
            >
              <NuxtLink to="/bonus-program-rules">
                <Icon name="lucide:info" class="size-3.5 mr-1.5" />
                Правила
              </NuxtLink>
            </Button>
          </div>

          <div v-else class="flex flex-col gap-1.5">
            <Button
              class="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 text-xs font-semibold"
              @click="modalStore.openLoginModal()"
            >
              <Icon name="lucide:log-in" class="size-3.5 mr-1.5" />
              Войти
            </Button>
            <Button
              as-child
              variant="outline"
              class="w-full rounded-lg h-9 text-xs font-medium"
            >
              <NuxtLink to="/bonus-program-rules">
                <Icon name="lucide:info" class="size-3.5 mr-1.5" />
                Правила
              </NuxtLink>
            </Button>
          </div>

          <template #fallback>
            <div class="flex flex-col gap-1.5">
              <Button
                as-child
                class="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 text-xs font-semibold"
              >
                <NuxtLink to="/profile">
                  <Icon name="lucide:log-in" class="size-3.5 mr-1.5" />
                  Войти
                </NuxtLink>
              </Button>
              <Button
                as-child
                variant="outline"
                class="w-full rounded-lg h-9 text-xs font-medium"
              >
                <NuxtLink to="/bonus-program-rules">
                  <Icon name="lucide:info" class="size-3.5 mr-1.5" />
                  Правила
                </NuxtLink>
              </Button>
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>
