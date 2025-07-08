<template>
  <div class="flex min-h-screen w-full bg-muted/40">
    <aside class="hidden w-64 flex-col border-r bg-background sm:flex">
      <div class="flex h-16 items-center border-b px-6">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold">
          <span>Мой проект</span>
        </NuxtLink>
      </div>

      <nav class="flex-1 space-y-2 p-4">
        <NuxtLink to="/"></NuxtLink>

        <NuxtLink></NuxtLink>
      </nav>
    </aside>
  </div>
</template>
