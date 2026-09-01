<script setup lang="ts">
/**
 * Крутилка на время перехода — юла из логотипа, объёмная и вращающаяся.
 *
 * Почему именно юла. Логотип «Ухтышки» и есть юла, а вращение — её
 * собственное движение, а не абстрактная анимация. Форма взята из
 * `CommonSiteHeader` (`.sh-logo__badge`) и перекрашена: там корпус белый на
 * синей плашке, здесь фон светлый и белое было бы не видно.
 *
 * Объём — обманом, без единой библиотеки и без картинок. Три приёма:
 *
 *   градиенты          свет сверху-слева, тень справа-снизу;
 *   бегущий поясок     полосы едут по кругу, как на вращающемся цилиндре, —
 *                      это и есть главный признак вращения;
 *   эллиптическая      орбита сплюснута по вертикали, поэтому читается как
 *   орбита             окружность в перспективе, а не как плоское кольцо.
 *
 * Вся анимация — на `transform` и `opacity`, то есть на композиторе: она не
 * вызывает пересчёта раскладки и не мешает странице, которая в этот момент
 * как раз строится.
 *
 * Разметка встроенная, без файла из сети: крутилка появляется ровно тогда,
 * когда сеть занята переходом, и ждать загрузки картинки ей нельзя.
 */
</script>

<template>
  <span class="uhti" role="status" aria-label="Загрузка">
    <!-- Орбита: три искры по сплюснутому кругу. Разный размер и задержка,
         иначе они читаются как одно жёсткое кольцо. -->
    <span class="uhti__orbit" aria-hidden="true">
      <i class="uhti__spark uhti__spark--1" />
      <i class="uhti__spark uhti__spark--2" />
      <i class="uhti__spark uhti__spark--3" />
    </span>

    <span class="uhti__body">
      <svg class="uhti__top" viewBox="11 0 64 82" width="76" height="97" aria-hidden="true">
        <defs>
          <!-- Свет сверху-слева: без него купол читается плоским пятном. -->
          <radialGradient id="uhti-dome" cx="34%" cy="22%" r="78%">
            <stop offset="0%" stop-color="#8fb8ff" />
            <stop offset="55%" stop-color="#2f6fe4" />
            <stop offset="100%" stop-color="#14459f" />
          </radialGradient>
          <linearGradient id="uhti-skirt" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" stop-color="#ffb3d8" />
            <stop offset="55%" stop-color="#ff7ab8" />
            <stop offset="100%" stop-color="#e0508f" />
          </linearGradient>
          <linearGradient id="uhti-stem" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#9dc2ff" />
            <stop offset="100%" stop-color="#2f6fe4" />
          </linearGradient>
          <!-- Поясок: полосы едут внутри своей же формы. -->
          <clipPath id="uhti-band-clip">
            <rect x="20" y="46.5" width="44" height="6" rx="3" />
          </clipPath>
        </defs>

        <g transform="translate(2 0)">
          <!-- Ручка -->
          <rect x="37.5" y="4" width="9" height="13" rx="4.5" fill="url(#uhti-stem)" />
          <rect x="34" y="15.5" width="16" height="5.5" rx="2.75" fill="#7aa8f5" />

          <!-- Купол -->
          <path
            d="M16 36 C16 22.5 68 22.5 68 36 L68 36.5 C68 40.6 64.6 44 60.5 44 L23.5 44 C19.4 44 16 40.6 16 36.5 Z"
            fill="url(#uhti-dome)"
          />
          <!-- Блик: узкая дуга по левому краю купола -->
          <path
            d="M22 33 C24 26.5 34 24 41 24"
            fill="none"
            stroke="rgba(255,255,255,.55)"
            stroke-width="3"
            stroke-linecap="round"
          />

          <!-- Поясок с бегущими полосами -->
          <g clip-path="url(#uhti-band-clip)">
            <rect x="20" y="46.5" width="44" height="6" fill="#ffd34d" />
            <g class="uhti__stripes">
              <rect x="20" y="46.5" width="5" height="6" fill="rgba(180,120,0,.28)" />
              <rect x="31" y="46.5" width="5" height="6" fill="rgba(180,120,0,.28)" />
              <rect x="42" y="46.5" width="5" height="6" fill="rgba(180,120,0,.28)" />
              <rect x="53" y="46.5" width="5" height="6" fill="rgba(180,120,0,.28)" />
              <rect x="64" y="46.5" width="5" height="6" fill="rgba(180,120,0,.28)" />
            </g>
          </g>

          <!-- Юбка -->
          <path
            d="M23 55 L61 55 C57.5 61.5 50 64 45 70 A3.8 3.8 0 0 1 39 70 C34 64 26.5 61.5 23 55 Z"
            fill="url(#uhti-skirt)"
          />
        </g>
      </svg>
    </span>

    <span class="uhti__shadow" aria-hidden="true" />
  </span>
</template>

<style scoped>
/* Стили намеренно вне @layer: это служебная анимация, а не утилиты витрины. */

.uhti {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.55rem;
  width: 150px;
  height: 150px;
  place-content: center;
}

/*
 * Наклон вокруг ОСТРИЯ, а не центра: настоящий волчок ведёт себя так, теряя
 * скорость. Точка опоры — низ фигуры.
 */
.uhti__body {
  display: block;
  transform-origin: 50% 88%;
  animation: uhti-wobble 1.6s ease-in-out infinite;
}

/* Лёгкое сжатие по горизонтали в такт наклону — читается как поворот
   объёмного предмета, а не как качание плоской картинки. */
.uhti__top {
  display: block;
  animation: uhti-turn 1.6s ease-in-out infinite;
}

/* Полосы едут вправо и уходят под клип — иллюзия вращающегося цилиндра. */
.uhti__stripes {
  animation: uhti-stripes 0.5s linear infinite;
}

.uhti__orbit {
  position: absolute;
  inset: 0;
  display: block;
  /* Сплюснутый круг: окружность в перспективе, а не плоское кольцо. */
  transform: scaleY(0.34);
  animation: uhti-orbit 2.1s linear infinite;
}

.uhti__spark {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: 9999px;
  background: #ffd34d;
}

.uhti__spark--1 {
  transform: translateX(66px);
}

.uhti__spark--2 {
  width: 7px;
  height: 7px;
  margin: -3.5px 0 0 -3.5px;
  background: #ff8ac2;
  transform: rotate(120deg) translateX(66px);
}

.uhti__spark--3 {
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  background: #7aa8f5;
  transform: rotate(240deg) translateX(66px);
}

.uhti__shadow {
  width: 46px;
  height: 7px;
  border-radius: 9999px;
  background: currentColor;
  color: var(--muted-foreground, #64748b);
  opacity: 0.16;
  animation: uhti-shadow 1.6s ease-in-out infinite;
}

@keyframes uhti-wobble {
  0%,
  100% {
    transform: rotate(-9deg);
  }

  50% {
    transform: rotate(9deg);
  }
}

@keyframes uhti-turn {
  0%,
  100% {
    transform: scaleX(1);
  }

  50% {
    transform: scaleX(0.88);
  }
}

@keyframes uhti-stripes {
  to {
    transform: translateX(11px);
  }
}

@keyframes uhti-orbit {
  to {
    transform: scaleY(0.34) rotate(360deg);
  }
}

@keyframes uhti-shadow {
  0%,
  100% {
    transform: translateX(6px) scaleX(0.86);
  }

  50% {
    transform: translateX(-6px) scaleX(0.86);
  }
}

/* Кому движение мешает — тому его быть не должно: юла просто стоит. */
@media (prefers-reduced-motion: reduce) {
  .uhti__body,
  .uhti__top,
  .uhti__stripes,
  .uhti__orbit,
  .uhti__shadow {
    animation: none;
  }
}
</style>
