import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

import { environment } from '../../environments/environment';

export interface CfJunta {
  id: number;
  recinto_id: number;
  /** Código oficial del recinto CNE (p. ej. 934); NO es necesariamente recinto_id. */
  codigo_recinto?: number | string | null;
  recinto_codigo?: number | string | null;
  cod_recinto?: number | string | null;
  numero: number;
  tipo: 'F' | 'M';
  padron: number | null;
  padron_fuente?: 'BASE_DATOS' | 'REFERENCIAL_PRUEBAS' | 'SIN_CONFIGURAR' | 'INVALIDO' | 'CODIGO_RECINTO_INVALIDO';
  numeracion_verificada: number;
  /** 1 cuando la junta fue cerrada en cf_registro_cierres. */
  bloqueado?: boolean | number;
  recinto: string;
  parroquia: string;
  direccion: string | null;
  etiqueta: string;
}

export interface CfCandidato {
  id: number;
  nombre: string;
  tipo: 'ALCALDE' | 'CONCEJAL' | 'VOCAL';
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

export type CfDignidad = 'ALCALDE' | 'CONCEJAL' | 'VOCAL';
export type CfEspeciales = Record<CfDignidad, { nulos: number; blancos: number }>;

export interface CfRegistro {
  id: number;
  junta_id: number;
  eleccion_id: number;
  estado: 'BORRADOR' | 'CONFIRMADO' | 'FINALIZADO';
  bloqueado?: boolean;
  fecha_cierre?: string | null;
  evidencia?: { disponible: boolean; mime: string; bytes: number; sha256: string; actualizado_en: string } | null;
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
      this.http.get<ApiRespuesta<CfCatalogos>>(
        this.urlSinCache('/catalogos')
      ).pipe(timeout({ first: 15000 }))
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
    votos: { candidato_id: number; votos: number }[],
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
    votos: { candidato_id: number; votos: number }[],
    especiales: CfEspeciales
  ): Promise<ApiRespuesta<CfRegistroGuardado>> {
    return firstValueFrom(
      this.http.put<ApiRespuesta<CfRegistroGuardado>>(
        `${this.base}/registro/${juntaId}`,
        { junta_id: juntaId, votos, especiales }
      ).pipe(timeout({ first: 20000 }))
    );
  }

  /** PNG original en formato binario, sin Base64 ni multer. */
  subirFoto(juntaId: number, foto: Blob): Promise<ApiRespuesta<{
    mime: string; bytes: number; sha256: string
  }>> {
    return firstValueFrom(this.http.post<ApiRespuesta<{
      mime: string; bytes: number; sha256: string
    }>>(`${this.base}/registro/${juntaId}/foto`, foto)
      .pipe(timeout({ first: 120000 })));
  }

  obtenerFoto(juntaId: number): Promise<Blob> {
    return firstValueFrom(this.http.get(
      this.urlSinCache(`/registro/${juntaId}/foto`),
      { responseType: 'blob' }
    ).pipe(timeout({ first: 30000 })));
  }

  /** Descarga con tipo image/png y nombre .png, no el .bin de phpMyAdmin. */
  descargarFoto(juntaId: number): Promise<Blob> {
    return firstValueFrom(this.http.get(
      this.urlSinCache(`/registro/${juntaId}/foto/descargar`),
      { responseType: 'blob' }
    ).pipe(timeout({ first: 60000 })));
  }

  finalizarJunta(juntaId: number): Promise<ApiRespuesta<{
    junta_id: number; registro_id: number; estado: 'FINALIZADO'; bloqueado: true
  }>> {
    return firstValueFrom(this.http.post<ApiRespuesta<{
      junta_id: number; registro_id: number; estado: 'FINALIZADO'; bloqueado: true
    }>>(`${this.base}/registro/${juntaId}/finalizar`, {})
      .pipe(timeout({ first: 30000 })));
  }

  eliminarRegistro(juntaId: number): Promise<ApiRespuesta<CfRegistroGuardado>> {
    return firstValueFrom(
      this.http.delete<ApiRespuesta<CfRegistroGuardado>>(
        `${this.base}/registro/${juntaId}`
      ).pipe(timeout({ first: 20000 }))
    );
  }
}
