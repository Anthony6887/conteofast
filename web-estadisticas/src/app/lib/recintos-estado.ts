// Tipos que corresponden al endpoint /api/conteofast/recintos-estado.
export type EstadoJunta = 'CONFIRMADO' | 'EN_REVISION' | 'PENDIENTE';

export interface JuntaEstado {
  id: string;
  numero: string;
  tipo: string;
  padron: number | null;
  estado: EstadoJunta;
  actualizado_en: string | null;
}

export interface RecintoEstado {
  id: string;
  nombre: string;
  parroquia: string;
  direccion: string;
  total_juntas: number;
  confirmadas: number;
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
    en_revision: number;
    pendientes: number;
  };
  recintos: RecintoEstado[];
}

export type RespuestaRecintos = {
  ok: boolean;
  message?: string;
  data?: DatosRecintos;
};
