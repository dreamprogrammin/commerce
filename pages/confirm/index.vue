<script setup lang="ts">
const supabase = useSupabaseClient();
const route = useRoute();
const client = useSupabaseUser();

const error = ref("");
const confirm = ref(false);
const isLoading = ref(false);

async function resendConfirm() {
  try {
    if (!client.value?.email) {
      throw new Error("Ошибка не авторизованный пользователь");
    }
    const {} = await supabase.auth.resend({
      type: "signup",
      email: client.value?.email,
    });
  } catch (error) {
  } finally {
  }
}
</script>
<template>
  <div>
    <h1>Страница для подтверждение почты</h1>

    <div>
      <h2>Email подтвержден</h2>
      <nuxt-link to="/dashboard">Перейти на рабочую страницу</nuxt-link>
    </div>

    <div>
      <h2>Email не подтвержден</h2>
      <p>{{}}</p>
      <button>Отправить письмо повторно</button>
    </div>
  </div>
</template>
