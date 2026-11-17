import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './security';
import { uuid } from './validation';

function encryptionKey() {
  const key = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key))
    throw new HttpError(
      503,
      'Configure INTEGRATIONS_ENCRYPTION_KEY no servidor antes de salvar credenciais.',
    );
  return Buffer.from(key, 'hex');
}
export function encryptSecret(secret: string, companyId: string, service: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${companyId}:${service}`));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
}
export function decryptSecret(encrypted: string, companyId: string, service: string) {
  try {
    const [iv, tag, value] = encrypted.split('.').map((v) => Buffer.from(v, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAAD(Buffer.from(`${companyId}:${service}`));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(value), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      503,
      'Não foi possível abrir a credencial. Confira a chave de criptografia do servidor.',
    );
  }
}
const secret = z
  .string()
  .trim()
  .max(16000)
  .default('')
  .refine(
    (value) =>
      !value ||
      (value.length >= 12 &&
        !/[\r\n…]/.test(value) &&
        !value.includes('***') &&
        !value.includes('...')),
    'Informe a credencial completa, sem abreviações.',
  );
const httpsUrl = z
  .url()
  .max(1000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  }, 'Use uma URL HTTPS sem usuário, senha ou parâmetros.');
export const integrationSchema = z.discriminatedUnion('service', [
  z
    .object({
      service: z.literal('signature'),
      unitId: uuid,
      version: z.number().int().nonnegative(),
      provider: z.enum(['docusign', 'certisign']),
      environment: z.enum(['sandbox', 'production']),
      accountId: z.string().trim().max(200),
      clientId: z.string().trim().max(200),
      secret,
      clearSecret: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      service: z.literal('whatsapp'),
      unitId: uuid,
      version: z.number().int().nonnegative(),
      provider: z.literal('openwa'),
      baseUrl: httpsUrl,
      sessionId: z.union([uuid, z.literal('')]),
      secret,
      clearSecret: z.boolean().default(false),
    })
    .strict(),
]);
export type IntegrationRow = {
  company_id: string;
  service: 'signature' | 'whatsapp';
  provider: 'docusign' | 'certisign' | 'openwa';
  settings: Record<string, string>;
  secret_ciphertext: string | null;
  version: number;
  updated_at: string;
};
export function publicIntegration(row: IntegrationRow) {
  return {
    service: row.service,
    provider: row.provider,
    settings: row.settings,
    hasSecret: !!row.secret_ciphertext,
    version: row.version,
    updatedAt: row.updated_at,
  };
}
export type IntegrationSettings = ReturnType<typeof publicIntegration>;
