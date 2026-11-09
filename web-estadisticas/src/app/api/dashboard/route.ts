import { NextResponse } from 'next/server';

/**
 * ConteoFast /conteofast/api/dashboard.
 * Solo consulta resultados electorales. NUNCA llama a /recintos-estado.
 * Requiere en web-estadisticas/.env:
 * CONTEOFAST_API_BASE=https://tics.pelileo.gob.ec/api/conteofast
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

const HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'X-ConteoFast-Route': 'dashboard-candidatos-v4',
};

type Objeto = Record<string, unknown>;

function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function numeroSeguro(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function obtenerBase(): string {
  const configurado = process.env.CONTEOFAST_API_BASE?.trim();
  if (!configurado) throw new Error('Configura CONTEOFAST_API_BASE en web-estadisticas/.env');

  const url = new URL(configurado);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('CONTEOFAST_API_BASE debe usar HTTP o HTTPS.');
  }

  let ruta = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/(catalogos|resumen|recintos-estado)$/, '');

  if (!ruta.endsWith('/api/conteofast')) {
    if (ruta.endsWith('/api')) ruta += '/conteofast';
    else ruta += '/api/conteofast';
  }
  return `${url.origin}${ruta}`;
}

async function consultar(base: string, endpoint: 'resumen' | 'catalogos'): Promise<Objeto> {
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), 8000);
  try {
    const respuesta = await fetch(`${base}/${endpoint}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: controlador.signal,
    });

    const cuerpo: unknown = await respuesta.json().catch(() => null);
    if (!respuesta.ok || !esObjeto(cuerpo) || cuerpo.ok !== true || !esObjeto(cuerpo.data)) {
      const mensaje = esObjeto(cuerpo) && typeof cuerpo.message === 'string'
        ? cuerpo.message
        : `HTTP ${respuesta.status}`;
      throw new Error(`Backend /${endpoint}: ${mensaje}`);
    }
    return cuerpo.data;
  } catch (error) {
    if (controlador.signal.aborted) {
      throw new Error(`Tiempo de espera agotado en /${endpoint}.`);
    }
    throw error;
  } finally {
    clearTimeout(limite);
  }
}

type Catalogo = { base: string; vence: number; eleccionId: number; juntas: Objeto[] };
let catalogoCache: Catalogo | null = null;

async function obtenerCatalogo(base: string): Promise<Catalogo> {
  if (catalogoCache && catalogoCache.base === base && Date.now() < catalogoCache.vence) {
    return catalogoCache;
  }
  const data = await consultar(base, 'catalogos');
  if (!Array.isArray(data.juntas)) {
    throw new Error('El backend /catalogos no devolvió data.juntas.');
  }
  const catalogo: Catalogo = {
    base,
    vence: Date.now() + 30000,
    eleccionId: numeroSeguro(data.eleccion_id),
    juntas: data.juntas.filter(esObjeto),
  };
  catalogoCache = catalogo;
  return catalogo;
}

export async function GET() {
  try {
    const base = obtenerBase();
    // RESUMEN contiene votos de candidatos. CATALOGOS contiene el total de juntas.
    // Este endpoint no consulta recintos-estado.
    const [resumen, catalogo] = await Promise.all([
      consultar(base, 'resumen'),
      obtenerCatalogo(base),
    ]);

    if (!Array.isArray(resumen.candidatos)) {
      throw new Error('El backend /resumen no devolvió data.candidatos.');
    }

    const eleccionResumen = numeroSeguro(resumen.eleccion_id);
    if (eleccionResumen > 0 && catalogo.eleccionId > 0 &&
      eleccionResumen !== catalogo.eleccionId) {
      throw new Error('El resumen y el catálogo corresponden a distintas elecciones.');
    }

    const candidatos = resumen.candidatos.filter(esObjeto).map(c => ({
      ...c,
      numero_lista: c.numero_lista == null ? null : String(c.numero_lista),
      total_votos: numeroSeguro(c.total_votos),
    }));

    const recintos = new Set<string>();
    const porParroquia = new Map<string, number>();
    for (const junta of catalogo.juntas) {
      if (junta.recinto_id != null) recintos.add(String(junta.recinto_id));
      const parroquia = String(junta.parroquia ?? 'Sin parroquia').trim() || 'Sin parroquia';
      porParroquia.set(parroquia, (porParroquia.get(parroquia) ?? 0) + 1);
    }

    return NextResponse.json({
      ok: true,
      data: {
        eleccion_id: eleccionResumen || catalogo.eleccionId,
        consultado_en: new Date().toISOString(),
        juntas_confirmadas: numeroSeguro(resumen.juntas_confirmadas),
        juntas_total: catalogo.juntas.length,
        recintos_total: recintos.size,
        parroquias_total: porParroquia.size,
        juntas_por_parroquia: Array.from(porParroquia, ([parroquia, juntas]) => ({ parroquia, juntas })),
        candidatos,
      },
    }, { status: 200, headers: HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo consultar ConteoFast.';
    console.error('[ConteoFast /api/dashboard]', message);
    return NextResponse.json({ ok: false, message }, { status: 502, headers: HEADERS });
  }
}
