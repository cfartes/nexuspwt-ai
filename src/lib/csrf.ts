import { timingSafeEqual } from 'node:crypto';
export function csrfCookieName(secure: boolean): string {
  return secure ? '__Host-nexus_csrf' : 'nexus_csrf';
}
export function validCsrf(cookie: string | undefined, header: string | null): boolean {
  if (!cookie || !header || !/^[a-f\d]{64}$/.test(cookie) || !/^[a-f\d]{64}$/.test(header))
    return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
}
