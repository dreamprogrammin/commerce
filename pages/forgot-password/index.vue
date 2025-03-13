<script setup lang="ts">
const user = useSupabaseClient();
const isLoading = ref(false);
const message = ref('');
const email = ref('');

async function handleResetPassword() {
  isLoading.value = true;
  message.value = '';
  try {
    const { error } = await user.auth.resetPasswordForEmail(email.value, {
      redirectTo: window.location.origin + '/reset-password'
    });
    if (error) {
      throw error;
    }
    message.value = 'Проверьте вашу почту для получения дальнейших инструкций.';
    isLoading.value = false;
  } catch (error) {
    message.value = 'ошибка';
    isLoading.value = false;
  } finally {
    isLoading.value = false;
  }
}
</script>
<template>
  <div>
    <h1>Забыли пароль</h1>

    <form @submit.prevent="handleResetPassword">
      <label for="email">Ваш email адрес</label>
      <input v-model="email" type="email" id="email" required placeholder="Введите ваш email" />
      <button type="submit" :disabled="isLoading">
        {{ isLoading ? 'Отправка...' : 'Отправить' }}
      </button>
    </form>
    <nuxt-link to="/login">Вернутся в авторизации</nuxt-link>
    <p v-if="message">{{ message }}</p>
  </div>
</template>
