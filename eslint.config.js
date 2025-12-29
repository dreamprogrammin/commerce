// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import antfu from '@antfu/eslint-config'

export default antfu({
  // Включаем специфичные для Nuxt правила и глобальные переменные
  nuxt: true,

  // Включаем правила форматирования
  formatters: true,

  // Можете добавить свои правила поверх конфига antfu
  rules: {
    // например, если вы не хотите требовать многословные имена компонентов
    'vue/multi-word-component-names': 'off',
  },
  ignores: [
    ' supabase/functions/**/*',
  ],
})
