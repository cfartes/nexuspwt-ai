export function ptToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function ptCreationError(startsAt: string, now = new Date()): string | null {
  return startsAt === ptToday(now)
    ? null
    : 'A PT só pode ser criada para a data de hoje (horário de Brasília).';
}
