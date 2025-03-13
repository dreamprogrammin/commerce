<script setup lang="ts">
const isLoading = ref(false);
const message = ref('');
const password = ref('');
const confirmPassword = ref('');
const user = useSupabaseClient();

async function handleResetPassword() {
  if (password.value !== confirmPassword.value) {
    message.value = 'Пароли не совпадают';
  }
  isLoading.value = true;
  try {
    const { error } = await user.auth.updateUser({ password: password.value });

    if (error) {
      message.value = error.message;
      return;
    }
    await navigateTo('/login');
  } catch (error) {
    message.value = 'Ошибка в системе';
  } finally {
    isLoading.value = false;
  }
}
</script>
<template>
  <div>
    <h1>Сброс пароля</h1>

    <form @submit.prevent="handleResetPassword">
      <label for="password">Введите ваш новый пароль</label>
      <input type="password" id="password" placeholder="Введите новый пароль" required v-model="password" />
      <label for="confirmPassword">Повторите пароль</label>
      <input
        type="password"
        required
        v-model="confirmPassword"
        id="confirmPassword"
        placeholder="Повторите новый пароль"
      />

      <button type="submit">
        {{ isLoading ? 'Сохранение...' : 'Сохранить пароль' }}
      </button>
    </form>

    <p v-if="message">{{ message }}</p>
  </div>
</template>
