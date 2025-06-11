import {PostgrestError} from '@supabase/supabase-js'
import { toast } from 'vue-sonner';
import type { IHandlerSupabaseErrorOptions } from '~/types';

export function handleSupabaseError (
    error: PostgrestError | Error | any,
    options : IHandlerSupabaseErrorOptions
) : string {
    let errorMessage = options.fallbackMessage || `Произошла ошибка при ${options.operationName}.`

    if (error && typeof error.message === 'string') {

        errorMessage = error.message

        if ((error as PostgrestError).details) {
            errorMessage += `Детали ${(error as PostgrestError).details}`
        }
    } else if(typeof error === 'string') {
        errorMessage = error
    }
    toast.error(`Ошибка ${options.operationName}`, {
    description: errorMessage,
    // Можно добавить action, если нужно, например, кнопка "Повторить"
    });

  console.error(`Error during ${options.operationName}:`, error);
    return errorMessage
}