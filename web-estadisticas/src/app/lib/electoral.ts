export type Dignidad = 'ALCALDE' | 'URBANO' | 'RURAL';

export interface CandidatoResultado {
  candidato_id: number;
  nombre: string;
  tipo: 'ALCALDE' | 'CONCEJAL';
  ambito: 'URBANO' | 'RURAL' | null;
  numero_lista: string | null;
  total_votos: number;
}

export interface ResumenParroquia {
  parroquia: string;
  juntas: number;
}

export interface DashboardDatos {
  eleccion_id: number;
  juntas_confirmadas: number;
  juntas_total: number;
  recintos_total: number;
  parroquias_total: number;
  candidatos: CandidatoResultado[];
  juntas_por_parroquia: ResumenParroquia[];
  consultado_en: string;
}

export interface ApiDashboard {
  ok: boolean;
  message?: string;
  data?: DashboardDatos;
}

export interface PersonaLista {
  nombre: string;
  foto: string;
}

export interface ListaReferente {
  numero: string;
  color: string;
  alcalde: PersonaLista;
  urbano: PersonaLista;
  rural: PersonaLista;
}

// Los nombres y asociación de candidatos se tomaron del cuadro proporcionado
// por el usuario. Los votos SIEMPRE se consultan en la API; nunca se precargan.
export const LISTAS: ListaReferente[] = [
  {
    numero: '7', color: '#8345b1',
    alcalde: { nombre: 'LEONARDO MAROTO', foto: '7-alcalde.webp' },
    urbano: { nombre: 'PAOLA PICO', foto: '7-urbano.webp' },
    rural: { nombre: 'LUIS SILVA', foto: '7-rural.webp' },
  },
  {
    numero: '8', color: '#1697ca',
    alcalde: { nombre: 'GABRIEL ZUÑIGA', foto: '8-alcalde.webp' },
    urbano: { nombre: 'EDISON RODRIGUEZ', foto: '8-urbano.webp' },
    rural: { nombre: 'CECILIA SILVA', foto: '8-rural.webp' },
  },
  {
    numero: '18', color: '#219965',
    alcalde: { nombre: 'CELESTE RODRIGUEZ', foto: '18-alcalde.webp' },
    urbano: { nombre: 'DANIEL LUNA', foto: '18-urbano.webp' },
    rural: { nombre: 'EDWIN CAIZABANDA', foto: '18-rural.webp' },
  },
  {
    numero: '62', color: '#d17b20',
    alcalde: { nombre: 'DARWIN LOPEZ', foto: '62-alcalde.webp' },
    urbano: { nombre: 'IVAN PICO', foto: '62-urbano.webp' },
    rural: { nombre: 'GRACIELA HIDALGO', foto: '62-rural.webp' },
  },
];

export const DIGNIDADES: { id: Dignidad; nombre: string; corto: string }[] = [
  { id: 'ALCALDE', nombre: 'Alcaldes', corto: 'Alcalde' },
  { id: 'URBANO', nombre: 'Concejales urbanos', corto: 'Urbano' },
  { id: 'RURAL', nombre: 'Concejales rurales', corto: 'Rural' },
];

export function textoNormalizado(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export function cargoCandidato(c: CandidatoResultado): Dignidad | null {
  if (c.tipo === 'ALCALDE') return 'ALCALDE';
  if (c.tipo === 'CONCEJAL' && c.ambito === 'URBANO') return 'URBANO';
  if (c.tipo === 'CONCEJAL' && c.ambito === 'RURAL') return 'RURAL';
  // Respaldo de visualización cuando una API anterior aún no envía ambito:
  // la correspondencia proviene del listado de candidatos aportado.
  const nombre = textoNormalizado(c.nombre);
  const lista = LISTAS.find(l => l.numero === String(c.numero_lista ?? '') ||
    [l.alcalde.nombre, l.urbano.nombre, l.rural.nombre].some(p => textoNormalizado(p) === nombre));
  if (!lista) return null;
  if (textoNormalizado(lista.urbano.nombre) === nombre) return 'URBANO';
  if (textoNormalizado(lista.rural.nombre) === nombre) return 'RURAL';
  return null;
}

export function obtenerCandidato(
  candidatos: CandidatoResultado[],
  lista: ListaReferente,
  dignidad: Dignidad,
): CandidatoResultado | null {
  const persona = dignidad === 'ALCALDE' ? lista.alcalde : dignidad === 'URBANO' ? lista.urbano : lista.rural;
  const porNombre = candidatos.find(c => textoNormalizado(c.nombre) === textoNormalizado(persona.nombre));
  if (porNombre && cargoCandidato(porNombre) === dignidad) return porNombre;
  return candidatos.find(c => String(c.numero_lista ?? '') === lista.numero && cargoCandidato(c) === dignidad) ?? null;
}

export function votosDignidad(candidatos: CandidatoResultado[], dignidad: Dignidad): number {
  return LISTAS.reduce((suma, lista) => suma + (obtenerCandidato(candidatos, lista, dignidad)?.total_votos ?? 0), 0);
}

export function numero(valor: number): string {
  return new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 }).format(valor);
}

export function porcentaje(numerador: number, denominador: number): number {
  if (!denominador || !Number.isFinite(numerador)) return 0;
  return Math.max(0, Math.min(100, (numerador / denominador) * 100));
}

export function porcentajeTexto(valor: number): string {
  return `${new Intl.NumberFormat('es-EC', { maximumFractionDigits: 1 }).format(valor)}%`;
}

export const BASE_PATH = '/conteofast';
