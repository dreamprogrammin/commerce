import type { IUserMetaData } from '~/type';
import type { User } from '@supabase/supabase-js';

export function getUserMetaData<T extends keyof IUserMetaData>(
  user: User | null,
  key: T,
  defaultValue: string = ''
): string {
  return (user?.user_metadata as IUserMetaData)?.[key] || defaultValue;
}
