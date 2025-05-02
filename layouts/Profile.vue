<script setup lang="ts"></script>
<template>
  <div class="profile">
    <aside>
      <div>Профиль</div>

      <div>
        <ul>
          <li><nuxt-link to="/profile/favorites">Избранное</nuxt-link></li>
          <li><nuxt-link to="/profile/bonus">Бонусы</nuxt-link></li>
          <li><a href=""></a>Заказы</li>
          <li><a href=""></a>Избранное</li>
        </ul>
      </div>
    </aside>
  </div>

  <div class="profile-content">
    <slot />
  </div>
</template>
<style lang="css">
.profile {
  display: flex;
  min-height: 100dvh;
}
aside {
  width: 250px;
}
</style>
