<script setup lang="ts">
/**
 * Крутилка на время перехода — юла из логотипа.
 *
 * Почему именно она. Логотип «Ухтышки» и есть юла, а вращение — её
 * собственное движение, а не абстрактная анимация. Форма взята из
 * `CommonSiteHeader` (`.sh-logo__badge`), но перекрашена: там корпус белый на
 * синей плашке, здесь фон светлый и белое было бы не видно.
 *
 * Разметка встроенная, без картинки из сети: крутилка появляется как раз
 * тогда, когда сеть занята переходом, и ждать загрузки файла ей нельзя.
 */
</script>

<template>
  <span class="uhti-loader" role="status" aria-label="Загрузка">
    <svg
      class="uhti-loader__top"
      viewBox="11 0 64 82"
      width="72"
      height="92"
      aria-hidden="true"
    >
      <g transform="translate(2 0)">
        <!-- Ручка -->
        <rect x="37.5" y="4" width="9" height="13" rx="4.5" fill="var(--uhti-body)" />
        <rect x="34" y="15.5" width="16" height="5.5" rx="2.75" fill="var(--uhti-body-soft)" />
        <!-- Купол -->
        <path
          d="M16 36 C16 22.5 68 22.5 68 36 L68 36.5 C68 40.6 64.6 44 60.5 44 L23.5 44 C19.4 44 16 40.6 16 36.5 Z"
          fill="var(--uhti-body)"
        />
        <!-- Поясок -->
        <rect x="20" y="46.5" width="44" height="6" rx="3" fill="#ffd34d" />
        <!-- Юбка с остриём -->
        <path
          d="M23 55 L61 55 C57.5 61.5 50 64 45 70 A3.8 3.8 0 0 1 39 70 C34 64 26.5 61.5 23 55 Z"
          fill="#ff8ac2"
        />
      </g>
    </svg>
    <span class="uhti-loader__shadow" aria-hidden="true" />
  </span>
</template>

<style scoped>
/* Стили намеренно вне @layer: это служебная анимация, а не утилиты и не
   компонентные классы витрины, перебивать её ничем не нужно. */

.uhti-loader {
  --uhti-body: oklch(0.55 0.21 258);
  --uhti-body-soft: oklch(0.55 0.21 258 / 0.6);

  display: grid;
  justify-items: center;
  gap: 0.5rem;
}

/*
 * Юла качается вокруг ОСТРИЯ, а не центра: настоящий волчок именно так и
 * ведёт себя, когда теряет скорость. Точка опоры — низ фигуры.
 */
.uhti-loader__top {
  transform-origin: 50% 88%;
  animation: uhti-wobble 1.15s ease-in-out infinite;
}

/* Тень ходит в противофазе с наклоном — без неё покачивание читается как
   дрожание картинки, а не как вращение предмета. */
.uhti-loader__shadow {
  width: 42px;
  height: 7px;
  border-radius: 9999px;
  background: currentColor;
  color: var(--muted-foreground, #64748b);
  opacity: 0.16;
  animation: uhti-shadow 1.15s ease-in-out infinite;
}

@keyframes uhti-wobble {
  0% {
    transform: rotate(-8deg);
  }

  50% {
    transform: rotate(8deg);
  }

  100% {
    transform: rotate(-8deg);
  }
}

@keyframes uhti-shadow {
  0% {
    transform: translateX(5px) scaleX(0.86);
  }

  50% {
    transform: translateX(-5px) scaleX(0.86);
  }

  100% {
    transform: translateX(5px) scaleX(0.86);
  }
}

/* Кому движение мешает — тому его быть не должно: юла просто стоит. */
@media (prefers-reduced-motion: reduce) {
  .uhti-loader__top,
  .uhti-loader__shadow {
    animation: none;
  }
}
</style>
