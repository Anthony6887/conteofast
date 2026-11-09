import { NextResponse } from 'next/server';

/** Proxy de solo lectura: recintos y juntas confirmadas en ConteoFast. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
const CABECERAS = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

function baseApi(): string | null {
  const bruto = (
    process.env.CONTEOFAST_API_BASE ||
    process.env.CONTEOFAST_API_URL ||
    process.env.NEXT_PUBLIC_CONTEOFAST_API_BASE ||
    ''
  ).trim();
  if (!bruto) return null;
  try {
    const u = new URL(bruto);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    let path = u.pathname.replace(/\/+$/, '').replace(/\/(?:catalogos|resumen|recintos-estado)$/, '');
    if (!path.endsWith('/api/conteofast')) {
      path = path.endsWith('/api') ? `${path}/conteofast` : `${path}/api/conteofast`;
    }
    return `${u.origin}${path}`;
  } catch {
    return null;
  }
}

export async function GET() {
  const base = baseApi();
  if (!base) {
    return NextResponse.json({
      ok: false,
      message: 'Falta CONTEOFAST_API_BASE en el .env del frontend.',
    }, { status: 503, headers: CABECERAS });
  }

  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), 7000);
  try {
    const respuesta = await fetch(`${base}/recintos-estado`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: controlador.signal,
    });
    const json: unknown = await respuesta.json().catch(() => null);
    const cuerpo = json && typeof json === 'object' && !Array.isArray(json)
      ? json as Record<string, unknown> : null;
    const data = cuerpo?.data;
    if (!respuesta.ok || cuerpo?.ok !== true || !data ||
        typeof data !== 'object' || !('recintos' in data) ||
        !Array.isArray(data.recintos)) {
      const msg = typeof cuerpo?.message === 'string' ? cuerpo.message
        : `Endpoint /recintos-estado: HTTP ${respuesta.status}`;
      return NextResponse.json({ ok: false, message: msg }, {
        status: respuesta.ok ? 502 : respuesta.status,
        headers: CABECERAS,
      });
    }
    return NextResponse.json(cuerpo, { status: 200, headers: CABECERAS });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: controlador.signal.aborted ? 'Tiempo de espera agotado.'
        : error instanceof Error ? error.message : 'No se pudo consultar recintos.',
    }, { status: 502, headers: CABECERAS });
  } finally {
    clearTimeout(limite);
  }
}
