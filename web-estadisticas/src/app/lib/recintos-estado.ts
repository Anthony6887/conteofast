// Datos del endpoint existente /api/conteofast/recintos-estado.
export type EstadoJunta = 'FINALIZADO' | 'CONFIRMADO' | 'EN_REVISION' | 'PENDIENTE';

export interface JuntaEstado {
  id: string;
  numero: string;
  tipo: string;
  padron: number | null;
  padron_fuente?: string;
  estado: EstadoJunta;
  bloqueado?: boolean | number;
  fecha_cierre?: string | null;
  actualizado_en: string | null;
  /** La API puede ampliar este dato en el futuro, pero no se inventa cuando falta. */
  tiene_foto?: boolean;
}

export interface RecintoEstado {
  id: string;
  codigo_recinto?: number | null;
  nombre: string;
  parroquia: string;
  direccion: string;
  total_juntas: number;
  confirmadas: number;
  finalizadas?: number;
  en_revision: number;
  pendientes: number;
  juntas: JuntaEstado[];
}

export interface DatosRecintos {
  eleccion_id: number;
  consultado_en: string;
  totales: {
    recintos: number;
    recintos_pendientes: number;
    juntas: number;
    confirmadas: number;
    finalizadas?: number;
    en_revision: number;
    pendientes: number;
  };
  recintos: RecintoEstado[];
}

export type RespuestaRecintos = { ok: boolean; message?: string; data?: DatosRecintos };

export function estaFinalizada(junta: JuntaEstado): boolean {
  return junta.estado === 'FINALIZADO' || junta.bloqueado === true || junta.bloqueado === 1;
}

export function tieneRegistro(junta: JuntaEstado): boolean {
  return junta.estado === 'CONFIRMADO' || estaFinalizada(junta);
}

export function etiquetaJunta(junta: JuntaEstado): string {
  const tipo = String(junta.tipo).toUpperCase();
  const prefijo = tipo === 'F' ? 'Femenina' : tipo === 'M' ? 'Masculina' : tipo;
  const nro = String(junta.numero).padStart(2, '0');
  return `${prefijo} ${nro}`;
}
