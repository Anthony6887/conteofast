import { NextResponse } from 'next/server';
import { CABECERAS_PRIVADAS, urlApiConteoFast, validarIdJunta } from '../../lib/conteofast-servidor';
import { PARROQUIAS_VOCALES, type VocalesParroquia } from '../../lib/parroquias-vocales';
import type { DatosRecintos } from '../../lib/recintos-estado';
import type { RegistroActa } from '../../lib/revision-actas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function leer<T>(ruta: string, permitir404 = false): Promise<T | null> {
  const r = await fetch(urlApiConteoFast(ruta), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (permitir404 && r.status === 404) return null;
  const json = await r.json();
  if (!r.ok || json?.ok !== true) throw new Error(`Error consultando ${ruta}: HTTP ${r.status}`);
  if (json.data == null && !permitir404) throw new Error(`Sin datos en ${ruta}`);
  return json.data ?? null;
}
function entero(v: unknown): number {
  if (v == null || v === '') throw new Error('Valor de votos ausente.');
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Valor de votos inválido.');
  return n;
}
const enCurso = new Map<string, Promise<VocalesParroquia>>();
async function calcular(id: string): Promise<VocalesParroquia> {
  const p = PARROQUIAS_VOCALES.find(x => x.id === id)!;
  const datos = await leer<DatosRecintos>('recintos-estado');
  if (!datos || !Array.isArray(datos.recintos)) throw new Error('Catálogo de recintos inválido.');
  const codigos: readonly number[] = p.recintos;
  const recintos = datos.recintos.filter(r => codigos.includes(Number(r.codigo_recinto ?? r.id)));
  if (new Set(recintos.map(r => Number(r.codigo_recinto ?? r.id))).size !== codigos.length) throw new Error('No coinciden los códigos de recinto de la parroquia con el backend.');
  const juntas = [...new Set(recintos.flatMap(r => r.juntas.map(j => String(j.id))))];
  if (juntas.length !== p.juntas || juntas.some(j => !validarIdJunta(j))) throw new Error('El catálogo de juntas no coincide con el padrón proporcionado.');
  const votos = new Map<number, number>();
  let nulos = 0, blancos = 0, confirmadas = 0;
  // Lotes pequeños; no sumar registros de otra parroquia ni otras dignidades.
  for (let i = 0; i < juntas.length; i += 4) {
    const lote = await Promise.all(juntas.slice(i, i + 4).map(async junta => {
      const registro = await leer<RegistroActa>(`registro/${junta}`, true);
      if (!registro) return null;
      const estados = await leer<NonNullable<RegistroActa['dignidades']>>(`registro/${junta}/dignidades`);
      const vocal = estados?.VOCAL;
      if (!vocal || (typeof vocal.guardado !== 'boolean' && typeof vocal.finalizado !== 'boolean')) throw new Error(`Estado VOCAL no disponible en junta ${junta}.`);
      if (!(vocal.guardado === true || vocal.finalizado === true)) return null;
      if (!registro || !Array.isArray(registro.votos) || !registro.especiales?.VOCAL) throw new Error(`Registro VOCAL incompleto en junta ${junta}.`);
      return registro;
    }));
    for (const r of lote) {
      if (!r) continue;
      confirmadas++;
      const especiales = r.especiales.VOCAL!;
      nulos += entero(especiales.nulos); blancos += entero(especiales.blancos);
      for (const v of r.votos.filter(v => String(v.tipo).toUpperCase() === 'VOCAL')) {
        const candidato = entero(v.candidato_id);
        if (!candidato) throw new Error('Candidato inválido.');
        votos.set(candidato, (votos.get(candidato) ?? 0) + entero(v.votos));
      }
    }
  }
  return { parroquia: id, eleccion_id: datos.eleccion_id, juntas_total: juntas.length, juntas_confirmadas: confirmadas,
    votos: Array.from(votos, ([candidato_id, votos]) => ({ candidato_id, votos })), nulos, blancos, consultado_en: new Date().toISOString() };
}
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('parroquia') ?? '';
  if (!PARROQUIAS_VOCALES.some(p => p.id === id)) return NextResponse.json({ ok: false, message: 'Parroquia inválida.' }, { status: 400, headers: CABECERAS_PRIVADAS });
  try {
    let consulta = enCurso.get(id);
    if (!consulta) {
      consulta = calcular(id).finally(() => enCurso.delete(id));
      enCurso.set(id, consulta);
    }
    return NextResponse.json({ ok: true, data: await consulta }, { headers: CABECERAS_PRIVADAS });
  } catch (e) {
    console.error('[VOCAL PARROQUIA]', e);
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'No se pudieron consultar los vocales.' }, { status: 502, headers: CABECERAS_PRIVADAS });
  }
}
