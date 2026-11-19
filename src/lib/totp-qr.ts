import QRCode from 'qrcode';

export function totpUri(secret: string, email: string) {
  if (!/^[A-Z2-7]{32}$/.test(secret) || !email || email.length > 254)
    throw new Error('Configuração TOTP inválida.');
  const issuer = 'Nexus PTW';
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?${params}`;
}

export function totpQrCode(secret: string, email: string) {
  return QRCode.toDataURL(totpUri(secret, email), {
    type: 'image/png',
    width: 320,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
}
