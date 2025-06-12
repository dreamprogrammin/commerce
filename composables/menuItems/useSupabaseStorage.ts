import { toast } from "vue-sonner";
import {v4 as uuidv4} from "uuid"
import type { Database, IUploadFileOptions } from "~/types";

export function useSupabaseStorage () {
    const supabase = useSupabaseClient<Database>()
    const isUploading = ref(false)
    const uploadError = ref<string | null>(null)
    
    async function uploadFile(file: File, options: IUploadFileOptions): Promise<string | null> {
        isUploading.value = true
        uploadError.value = null

        if (!file) {
            const noFileError = 'Файл для загрузки не выбран'
            toast.error('Ошибка', {
                description: noFileError
            })
            isUploading.value = false
            return null
        }

        const fileExt = file.name.split('.').pop()

        const uniqueFileName = `${uuidv4()}${fileExt ? '.' + fileExt : ''}`

        const filePath = options.filePathPrefix ? `${options.filePathPrefix.replace(/\/$/, '')}/${uniqueFileName}` : uniqueFileName

        try {
            const {data, error} = await supabase.storage
            .from(options.bucketName)
            .upload(filePath, file, {
                cacheControl: options.cashControl || '3600',
                upsert: options.upsert === undefined ? true : options.upsert,
                contentType: options.contentType 
            })

            if (error) throw error

            return data.path
        } catch (e : any) {
            const message = e.message || `Ошибка загрузки файла в бакет ${options.bucketName}`
            uploadError.value = message
            toast.error('Ошибка загрузки Storage', {
                description: message.e
            })
            console.error(`Error uploading to bucket "${options.bucketName}", path "${filePath}":`, e)
            return null
        } finally {
            isUploading.value = true
        }
    }
}