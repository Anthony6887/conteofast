import { NextResponse } from 'next/server';
import { CABECERAS_PRIVADAS, urlApiConteoFast } from '../../../lib/conteofast-servidor';
import { normalizarIndiceActas } from '../../../lib/indice-actas';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

/** Solo metadatos de la elección activa. Nunca devuelve rutas privadas ni imágenes. */
export async function GET() {
  try {
    const respuesta = await fetch(urlApiConteoFast('revision-actas'), {
      cache: 'no-store', headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!respuesta.ok) throw new Error(`API de actas: HTTP ${respuesta.status}`);
    const indice = normalizarIndiceActas(await respuesta.json());
    return NextResponse.json({ ok: true, data: indice }, { headers: CABECERAS_PRIVADAS });
  } catch (error) {
    console.error('[INDICE ACTAS]', error);
    return NextResponse.json({ ok: false, message: 'No se pudo consultar el índice de actas de ConteoFast.' },
      { status: 502, headers: CABECERAS_PRIVADAS });
  }
}
