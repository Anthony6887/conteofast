import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

export async function GET() {
  const base = (
    process.env.CONTEOFAST_API_BASE ||
    process.env.CONTEOFAST_API_URL ||
    process.env.NEXT_PUBLIC_CONTEOFAST_API_BASE ||
    ''
  ).trim().replace(/\/+$/, '');

  if (!base) {
    return NextResponse.json({
      ok: false,
      message: 'Configura CONTEOFAST_API_BASE (terminando en /api/conteofast) en .env.'
    }, { status: 503, headers: NO_CACHE });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const respuesta = await fetch(`${base}/recintos-estado`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: controller.signal
    });
    const json: unknown = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      const msg = json && typeof json === 'object' && 'message' in json
        ? String(json.message) : `El backend devolvió HTTP ${respuesta.status}.`;
      return NextResponse.json({ ok: false, message: msg }, {
        status: respuesta.status, headers: NO_CACHE
      });
    }
    return NextResponse.json(json ?? { ok: false, message: 'Respuesta vacía del backend.' }, {
      status: 200, headers: NO_CACHE
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: controller.signal.aborted
        ? 'Tiempo de espera agotado al consultar recintos.'
        : err instanceof Error ? `No se pudo conectar con ConteoFast: ${err.message}` : 'Error de conexión.'
    }, { status: 502, headers: NO_CACHE });
  } finally {
    clearTimeout(timer);
  }
}
