import type { CandidatoResultado, Dignidad } from './electoral';

/** Cuarta pestaña disponible en la visualización principal. */
export type TipoEscenario = Dignidad | 'VOCAL';
export type OrdenVisual = 'lista' | 'votos';

export type ResultadoLista = {
  lista: string;
  nombres: string[];
  votos: number;
  candidaturas: number;
  foto: string | null;
  logo: string | null;
  porcentaje: number;
  color: string;
};

/**
 * Catálogo del registro electoral proporcionado para ConteoFast.
 * Impide mezclar Concejalía Urbana con Rural.
 * Vocales NO utiliza este filtro: los vocales válidos se reciben desde la API.
 */
export const LISTAS_CONCEJALIA: Record<'URBANO' | 'RURAL', ReadonlySet<string>> = {
  URBANO: new Set(['3', '4', '6-8', '7', '18', '20', '21', '61', '62']),
  RURAL: new Set(['1', '3', '6-8', '7', '18', '20', '21', '61', '62']),
};

/** Rutas de archivos que existen en las capturas del proyecto, dentro de public. */
const FOTOS_ALCALDES: Record<string, string> = {
  '3': '3-alcalde.png',
  '4': '4-alcalde.png',
  '6-8': '6-8-alcalde.webp',
  '7': '7-alcalde.webp',
  '18': '18-alcalde.webp',
  '20': '20-alcalde.png',
  '21': '21-alcalde.png',
  '61': '61-alcalde.png',
  '62': '62-alcalde.webp',
};

const LOGOS: Record<string, string> = {
  '1': 'lista-1.png',
  '3': 'lista-3.png',
  '4': 'lista-4.png',
  '6-8': 'lista-8.png', // Imagen facilitada para el componente 8 de la alianza 6-8.
  '7': 'lista-7.png',
  '18': 'lista-18.png',
  '20': 'lista-20.png',
  '21': 'lista-21.png',
  '61': 'lista-61.png',
  '62': 'lista-62.png',
};

const COLORES: Record<string, string> = {
  '1': '#44799e',
  '3': '#c33e43',
  '4': '#5a9857',
  '6-8': '#168cb0',
  '7': '#76409d',
  '18': '#b39a28',
  '20': '#bf4045',
  '21': '#327db0',
  '61': '#27a4cf',
  '62': '#dc8334',
};

export function normalizarNombre(valor: unknown): string {
  return String(valor ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase().replace(/\s+/g, ' ');
}

export function numeroLista(valor: unknown): string {
  const literal = String(valor ?? '').trim()
    .replace(/[–—/]/g, '-')
    .replace(/\s+/g, '');
  return /^0*\d+$/.test(literal) ? String(Number(literal)) : literal;
}

/** Un candidato solo pertenece a una pestaña. */
export function perteneceAEscenario(c: CandidatoResultado, escenario: TipoEscenario): boolean {
  const tipo = normalizarNombre(c.tipo);
  const ambito = normalizarNombre(c.ambito);
  const lista = numeroLista(c.numero_lista);
  if (!lista) return false;

  if (escenario === 'ALCALDE') return tipo === 'ALCALDE';
  if (escenario === 'VOCAL') return tipo === 'VOCAL' || tipo === 'VOCALES';
  if (tipo !== 'CONCEJAL') return false;
  return ambito === escenario && LISTAS_CONCEJALIA[escenario].has(lista);
}

function compararLista(a: { lista: string }, b: { lista: string }): number {
  return a.lista.localeCompare(b.lista, 'es', { numeric: true });
}

/**
 * Agrupa por lista los votos que el backend trae de cf_candidatos y sus registros.
 * En Vocales recibe únicamente candidatos y votos de la parroquia seleccionada.
 * La función no genera filas ficticias ni votos de demostración.
 */
export function agruparPorListas(
  candidatos: CandidatoResultado[],
  escenario: TipoEscenario,
  orden: OrdenVisual = 'lista',
): ResultadoLista[] {
  const grupos = new Map<string, { nombres: string[]; votos: number; ids: Set<number> }>();

  for (const c of candidatos) {
    if (!perteneceAEscenario(c, escenario)) continue;
    const lista = numeroLista(c.numero_lista);
    const id = Number(c.candidato_id);
    const grupo = grupos.get(lista) ?? { nombres: [], votos: 0, ids: new Set<number>() };
    // La API normalmente devuelve una fila por candidato, pero deduplicamos IDs si se repite.
    if (Number.isFinite(id) && grupo.ids.has(id)) continue;
    if (Number.isFinite(id)) grupo.ids.add(id);
    const nombre = String(c.nombre ?? '').trim().replace(/\s+/g, ' ') || `Lista ${lista}`;
    if (!grupo.nombres.includes(nombre)) grupo.nombres.push(nombre);
    const votos = Number(c.total_votos);
    grupo.votos += Number.isFinite(votos) && votos > 0 ? Math.floor(votos) : 0;
    grupos.set(lista, grupo);
  }

  const total = [...grupos.values()].reduce((suma, grupo) => suma + grupo.votos, 0);
  const filas: ResultadoLista[] = [...grupos.entries()].map(([lista, grupo]) => ({
    lista,
    nombres: grupo.nombres,
    votos: grupo.votos,
    candidaturas: grupo.ids.size || grupo.nombres.length,
    foto: escenario === 'ALCALDE' && grupo.nombres.length === 1
      ? FOTOS_ALCALDES[lista] ?? null : null,
    logo: LOGOS[lista] ?? null,
    porcentaje: total > 0 ? (grupo.votos * 100) / total : 0,
    color: COLORES[lista] ?? '#477aa9',
  }));

  filas.sort((a, b) => orden === 'votos'
    ? b.votos - a.votos || compararLista(a, b)
    : compararLista(a, b));
  return filas;
}

export function totalVotos(filas: ResultadoLista[]): number {
  return filas.reduce((suma, fila) => suma + fila.votos, 0);
}
