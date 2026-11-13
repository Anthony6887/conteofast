import { LISTAS, obtenerCandidato } from '../../lib/electoral';
import type { CandidatoResultado, Dignidad } from '../../lib/electoral';

export type FiltroTendencia = Dignidad | 'TODOS';
export type DignidadDetectada = Dignidad | 'SIN CLASIFICAR';

export interface FilaTendencia {
  id: string;
  numeroLista: string;
  dignidad: DignidadDetectada;
  nombre: string;
  foto: string | null;
  color: string;
  votos: number;
  registrado: boolean;
  cantidadCandidatos?: number;
}

type Referencia = { nombre: string; foto: string; pistas: string[] };
type ReferenciasPorDignidad = Record<Dignidad, Referencia>;

/**
 * Catálogo visual de las listas adicionales presentes en la carpeta de fotos
 * compartida. La pista se usa únicamente junto con el número de lista.
 * No se infiere la dignidad a partir del orden de los registros de la API.
 * Si el nombre no coincide, se exige una dignidad explícita del backend.
 */
const REFERENCIAS_EXTRA: Record<string, ReferenciasPorDignidad> = {
  '3': {
    ALCALDE: { nombre: 'Carlos Torres', foto: '3carlostorres.png', pistas: ['carlos torres'] },
    URBANO: { nombre: 'Maricela', foto: '3maricela.png', pistas: ['maricela'] },
    RURAL: { nombre: 'Rodríguez', foto: '3rodriguez.png', pistas: ['rodriguez'] },
  },
  '4': {
    ALCALDE: { nombre: 'Juan Medina', foto: '4juan.png', pistas: ['juan medina'] },
    URBANO: { nombre: 'Dolores', foto: '4dolores.png', pistas: ['dolores'] },
    RURAL: { nombre: 'Mónica', foto: '4monica.png', pistas: ['monica'] },
  },
  '20': {
    ALCALDE: { nombre: 'Ernesto Morales', foto: '20ernesto.png', pistas: ['ernesto morales', 'ernesto'] },
    URBANO: { nombre: 'Katherine', foto: '20katherine.png', pistas: ['katherine'] },
    RURAL: { nombre: 'Klever', foto: '20klever.png', pistas: ['klever'] },
  },
  '21': {
    ALCALDE: { nombre: 'Nathaly Alsambey', foto: '21nathaly.png', pistas: ['nathaly'] },
    URBANO: { nombre: 'Viviana', foto: '21viviana.png', pistas: ['viviana'] },
    RURAL: { nombre: 'Carlos', foto: '21carlos.png', pistas: ['carlos'] },
  },
  '61': {
    ALCALDE: { nombre: 'Kerly Gallegos', foto: '61kerly.png', pistas: ['kerly'] },
    URBANO: { nombre: 'Rodrigo', foto: '61rodrigo.png', pistas: ['rodrigo'] },
    RURAL: { nombre: 'Sabrina', foto: '61sabrina.png', pistas: ['sabrina'] },
  },
};

const COLORES: Record<string, string> = {
  '3': '#a47c25', '4': '#5570aa', '7': '#8246ac',
  '8': '#3999c9', '18': '#329b68', '20': '#218e9d',
  '21': '#9b772e', '61': '#b33d61', '62': '#d47c27',
};
const PALETA = ['#376eb6', '#139b8d', '#ad7554', '#8060ba', '#bc5379'];

const texto = (v: unknown) => v == null ? '' : String(v).trim();
const norm = (v: unknown) => texto(v).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

const registro = (c: CandidatoResultado) => c as unknown as Record<string, unknown>;
export const normalizarLista = (v: unknown) => /^0*\d+$/.test(texto(v))
  ? String(Number(v)) : texto(v);

function listaDe(c: CandidatoResultado): string {
  const r = registro(c);
  return normalizarLista(r.numero_lista ?? r.NUMERO_LISTA ?? r.numeroLista ??
    r.lista_numero ?? r.lista ?? r.nro_lista ?? r.LISTA ?? '');
}
function nombreDe(c: CandidatoResultado): string {
  const r = registro(c);
  return texto(r.nombre ?? r.NOMBRE ?? r.nombre_candidato ?? r.candidato ?? r.nombres);
}
function votosDe(c: CandidatoResultado): number {
  const r = registro(c);
  const n = Number(r.total_votos ?? r.TOTAL_VOTOS ?? r.votos ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Si la API usa IDs numéricos de dignidad, agregarlos solo tras verificar el catálogo. */
const CODIGOS_DIGNIDAD: Partial<Record<string, Dignidad>> = {};

function detectarDignidad(v: unknown): Dignidad | null {
  if (v && typeof v === 'object') {
    const r = v as Record<string, unknown>;
    for (const x of [r.nombre, r.descripcion, r.etiqueta, r.tipo, r.codigo, r.id]) {
      const d = detectarDignidad(x);
      if (d) return d;
    }
    return null;
  }
  const literal = texto(v);
  if (CODIGOS_DIGNIDAD[literal]) return CODIGOS_DIGNIDAD[literal] ?? null;
  const t = norm(v);
  if (/(^| )alcald/.test(t) || t === 'alc') return 'ALCALDE';
  if (t.includes('urban') || t === 'cu' || t === 'concejal u') return 'URBANO';
  if (t.includes('rural') || t === 'cr' || t === 'concejal r') return 'RURAL';
  return null;
}

function referenciaDe(lista: string, dignidad: Dignidad): Referencia | null {
  const extra = REFERENCIAS_EXTRA[lista]?.[dignidad];
  if (extra) return extra;
  const conocida = LISTAS.find(l => normalizarLista(l.numero) === lista);
  if (!conocida) return null;
  const persona = dignidad === 'ALCALDE' ? conocida.alcalde
    : dignidad === 'URBANO' ? conocida.urbano : conocida.rural;
  return { nombre: persona.nombre, foto: persona.foto, pistas: [norm(persona.nombre)] };
}

function dignidadDe(c: CandidatoResultado, candidatos: CandidatoResultado[]): DignidadDetectada {
  const r = registro(c);
  const campos = [
    r.dignidad, r.DIGNIDAD, r.dignidad_nombre, r.DIGNIDAD_NOMBRE,
    r.nombre_dignidad, r.NOMBRE_DIGNIDAD, r.tipo_dignidad, r.TIPO_DIGNIDAD,
    r.cargo, r.CARGO, r.nombre_cargo, r.NOMBRE_CARGO,
    r.cargo_nombre, r.descripcion_dignidad, r.DESCRIPCION_DIGNIDAD,
    r.tipo_candidatura, r.TIPO_CANDIDATURA, r.eleccion, r.ELECCION,
    r.codigo_dignidad, r.CODIGO_DIGNIDAD, r.dignidad_id, r.ID_DIGNIDAD,
    r.tipo, r.TIPO,
  ];
  for (const campo of campos) {
    const d = detectarDignidad(campo);
    if (d) return d;
  }
  const lista = listaDe(c);
  const nombre = norm(nombreDe(c));
  const foto = texto(r.foto ?? r.FOTO ?? r.fotografia ?? r.imagen ?? r.IMAGEN)
    .split('/').pop()?.toLowerCase() ?? '';
  // Una fotografía identificada con un cargo permite reconocerlo de forma inequívoca.
  for (const dignidad of ['ALCALDE', 'URBANO', 'RURAL'] as const) {
    const ref = referenciaDe(lista, dignidad);
    if (!ref) continue;
    if (foto && foto === ref.foto.toLowerCase()) return dignidad;
    if (nombre && ref.pistas.some(p => {
      const pista = norm(p);
      return pista && (` ${nombre} `).includes(` ${pista} `);
    })) return dignidad;
  }
  // Compatibilidad con el catálogo original y su función de correspondencia.
  const conocida = LISTAS.find(l => normalizarLista(l.numero) === lista);
  if (conocida) {
    for (const dignidad of ['ALCALDE', 'URBANO', 'RURAL'] as const) {
      const encontrado = obtenerCandidato(candidatos, conocida, dignidad);
      if (encontrado === c || (encontrado && nombre && norm(encontrado.nombre) === nombre)) {
        return dignidad;
      }
    }
  }
  return 'SIN CLASIFICAR';
}

function colorDe(lista: string) {
  const original = LISTAS.find(l => normalizarLista(l.numero) === lista)?.color;
  if (original) return original;
  if (COLORES[lista]) return COLORES[lista];
  let x = 0;
  for (const caracter of lista) x = (x * 31 + caracter.charCodeAt(0)) >>> 0;
  return PALETA[x % PALETA.length];
}
function fotoDe(c: CandidatoResultado, lista: string, dignidad: Dignidad): string | null {
  const r = registro(c);
  const nombre = texto(r.foto ?? r.FOTO ?? r.fotografia ?? r.imagen ?? r.IMAGEN)
    .split(/[\\/]/).pop() ?? '';
  if (/^[a-z0-9_.-]+\.(png|webp|jpe?g)$/i.test(nombre)) return nombre;
  return referenciaDe(lista, dignidad)?.foto ?? null;
}

/**
 * Una barra por lista y dignidad. Los registros del mismo candidato se
 * desduplican, y si la API trae varios concejales diferentes de la misma lista
 * se suman sus votos en la barra correspondiente a dicha lista.
 */
export function crearFilasTendencia(candidatos: CandidatoResultado[], filtro: FiltroTendencia): FilaTendencia[] {
  const individuales = new Map<string, FilaTendencia>();
  for (const c of candidatos) {
    const lista = listaDe(c);
    const nombre = nombreDe(c);
    if (!lista) continue;
    const dignidad = dignidadDe(c, candidatos);
    if (dignidad === 'SIN CLASIFICAR') continue;
    if (filtro !== 'TODOS' && dignidad !== filtro) continue;
    const r = registro(c);
    const id = texto(r.id_candidato ?? r.candidato_id ?? r.id);
    const clave = `${lista}:${dignidad}:${id ? `id-${id}` : norm(nombre) || 'unico'}`;
    const votos = votosDe(c);
    const anterior = individuales.get(clave);
    if (!anterior || votos > anterior.votos) {
      individuales.set(clave, {
        id: clave, numeroLista: lista, dignidad,
        nombre: nombre || `Lista ${lista}`, foto: fotoDe(c, lista, dignidad),
        color: colorDe(lista), votos, registrado: true, cantidadCandidatos: 1,
      });
    }
  }
  const porLista = new Map<string, FilaTendencia>();
  for (const fila of individuales.values()) {
    const key = `${fila.numeroLista}:${fila.dignidad}`;
    const existente = porLista.get(key);
    if (!existente) {
      porLista.set(key, { ...fila, id: key });
    } else {
      existente.votos += fila.votos;
      existente.cantidadCandidatos = (existente.cantidadCandidatos ?? 1) + 1;
      existente.nombre = `${existente.cantidadCandidatos} candidatos`;
      existente.foto = null;
    }
  }
  // Mostrar también las listas configuradas que aún no tengan votos en la API.
  const numeros = new Set([
    ...LISTAS.map(l => normalizarLista(l.numero)),
    ...Object.keys(REFERENCIAS_EXTRA),
    ...candidatos.map(listaDe).filter(Boolean),
  ]);
  for (const lista of numeros) {
    for (const d of ['ALCALDE', 'URBANO', 'RURAL'] as const) {
      if (filtro !== 'TODOS' && d !== filtro) continue;
      const key = `${lista}:${d}`;
      if (porLista.has(key)) continue;
      const ref = referenciaDe(lista, d);
      porLista.set(key, {
        id: key, numeroLista: lista, dignidad: d,
        nombre: ref?.nombre || 'Sin información', foto: ref?.foto ?? null,
        color: colorDe(lista), votos: 0, registrado: false, cantidadCandidatos: 0,
      });
    }
  }
  return [...porLista.values()].sort((a, b) =>
    a.numeroLista.localeCompare(b.numeroLista, 'es', { numeric: true }) ||
    a.dignidad.localeCompare(b.dignidad));
}

export function votosPorDignidad(filas: FilaTendencia[], dignidad: DignidadDetectada): number {
  return filas.reduce((s, f) => s + (f.dignidad === dignidad ? f.votos : 0), 0);
}
export function diferenciaConAnterior(actual: FilaTendencia, anteriores: FilaTendencia[]): number | null {
  const previo = anteriores.find(f => f.id === actual.id && f.registrado);
  return actual.registrado && previo ? actual.votos - previo.votos : null;
}
export function contarSinDignidad(candidatos: CandidatoResultado[]): number {
  const claves = new Set<string>();
  for (const c of candidatos) {
    if (dignidadDe(c, candidatos) !== 'SIN CLASIFICAR') continue;
    const r = registro(c);
    const id = texto(r.id_candidato ?? r.candidato_id ?? r.id);
    claves.add(`${listaDe(c)}:${id || norm(nombreDe(c))}`);
  }
  return claves.size;
}
