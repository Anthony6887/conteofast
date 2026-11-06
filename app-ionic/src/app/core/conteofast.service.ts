import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

import { environment } from '../../environments/environment';

export interface CfJunta {
  id: number;
  recinto_id: number;
  numero: number;
  tipo: 'F' | 'M';
  padron: number | null;
  numeracion_verificada: number;
  recinto: string;
  parroquia: string;
  direccion: string | null;
  etiqueta: string;
}

export interface CfCandidato {
  id: number;
  nombre: string;
  tipo: 'ALCALDE' | 'CONCEJAL';
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
  estado: 'BORRADOR' | 'CONFIRMADO';
  fecha_registro: string;
  fecha_actualizacion: string;
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
    votos: { candidato_id: number; votos: number }[]
  ): Promise<ApiRespuesta<CfRegistroGuardado>> {
    return firstValueFrom(
      this.http.post<ApiRespuesta<CfRegistroGuardado>>(
        `${this.base}/registro`,
        { junta_id: juntaId, votos }
      ).pipe(timeout({ first: 20000 }))
    );
  }

  actualizarRegistro(
    juntaId: number,
    votos: { candidato_id: number; votos: number }[]
  ): Promise<ApiRespuesta<CfRegistroGuardado>> {
    return firstValueFrom(
      this.http.put<ApiRespuesta<CfRegistroGuardado>>(
        `${this.base}/registro/${juntaId}`,
        { junta_id: juntaId, votos }
      ).pipe(timeout({ first: 20000 }))
    );
  }

  eliminarRegistro(juntaId: number): Promise<ApiRespuesta<CfRegistroGuardado>> {
    return firstValueFrom(
      this.http.delete<ApiRespuesta<CfRegistroGuardado>>(
        `${this.base}/registro/${juntaId}`
      ).pipe(timeout({ first: 20000 }))
    );
  }
}
