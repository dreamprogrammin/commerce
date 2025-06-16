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
            const message = e.message || `Ошибка загрузки файла в бакета ${options.bucketName}`
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

    async function removeFile(bucketName: string, filePath: string | string[]) : Promise<boolean> {
        const pathsToRemove = Array.isArray(filePath) ? filePath : [filePath]
        
        if (pathsToRemove.length === 0 || pathsToRemove.every((path) => !path?.trim())) {
            console.warn('Внимание: файлу не были указанны пути для удаление')
            return true
        }

        try {
          const validPathsToRemove = pathsToRemove.filter((path) => path && path.trim() !== '')
          
          if (validPathsToRemove.length === 0) return true

          const {data, error} = await supabase.storage
          .from(bucketName)
          .remove(validPathsToRemove)
          
          if (error) throw error

          toast.success('Успешное удаление из Хранилище', {
            description: `Файлы успешно удалены из бакета ${bucketName}.`
          })
          console.log(`файлы успешны удалены из хранилище, ${data}`)

          return true

        } catch (e: any) {
            const message = e.message || `Ошибка удаления файлов из бакета ${bucketName}`

            toast.error('Ошибка', {
                description: `Ошибка при удаление бакета ${message}`
            })

            console.error(`Ошибка при удаление файлов из бакета "${bucketName}", paths "${pathsToRemove.join(', ')}:"`, e)

            return false
        } 
    }

    function getPublicUrl(bucketName : string, filePath: string | null): string | null {
        if(!filePath || !filePath.trim()){
            return null
        }

        try {

            const { data } = supabase.storage
            .from(bucketName)
            .getPublicUrl(filePath)

            return data?.publicUrl || null
        } catch (e) {
            console.error(`Ошибка при получение публичного URL адреса для "${filePath}" в бакета "${bucketName}":`, e)
            return null
        }        
    }

    return {
        isUploading,
        uploadError,
        uploadFile,
        removeFile,
        getPublicUrl
    }
}