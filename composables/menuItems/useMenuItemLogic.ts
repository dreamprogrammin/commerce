import { BUCKET_NAME } from "~/constants";
import { useSupabaseStorage } from "./useSupabaseStorage";

export function useMenuItemLogic() {
  const { removeFile } = useSupabaseStorage();

  async function deleteAssociatedImage(imageUrl: string | null) {
    if (!imageUrl) return;
    try {
      await removeFile(BUCKET_NAME, imageUrl);
    } catch (e) {
      console.warn(`Не удалось удалить изображение ${imageUrl} из Storage:`, e);
    }
  }
  return { deleteAssociatedImage };
}
