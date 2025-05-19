<script setup lang="ts">
import { NavigationMenuLink } from "@/components/ui/navigation-menu";

defineProps<{
  title: string;
  href: string;
}>();
</script>
<template>
  <li>
    <NavigationMenuLink as-child>
      <NuxtLink
        :to="href"
        class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
      >
        <div class="text-sm font-medium leading-none">{{ title }}</div>
        <p
          v-if="$slots.default"
          class="line-clamp-2 text-sm leading-snug text-muted-foreground"
        >
          <slot />
        </p>
      </NuxtLink>
    </NavigationMenuLink>
  </li>
</template>
