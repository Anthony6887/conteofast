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
    const distintos = new Map<number, RecintoOpcion>();
    for (const junta of this.juntas) {
      const id = Number(junta.recinto_id);
      if (!distintos.has(id)) {
        distintos.set(id, {
          id,
          nombre: junta.recinto,
          parroquia: junta.parroquia
        });
      }
    }
    return [...distintos.values()].sort((a, b) =>
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

  get alcaldes(): CfCandidato[] {
    return this.candidatos.filter(c => c.tipo === 'ALCALDE');
  }

  get concejales(): CfCandidato[] {
    return this.candidatos.filter(c => c.tipo === 'CONCEJAL');
  }

  get totalAlcalde(): number {
    return this.sumar(this.alcaldes);
  }

  get totalConcejales(): number {
    return this.sumar(this.concejales);
  }

  ngOnInit(): void {
    void this.cargar();
  }

  private actualizarVista(): void {
    if (!this.destroyRef.destroyed) this.cdr.detectChanges();
  }

  private mensajeError(error: unknown): string {
    if (error && typeof error === 'object') {
      const e = error as { name?: string; error?: { message?: string }; message?: string };
      if (e.name === 'TimeoutError') {
        return 'La API no respondió. Comprueba la conexión e intenta nuevamente.';
      }
      return e.error?.message || e.message || 'No se pudo completar la operación.';
    }
    return 'Ocurrió un error inesperado.';
  }

  private sumar(lista: CfCandidato[]): number {
    return lista.reduce((total, c) => total + (Number(this.votos[c.id]) || 0), 0);
  }

  private limpiarVotos(): void {
    this.votos = {};
    for (const candidato of this.candidatos) {
      this.votos[candidato.id] = 0;
    }
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
        throw new Error(respuesta.message || 'Respuesta inválida de la API.');
      }
      this.juntas = respuesta.data.juntas;
      this.candidatos = respuesta.data.candidatos;
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
      if (!respuesta.ok) throw new Error(respuesta.message || 'Error consultando la junta.');
      this.limpiarVotos();
      this.registroExistente = !!respuesta.data;
      if (respuesta.data) {
        for (const fila of respuesta.data.votos) {
          const id = Number(fila.candidato_id);
          if (Object.prototype.hasOwnProperty.call(this.votos, id)) {
            this.votos[id] = Number(fila.votos);
          }
        }
        this.mensaje = 'Registro encontrado. Puedes editar los votos o eliminarlo.';
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
      this.error = 'No hay candidatos registrados en MySQL.';
      return;
    }

    const detalle: { candidato_id: number; votos: number }[] = [];
    for (const candidato of this.candidatos) {
      const cantidad = this.votos[candidato.id];
      if (typeof cantidad !== 'number' || !Number.isSafeInteger(cantidad) || cantidad < 0) {
        this.error = `Introduce un número entero válido para ${candidato.nombre}.`;
        return;
      }
      detalle.push({ candidato_id: candidato.id, votos: cantidad });
    }

    const juntaActual = this.juntaId;
    this.guardando = true;
    try {
      const respuesta = this.registroExistente
        ? await this.api.actualizarRegistro(juntaActual, detalle)
        : await this.api.guardarRegistro(juntaActual, detalle);
      if (!respuesta.ok) throw new Error(respuesta.message || 'No se pudo guardar.');
      this.registroExistente = true;
      this.mensaje = 'Votos guardados correctamente en MySQL.';
    } catch (error: unknown) {
      this.error = this.mensajeError(error);
    } finally {
      this.guardando = false;
      this.actualizarVista();
    }
  }

  async eliminar(): Promise<void> {
    if (this.juntaId === null || !this.registroExistente || this.guardando) return;
    const confirmado = window.confirm('¿Eliminar los votos registrados de esta junta?');
    if (!confirmado) return;

    const juntaActual = this.juntaId;
    this.guardando = true;
    this.error = '';
    this.mensaje = '';
    try {
      const respuesta = await this.api.eliminarRegistro(juntaActual);
      if (!respuesta.ok) throw new Error(respuesta.message || 'No se pudo eliminar.');
      this.registroExistente = false;
      this.limpiarVotos();
      this.mensaje = 'Registro eliminado. Puedes ingresar nuevos votos.';
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
