import { useProfile } from "~/composables/profile/useProfile"

const profile = () => {
    const {displayProfile, loadProfile, isLoading, isSaving, editProfile, useEmptyProfile, updateProfile} = useProfile()

    return {
        displayProfile, loadProfile, isLoading, isSaving, editProfile, useEmptyProfile, updateProfile
    }
}

export default profile