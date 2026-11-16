import type { CandidatoResultado } from './electoral';
import { numeroLista } from './visualizacion-en-vivo';

export type TipoActa = 'ALCALDE' | 'CONCEJAL' | 'VOCAL';
export const TIPOS_ACTA: TipoActa[] = ['ALCALDE', 'CONCEJAL', 'VOCAL'];

export interface VotoJunta {
  candidato_id: number;
  nombre: string;
  tipo: TipoActa;
  votos: number;
}
export interface EspecialJunta { nulos: number; blancos: number }
export interface RegistroActa {
  id: number;
  junta_id: number;
  estado: string;
  bloqueado?: boolean;
  fecha_cierre?: string | null;
  votos: VotoJunta[];
  especiales: Partial<Record<TipoActa, EspecialJunta>>;
  evidencia?: {
    disponible: boolean;
    mime?: string;
    bytes?: number;
    sha256?: string;
    actualizado_en?: string;
  } | null;
}
export type RespuestaRegistro = { ok: boolean; message?: string; data: RegistroActa | null };

export interface FilaRevision { id: number; lista: string; nombre: string; votos: number }
export interface ResumenDignidad {
  tipo: TipoActa;
  titulo: string;
  filas: FilaRevision[];
  validos: number;
  nulos: number;
  blancos: number;
  total: number;
}

const entero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/** El número de lista proviene de los candidatos devueltos por la API; no se reconstruye por nombre. */
export function construirResumenActa(
  registro: RegistroActa,
  catalogo: CandidatoResultado[],
  ambito: 'URBANO' | 'RURAL',
): ResumenDignidad[] {
  const porId = new Map(catalogo.map(c => [Number(c.candidato_id), c]));
  const tipos = ambito === 'RURAL' ? TIPOS_ACTA : TIPOS_ACTA.filter(t => t !== 'VOCAL');
  return tipos.map(tipo => {
    const filas = (Array.isArray(registro.votos) ? registro.votos : [])
      .filter(v => String(v.tipo).toUpperCase() === tipo)
      .map(v => ({
        id: Number(v.candidato_id),
        nombre: String(v.nombre || porId.get(Number(v.candidato_id))?.nombre || `Candidato ${v.candidato_id}`).trim(),
        lista: numeroLista(porId.get(Number(v.candidato_id))?.numero_lista) || '—',
        votos: entero(v.votos),
      }))
      .sort((a, b) => a.lista.localeCompare(b.lista, 'es', { numeric: true }));
    const espec = registro.especiales?.[tipo];
    const validos = filas.reduce((total, fila) => total + fila.votos, 0);
    const nulos = entero(espec?.nulos);
    const blancos = entero(espec?.blancos);
    return {
      tipo, titulo: tipo === 'ALCALDE' ? 'Alcaldía' : tipo === 'VOCAL' ? 'Vocales parroquiales' : `Concejalía ${ambito.toLowerCase()}`,
      filas, validos, nulos, blancos, total: validos + nulos + blancos,
    };
  });
}
