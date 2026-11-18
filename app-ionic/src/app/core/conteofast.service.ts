import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

import { environment } from '../../environments/environment';

export type CfDignidad = 'ALCALDE' | 'CONCEJAL' | 'VOCAL';
export type CfVotoDetalle = { candidato_id: number; votos: number };
export type CfEspeciales = Record<CfDignidad, { nulos: number; blancos: number }>;

export interface CfJunta {
  id: number;
  recinto_id: number;
  /** Código oficial del recinto CNE; no confundir con recinto_id. */
  codigo_recinto?: number | string | null;
  recinto_codigo?: number | string | null;
  cod_recinto?: number | string | null;
  numero: number;
  tipo: 'F' | 'M';
  padron: number | null;
  padron_fuente?: 'BASE_DATOS' | 'REFERENCIAL_PRUEBAS' | 'SIN_CONFIGURAR' | 'INVALIDO' | 'CODIGO_RECINTO_INVALIDO';
  numeracion_verificada: number;
  bloqueado?: boolean | number;
  recinto: string;
  parroquia: string;
  direccion: string | null;
  etiqueta: string;
}

export interface CfCandidato {
  id: number;
  nombre: string;
  tipo: CfDignidad;
  modalidad: 'INDIVIDUAL' | 'LISTA';
  numero_lista: string | null;
  circunscripcion_id: number | null;
  ambito: 'URBANO' | 'RURAL' | null;
}

export interface CfCatalogos {
  eleccion_id: number;
  juntas: CfJunta[];
  candidatos: CfCandidato[];
}

export interface CfRegistro {
  id: number;
  junta_id: number;
  eleccion_id: number;
  estado: 'BORRADOR' | 'CONFIRMADO' | 'FINALIZADO';
  bloqueado?: boolean;
  fecha_cierre?: string | null;
  evidencia?: {
    disponible: boolean;
    mime: string;
    bytes: number;
    sha256: string;
    actualizado_en: string;
  } | null;
  fecha_registro: string;
  fecha_actualizacion: string;
  especiales?: Partial<CfEspeciales>;
  votos: {
    candidato_id: number;
    votos: number;
    nombre: string;
    tipo: string;
  }[];
}

export interface CfRegistroGuardado {
  registro_id: number;
  junta_id: number;
  estado?: string;
  creado?: boolean;
}

export interface CfEstadoDignidad {
  guardado: boolean;
  foto: boolean;
  finalizado: boolean;
  fecha_cierre?: string | null;
}

export type CfEstadosDignidades = Record<CfDignidad, CfEstadoDignidad>;

export interface ApiRespuesta<T> {
  ok: boolean;
  message?: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class ConteofastService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl.replace(/\/$/, '')}/conteofast`;
  private contador = 0;

  private urlSinCache(ruta: string): string {
    this.contador += 1;
    return `${this.base}${ruta}?_cf=${Date.now()}-${this.contador}`;
  }

  catalogos(): Promise<ApiRespuesta<CfCatalogos>> {
    return firstValueFrom(
      this.http.get<ApiRespuesta<CfCatalogos>>(this.urlSinCache('/catalogos'))
        .pipe(timeout({ first: 15000 }))
    );
  }

  consultarRegistro(juntaId: number): Promise<ApiRespuesta<CfRegistro | null>> {
    return firstValueFrom(
      this.http.get<ApiRespuesta<CfRegistro | null>>(
        this.urlSinCache(`/registro/${juntaId}`)
      ).pipe(timeout({ first: 15000 }))
    );
  }

  guardarRegistro(
    juntaId: number,
    votos: CfVotoDetalle[],
    especiales: CfEspeciales
  ): Promise<ApiRespuesta<CfRegistroGuardado>> {
    return firstValueFrom(
      this.http.post<ApiRespuesta<CfRegistroGuardado>>(
        `${this.base}/registro`,
        { junta_id: juntaId, votos, especiales }
      ).pipe(timeout({ first: 20000 }))
    );
  }

  actualizarRegistro(
    juntaId: number,
    votos: CfVotoDetalle[],
    especiales: CfEspeciales
  ): Promise<ApiRespuesta<CfRegistroGuardado>> {
    return firstValueFrom(
      this.http.put<ApiRespuesta<CfRegistroGuardado>>(
        `${this.base}/registro/${juntaId}`,
        { junta_id: juntaId, votos, especiales }
      ).pipe(timeout({ first: 20000 }))
    );
  }

  /** Compatibilidad con fotografías de junta completa (API anterior). */
  subirFoto(juntaId: number, foto: Blob): Promise<ApiRespuesta<{
    mime: string; bytes: number; sha256: string;
  }>> {
    return firstValueFrom(
      this.http.post<ApiRespuesta<{ mime: string; bytes: number; sha256: string }>>(
        `${this.base}/registro/${juntaId}/foto`,
        foto,
        { headers: new HttpHeaders({ 'Content-Type': 'image/png' }) }
      ).pipe(timeout({ first: 120000 }))
    );
  }

  obtenerFoto(juntaId: number): Promise<Blob> {
    return firstValueFrom(
      this.http.get(this.urlSinCache(`/registro/${juntaId}/foto`), {
        responseType: 'blob'
      }).pipe(timeout({ first: 30000 }))
    );
  }

  descargarFoto(juntaId: number): Promise<Blob> {
    return firstValueFrom(
      this.http.get(this.urlSinCache(`/registro/${juntaId}/foto/descargar`), {
        responseType: 'blob'
      }).pipe(timeout({ first: 60000 }))
    );
  }

  finalizarJunta(juntaId: number): Promise<ApiRespuesta<{
    junta_id: number; registro_id: number; estado: 'FINALIZADO'; bloqueado: true;
  }>> {
    return firstValueFrom(
      this.http.post<ApiRespuesta<{
        junta_id: number; registro_id: number; estado: 'FINALIZADO'; bloqueado: true;
      }>>(`${this.base}/registro/${juntaId}/finalizar`, {})
        .pipe(timeout({ first: 30000 }))
    );
  }

  eliminarRegistro(juntaId: number): Promise<ApiRespuesta<CfRegistroGuardado>> {
    return firstValueFrom(
      this.http.delete<ApiRespuesta<CfRegistroGuardado>>(
        `${this.base}/registro/${juntaId}`
      ).pipe(timeout({ first: 20000 }))
    );
  }

  /** Estado independiente de Alcaldía, Concejalía y Vocales. */
  estadoDignidades(juntaId: number): Promise<ApiRespuesta<CfEstadosDignidades>> {
    return firstValueFrom(
      this.http.get<ApiRespuesta<CfEstadosDignidades>>(
        this.urlSinCache(`/registro/${juntaId}/dignidades`)
      ).pipe(timeout({ first: 15000 }))
    );
  }

  /** Guarda únicamente los votos y especiales de la dignidad elegida. */
  guardarDignidad(
    juntaId: number,
    tipo: CfDignidad,
    votos: CfVotoDetalle[],
    especiales: { nulos: number; blancos: number }
  ): Promise<ApiRespuesta<unknown>> {
    return firstValueFrom(
      this.http.put<ApiRespuesta<unknown>>(
        `${this.base}/registro/${juntaId}/dignidad/${tipo}`,
        { votos, nulos: especiales.nulos, blancos: especiales.blancos }
      ).pipe(timeout({ first: 20000 }))
    );
  }

  /** Foto PNG binaria RAW. NO FormData ni Base64. */
  subirFotoDignidad(
    juntaId: number,
    tipo: CfDignidad,
    foto: Blob
  ): Promise<ApiRespuesta<{ mime: string; bytes: number; sha256: string }>> {
    if (foto.type !== 'image/png') {
      return Promise.reject(new Error('La fotografía debe estar en formato PNG.'));
    }
    if (foto.size < 512 || foto.size > 30 * 1024 * 1024) {
      return Promise.reject(new Error('El PNG debe tener entre 512 bytes y 30 MiB.'));
    }
    return firstValueFrom(
      this.http.post<ApiRespuesta<{ mime: string; bytes: number; sha256: string }>>(
        `${this.base}/registro/${juntaId}/dignidad/${tipo}/foto`,
        foto,
        { headers: new HttpHeaders({ 'Content-Type': 'image/png' }) }
      ).pipe(timeout({ first: 120000 }))
    );
  }

  obtenerFotoDignidad(juntaId: number, tipo: CfDignidad): Promise<Blob> {
    return firstValueFrom(
      this.http.get(
        this.urlSinCache(`/registro/${juntaId}/dignidad/${tipo}/foto`),
        { responseType: 'blob' }
      ).pipe(timeout({ first: 30000 }))
    );
  }

  finalizarDignidad(juntaId: number, tipo: CfDignidad): Promise<ApiRespuesta<{
    junta_id: number;
    registro_id: number;
    tipo: CfDignidad;
    estado: 'FINALIZADO';
    bloqueado: true;
  }>> {
    return firstValueFrom(
      this.http.post<ApiRespuesta<{
        junta_id: number;
        registro_id: number;
        tipo: CfDignidad;
        estado: 'FINALIZADO';
        bloqueado: true;
      }>>(`${this.base}/registro/${juntaId}/dignidad/${tipo}/finalizar`, {})
        .pipe(timeout({ first: 30000 }))
    );
  }
}
