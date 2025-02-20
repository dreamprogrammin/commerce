import { defineStore } from "pinia";

export const useStore = defineStore(
  "store",
  () => {
    const user = ref(null);

    return {};
  },
  {
    persist: true,
  }
);
