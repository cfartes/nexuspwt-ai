export function ptToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function ptCreationError(startsAt: string, now = new Date()): string | null {
  return startsAt === ptToday(now)
    ? null
    : 'A PT só pode ser criada para a data de hoje (horário de Brasília).';
}

export function ptAprPeriodError(
  issuedOn: string,
  startsAt: string,
  endsAt: string,
): string | null {
  const start = startsAt.slice(0, 10),
    end = endsAt.slice(0, 10);
  const display = (date: string) => date.split('-').reverse().join('/');
  if (issuedOn < start)
    return `A PT só pode ser emitida a partir de ${display(start)}, início previsto da APR.`;
  if (issuedOn > end)
    return `A APR tem término previsto em ${display(end)}. Não é permitido emitir PT após essa data.`;
  return null;
}

export function ptAprError(
  apr: { kind: string; status: string; starts_at: string; ends_at: string } | undefined,
  issuedOn: string,
): string | null {
  if (!apr || apr.kind !== 'APR') return 'É obrigatório selecionar uma APR para criar a PT.';
  if (apr.status !== 'aprovado') return 'Selecione uma APR aprovada para vincular a PT.';
  return ptAprPeriodError(issuedOn, apr.starts_at, apr.ends_at);
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
