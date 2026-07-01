import { en } from './en';
import { pl } from './pl';
import { ru, type MessageKey } from './ru';

import type { Locale } from '../locales';

export type { MessageKey };

export const messages: Record<Locale, Record<MessageKey, string>> = { ru, en, pl };
