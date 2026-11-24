import { NextResponse } from 'next/server';
import { CABECERAS_PRIVADAS, urlApiConteoFast, validarIdJunta } from '../../../../lib/conteofast-servidor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

/** Consulta del registro individual y metadatos del acta; nunca escribe en la API. */
export async function GET(_request: Request, contexto: { params: Promise<{ juntaId: string }> }) {
  const { juntaId } = await contexto.params;
  if (!validarIdJunta(juntaId)) {
    return NextResponse.json({ ok: false, message: 'ID de junta inválido.' }, { status: 400, headers: CABECERAS_PRIVADAS });
  }

  try {
    const respuesta = await fetch(urlApiConteoFast(`registro/${juntaId}`), {
      method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    const valido = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) && 'ok' in cuerpo;
    if (!respuesta.ok || !valido) {
      return NextResponse.json({ ok: false, message: `No se pudo consultar la junta (HTTP ${respuesta.status}).` },
        { status: respuesta.status === 404 ? 404 : 502, headers: CABECERAS_PRIVADAS });
    }
    const registro = cuerpo as { ok: boolean; data?: Record<string, unknown> | null };
    if (!registro.ok || !registro.data) return NextResponse.json(cuerpo, { status: 200, headers: CABECERAS_PRIVADAS });

    // Las fotos antiguas y las nuevas por dignidad conviven.
    const estadoRespuesta = await fetch(urlApiConteoFast(`registro/${juntaId}/dignidades`), {
      method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (estadoRespuesta.status === 404) {
      return NextResponse.json(cuerpo, { status: 200, headers: CABECERAS_PRIVADAS });
    }
    if (!estadoRespuesta.ok) {
      return NextResponse.json({ ok: false, message: `No se pudieron consultar las dignidades (HTTP ${estadoRespuesta.status}).` },
        { status: 502, headers: CABECERAS_PRIVADAS });
    }
    const json: unknown = await estadoRespuesta.json();
    if (!json || typeof json !== 'object' || !('ok' in json) ||
        !('data' in json) || (json as { ok: unknown }).ok !== true) {
      return NextResponse.json({ ok: false, message: 'Respuesta de dignidades inválida.' },
        { status: 502, headers: CABECERAS_PRIVADAS });
    }
    return NextResponse.json({ ok: true, data: {
      ...registro.data,
      dignidades: (json as { data: unknown }).data,
    } }, { status: 200, headers: CABECERAS_PRIVADAS });
  } catch (error) {
    const mensaje = error instanceof Error && error.name === 'TimeoutError'
      ? 'La API tardó demasiado en responder.' : 'La API de ConteoFast no está disponible.';
    return NextResponse.json({ ok: false, message: mensaje }, { status: 502, headers: CABECERAS_PRIVADAS });
  }
}
