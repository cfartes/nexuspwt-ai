import { currentUser, unitAccess } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { HttpError } from '@/lib/security';
import { apiError } from '@/lib/http';
import { lookupCep } from '@/lib/address';
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    await unitAccess(await currentUser(), uuid.parse(params.get('unit')), ['admin']);
    const cep = params.get('cep') || '';
    if (!/^\d{8}$/.test(cep)) throw new HttpError(400, 'Informe um CEP de 8 dígitos.');
    return Response.json(await lookupCep(cep), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
