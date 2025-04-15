import profile from "./actionProfile"

export const useProfileStore = defineStore('profileStore', () => {
    const actions = profile()

    return {
        ...actions
    }
})