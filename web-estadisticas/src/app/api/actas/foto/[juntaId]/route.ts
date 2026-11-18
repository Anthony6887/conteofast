import { NextResponse } from 'next/server';
import { CABECERAS_PRIVADAS, urlApiConteoFast, validarIdJunta } from '../../../../lib/conteofast-servidor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

/** Pasarela binaria: preserva PNG original, no genera miniaturas ni transcodifica. */
export async function GET(request: Request, contexto: { params: Promise<{ juntaId: string }> }) {
  const { juntaId } = await contexto.params;
  if (!validarIdJunta(juntaId)) {
    return NextResponse.json({ ok: false, message: 'ID de junta inválido.' }, { status: 400, headers: CABECERAS_PRIVADAS });
  }
  const parametros = new URL(request.url).searchParams;
  const descargar = parametros.get('descargar') === '1';
  const tipo = parametros.get('tipo')?.toUpperCase() ?? null;
  if (tipo && !['ALCALDE', 'CONCEJAL', 'VOCAL'].includes(tipo)) {
    return NextResponse.json({ ok: false, message: 'Dignidad inválida.' },
      { status: 400, headers: CABECERAS_PRIVADAS });
  }
  try {
    const endpoint = tipo ? `registro/${juntaId}/dignidad/${tipo}/foto` : `registro/${juntaId}/foto${descargar ? '/descargar' : ''}`;
    const backend = await fetch(urlApiConteoFast(endpoint), {
      cache: 'no-store', signal: AbortSignal.timeout(20000),
    });
    if (backend.status === 404) {
      return NextResponse.json({ ok: false, message: 'Esta junta aún no tiene fotografía.' },
        { status: 404, headers: CABECERAS_PRIVADAS });
    }
    if (!backend.ok) {
      return NextResponse.json({ ok: false, message: 'No se pudo consultar la fotografía.' },
        { status: 502, headers: CABECERAS_PRIVADAS });
    }
    const mime = backend.headers.get('content-type')?.split(';')[0].toLowerCase();
    if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp') {
      return NextResponse.json({ ok: false, message: 'La API devolvió un formato de fotografía inválido.' },
        { status: 502, headers: CABECERAS_PRIVADAS });
    }
    const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
    const headers = new Headers(CABECERAS_PRIVADAS);
    headers.set('Content-Type', mime);
    headers.set('Content-Disposition', `${descargar ? 'attachment' : 'inline'}; filename="acta_junta_${juntaId}${tipo ? `_${tipo}` : ''}.${ext}"`);
    const tamaño = backend.headers.get('content-length');
    if (tamaño && /^\d+$/.test(tamaño)) headers.set('Content-Length', tamaño);
    return new Response(backend.body, { status: 200, headers });
  } catch {
    return NextResponse.json({ ok: false, message: 'No fue posible recuperar la fotografía.' },
      { status: 502, headers: CABECERAS_PRIVADAS });
  }
}
