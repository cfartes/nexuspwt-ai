import { z } from 'zod';

export const passwordHint =
  'Use no mínimo 8 caracteres, com pelo menos uma letra maiúscula e um caractere especial.';
export const passwordPattern = '(?=.*\\p{Lu})(?=.*[^\\p{L}\\p{N}\\s]).{8,256}';
export const newPassword = z
  .string()
  .min(8, passwordHint)
  .max(256)
  .regex(/\p{Lu}/u, passwordHint)
  .regex(/[^\p{L}\p{N}\s]/u, passwordHint);
