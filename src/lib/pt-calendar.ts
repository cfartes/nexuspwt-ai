export function ptToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function ptCreationError(startsAt: string, now = new Date()): string | null {
  return startsAt === ptToday(now)
    ? null
    : 'A PT só pode ser criada para a data de hoje (horário de Brasília).';
}

export function ptClock(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

export function ptEndError(endTime: string, now = new Date()): string | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime))
    return 'Informe o horário previsto de término da PT (HH:mm).';
  return endTime > ptClock(now)
    ? null
    : 'O término da PT deve ser posterior ao horário atual, no mesmo dia.';
}
