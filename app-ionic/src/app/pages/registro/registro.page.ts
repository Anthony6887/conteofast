import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar
} from '@ionic/angular';

import { ConteofastService } from '../../core/conteofast.service';
import type { CfCandidato, CfJunta } from '../../core/conteofast.service';

interface RecintoOpcion {
  id: number;
  nombre: string;
  parroquia: string;
}

interface ListaAgrupada {
  numero: string;
  alcaldes: CfCandidato[];
  urbanos: CfCandidato[];
  rurales: CfCandidato[];
  otros: CfCandidato[];
}

type Ambito = 'URBANO' | 'RURAL';

/**
 * Respaldo TEMPORAL para el catálogo confirmado de la elección 1.
 * Solo se aplica si coinciden ID y nombre. La fuente definitiva es
 * cf_candidatos.ambito y numero_lista enviados por la API.
 */
const CONCEJALES_CONOCIDOS: Record<number, {
  nombre: string;
  numero: string;
  ambito: Ambito;
}> = {
  2: { nombre: 'CECILIA SILVA', numero: '8', ambito: 'RURAL' },
  6: { nombre: 'EDISON RODRIGUEZ', numero: '8', ambito: 'URBANO' },
  7: { nombre: 'EDWIN CAIZABANDA', numero: '18', ambito: 'RURAL' },
  8: { nombre: 'DANIEL LUNA', numero: '18', ambito: 'URBANO' },
  9: { nombre: 'GRACIELA HIDALGO', numero: '62', ambito: 'RURAL' },
  10: { nombre: 'IVAN PICO', numero: '62', ambito: 'URBANO' },
  11: { nombre: 'LUIS SILVA', numero: '7', ambito: 'RURAL' },
  12: { nombre: 'PAOLA PICO', numero: '7', ambito: 'URBANO' }
};

const LISTAS_CONOCIDAS = new Set(['7', '8', '18', '62']);

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [
    FormsModule,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar
  ],
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss']
})
export class RegistroPage implements OnInit {
  private readonly api = inject(ConteofastService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private consultaVersion = 0;

  juntas: CfJunta[] = [];
  candidatos: CfCandidato[] = [];
  recintoId: number | null = null;
  tipo: 'F' | 'M' | null = null;
  juntaId: number | null = null;
  votos: Record<number, number | null> = {};

  cargando = false;
  consultando = false;
  guardando = false;
  consultado = false;
  registroExistente = false;
  error = '';
  mensaje = '';

  get recintos(): RecintoOpcion[] {
    const encontrados = new Map<number, RecintoOpcion>();
    for (const junta of this.juntas) {
      const id = Number(junta.recinto_id);
      if (!encontrados.has(id)) {
        encontrados.set(id, {
          id,
          nombre: junta.recinto,
          parroquia: junta.parroquia
        });
      }
    }
    return [...encontrados.values()].sort((a, b) =>
      `${a.parroquia} ${a.nombre}`.localeCompare(`${b.parroquia} ${b.nombre}`, 'es')
    );
  }

  get juntasDisponibles(): CfJunta[] {
    if (this.recintoId === null || this.tipo === null) return [];
    return this.juntas
      .filter(j => Number(j.recinto_id) === this.recintoId && j.tipo === this.tipo)
      .sort((a, b) => Number(a.numero) - Number(b.numero));
  }

  get juntaSeleccionada(): CfJunta | undefined {
    return this.juntas.find(j => Number(j.id) === this.juntaId);
  }

  get listas(): ListaAgrupada[] {
    const mapa = new Map<string, ListaAgrupada>();

    for (const candidato of this.candidatos) {
      const numero = String(candidato.numero_lista ?? '').trim() || 'SIN LISTA';
      let lista = mapa.get(numero);
      if (!lista) {
        lista = { numero, alcaldes: [], urbanos: [], rurales: [], otros: [] };
        mapa.set(numero, lista);
      }

      if (candidato.tipo === 'ALCALDE') {
        lista.alcaldes.push(candidato);
      } else if (candidato.ambito === 'URBANO') {
        lista.urbanos.push(candidato);
      } else if (candidato.ambito === 'RURAL') {
        lista.rurales.push(candidato);
      } else {
        // Nunca ocultar un candidato cuando el backend omita su ambito.
        lista.otros.push(candidato);
      }
    }

    return [...mapa.values()].sort((a, b) => {
      const an = Number(a.numero);
      const bn = Number(b.numero);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      if (Number.isFinite(an)) return -1;
      if (Number.isFinite(bn)) return 1;
      return a.numero.localeCompare(b.numero, 'es');
    });
  }

  get candidatosPendientes(): CfCandidato[] {
    return this.candidatos.filter(c =>
      !String(c.numero_lista ?? '').trim() ||
      (c.tipo === 'CONCEJAL' && c.ambito !== 'URBANO' && c.ambito !== 'RURAL')
    );
  }

  get totalAlcalde(): number {
    return this.sumar(this.candidatos.filter(c => c.tipo === 'ALCALDE'));
  }

  get totalUrbanos(): number {
    return this.sumar(this.candidatos.filter(c => c.tipo === 'CONCEJAL' && c.ambito === 'URBANO'));
  }

  get totalRurales(): number {
    return this.sumar(this.candidatos.filter(c => c.tipo === 'CONCEJAL' && c.ambito === 'RURAL'));
  }

  ngOnInit(): void {
    void this.cargar();
  }

  private actualizarVista(): void {
    if (!this.destroyRef.destroyed) this.cdr.detectChanges();
  }

  private normalizarNombre(nombre: string): string {
    return String(nombre)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizarCandidato(c: CfCandidato, eleccionId: number): CfCandidato {
    const registro = eleccionId === 1 ? CONCEJALES_CONOCIDOS[Number(c.id)] : undefined;
    const coincide = registro !== undefined &&
      this.normalizarNombre(c.nombre) === registro.nombre &&
      c.tipo === 'CONCEJAL';
    const numeroActual = String(c.numero_lista ?? '').trim();
    const numero = coincide && !LISTAS_CONOCIDAS.has(numeroActual)
      ? registro.numero
      : numeroActual;
    const ambito = c.ambito === 'URBANO' || c.ambito === 'RURAL'
      ? c.ambito
      : coincide ? registro.ambito : null;

    return { ...c, numero_lista: numero || null, ambito };
  }

  private mensajeError(error: unknown): string {
    if (error && typeof error === 'object') {
      const e = error as { name?: string; error?: { message?: string }; message?: string };
      if (e.name === 'TimeoutError') return 'La API no respondió.';
      return e.error?.message || e.message || 'No se pudo completar la operación.';
    }
    return 'Error inesperado.';
  }

  private sumar(lista: CfCandidato[]): number {
    return lista.reduce((total, c) => total + (Number(this.votos[c.id]) || 0), 0);
  }

  private limpiarVotos(): void {
    this.votos = {};
    for (const candidato of this.candidatos) this.votos[candidato.id] = 0;
  }

  private reiniciarJunta(): void {
    this.consultaVersion += 1;
    this.juntaId = null;
    this.consultando = false;
    this.consultado = false;
    this.registroExistente = false;
    this.error = '';
    this.mensaje = '';
    this.limpiarVotos();
  }

  numeroJunta(numero: number): string {
    return String(numero).padStart(2, '0');
  }

  tieneJuntas(tipo: 'F' | 'M'): boolean {
    return this.juntas.some(j =>
      Number(j.recinto_id) === this.recintoId && j.tipo === tipo
    );
  }

  seleccionarContenido(evento: FocusEvent): void {
    const control = evento.target;
    if (control instanceof HTMLInputElement) control.select();
  }

  async cargar(): Promise<void> {
    if (this.cargando) return;
    this.cargando = true;
    this.error = '';
    this.mensaje = '';
    try {
      const respuesta = await this.api.catalogos();
      if (!respuesta.ok || !respuesta.data ||
        !Array.isArray(respuesta.data.juntas) ||
        !Array.isArray(respuesta.data.candidatos)) {
        throw new Error(respuesta.message || 'Error al consultar los catálogos.');
      }

      this.juntas = respuesta.data.juntas;
      this.candidatos = respuesta.data.candidatos.map(c =>
        this.normalizarCandidato(c, Number(respuesta.data.eleccion_id))
      );
      this.limpiarVotos();
    } catch (error: unknown) {
      this.error = this.mensajeError(error);
      this.juntas = [];
      this.candidatos = [];
    } finally {
      this.cargando = false;
      this.actualizarVista();
    }
  }

  seleccionarRecinto(valor: number | null): void {
    if (this.guardando) return;
    this.recintoId = valor === null ? null : Number(valor);
    this.tipo = null;
    this.reiniciarJunta();
  }

  seleccionarTipo(tipo: 'F' | 'M'): void {
    if (this.guardando || this.recintoId === null || !this.tieneJuntas(tipo)) return;
    this.tipo = tipo;
    this.reiniciarJunta();
  }

  seleccionarJunta(id: number): void {
    if (this.guardando) return;
    this.reiniciarJunta();
    this.juntaId = Number(id);
    void this.consultarJunta();
  }

  async consultarJunta(): Promise<void> {
    if (this.juntaId === null) return;
    const juntaActual = this.juntaId;
    const version = ++this.consultaVersion;
    this.consultando = true;
    this.consultado = false;
    this.error = '';
    this.mensaje = '';
    try {
      const respuesta = await this.api.consultarRegistro(juntaActual);
      if (version !== this.consultaVersion || this.juntaId !== juntaActual) return;
      if (!respuesta.ok) throw new Error(respuesta.message || 'No se pudo consultar la junta.');
      this.limpiarVotos();
      this.registroExistente = Boolean(respuesta.data);
      if (respuesta.data) {
        for (const fila of respuesta.data.votos || []) {
          const id = Number(fila.candidato_id);
          if (Object.prototype.hasOwnProperty.call(this.votos, id)) {
            this.votos[id] = Number(fila.votos);
          }
        }
      }
      this.consultado = true;
    } catch (error: unknown) {
      if (version === this.consultaVersion) {
        this.consultado = false;
        this.error = this.mensajeError(error);
      }
    } finally {
      if (version === this.consultaVersion) {
        this.consultando = false;
        this.actualizarVista();
      }
    }
  }

  async guardar(): Promise<void> {
    if (this.guardando || this.consultando || !this.consultado) return;
    this.error = '';
    this.mensaje = '';

    if (this.juntaId === null || !this.juntaSeleccionada) {
      this.error = 'Selecciona una junta.';
      return;
    }
    if (!this.candidatos.length) {
      this.error = 'No hay candidatos cargados.';
      return;
    }
    if (this.candidatosPendientes.length) {
      this.error = 'Revisa los datos de candidatos.';
      return;
    }

    const detalle: { candidato_id: number; votos: number }[] = [];
    for (const candidato of this.candidatos) {
      const cantidad = this.votos[candidato.id];
      if (typeof cantidad !== 'number' || !Number.isSafeInteger(cantidad) || cantidad < 0) {
        this.error = `Votos inválidos: ${candidato.nombre}.`;
        return;
      }
      detalle.push({ candidato_id: Number(candidato.id), votos: cantidad });
    }

    const juntaActual = this.juntaId;
    this.guardando = true;
    try {
      const respuesta = this.registroExistente
        ? await this.api.actualizarRegistro(juntaActual, detalle)
        : await this.api.guardarRegistro(juntaActual, detalle);
      if (!respuesta.ok) throw new Error(respuesta.message || 'No se pudo guardar.');
      this.registroExistente = true;
      this.mensaje = 'Votos guardados.';
    } catch (error: unknown) {
      this.error = this.mensajeError(error);
    } finally {
      this.guardando = false;
      this.actualizarVista();
    }
  }

  async eliminar(): Promise<void> {
    if (this.juntaId === null || !this.registroExistente || this.guardando) return;
    if (!window.confirm('¿Eliminar los votos de esta junta?')) return;
    const juntaActual = this.juntaId;
    this.guardando = true;
    this.error = '';
    this.mensaje = '';
    try {
      const respuesta = await this.api.eliminarRegistro(juntaActual);
      if (!respuesta.ok) throw new Error(respuesta.message || 'No se pudo eliminar.');
      this.registroExistente = false;
      this.limpiarVotos();
      this.mensaje = 'Registro eliminado.';
    } catch (error: unknown) {
      this.error = this.mensajeError(error);
    } finally {
      this.guardando = false;
      this.actualizarVista();
    }
  }

  siguienteJunta(): void {
    if (this.guardando) return;
    this.reiniciarJunta();
  }
}
