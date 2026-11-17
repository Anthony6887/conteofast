
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ViewChild,
  inject,
} from '@angular/core';
import type { ElementRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import type { SafeUrl } from '@angular/platform-browser';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';

import { ConteofastService } from '../../core/conteofast.service';
import type {
  CfCandidato,
  CfJunta,
  CfRegistro,
  CfEspeciales,
  CfDignidad,
} from '../../core/conteofast.service';
import {
  RECINTOS_ELECTORALES,
  RECINTOS_POR_CODIGO,
  LISTAS_CONCEJALES,
  VOCALES_POR_RECINTO,
} from '../../core/recintos-electorales';
import type {
  AmbitoRecinto,
  RecintoElectoral,
} from '../../core/recintos-electorales';

type TipoJunta = 'F' | 'M';
type TipoDignidad = CfDignidad;
type DetalleVoto = { candidato_id: number; votos: number };
interface ListaAgrupada {
  numero: string;
  alcaldes: CfCandidato[];
  concejales: CfCandidato[];
  vocales: CfCandidato[];
  disponible: boolean;
}
/** Compatibilidad de antiguos catálogos que no traían el ámbito de estos concejales. */
const CONCEJALES_LEGADOS: Record<number, { nombre: string; numero: string; ambito: AmbitoRecinto }> = {
  2: { nombre: 'CECILIA SILVA', numero: '8', ambito: 'RURAL' },
  6: { nombre: 'EDISON RODRIGUEZ', numero: '8', ambito: 'URBANO' },
  7: { nombre: 'EDWIN CAIZABANDA', numero: '18', ambito: 'RURAL' },
  8: { nombre: 'DANIEL LUNA', numero: '18', ambito: 'URBANO' },
  9: { nombre: 'GRACIELA HIDALGO', numero: '62', ambito: 'RURAL' },
  10: { nombre: 'IVAN PICO', numero: '62', ambito: 'URBANO' },
  11: { nombre: 'LUIS SILVA', numero: '7', ambito: 'RURAL' },
  12: { nombre: 'PAOLA PICO', numero: '7', ambito: 'URBANO' }
};
@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [FormsModule, IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss', './registro-validacion.scss']
})
export class RegistroPage implements OnInit {
  private readonly api = inject(ConteofastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toastController = inject(ToastController);
  private toastActual: HTMLIonToastElement | null = null;
  private toastVersion = 0;
  private readonly destroyRef = inject(DestroyRef);
  private consultaVersion = 0;
  /** Anuncia por toast solo la primera transición a error de cada campo. */
  private readonly camposConErrorNotificado = new Set<string>();
  private ultimoCampoModificado: string | null = null;
  @ViewChild('camaraVideo') videoCamara?: ElementRef<HTMLVideoElement>;
  camaraActiva = false;
  camaraCargando = false;
  private camaraStream: MediaStream | null = null;
  constructor() {
    this.destroyRef.onDestroy(() => {
      this.detenerCamara();
      this.liberarFotoVista();
    });
  }
  juntas: CfJunta[] = [];
  candidatos: CfCandidato[] = [];
  codigoRecinto: number | null = null;
  tipo: TipoJunta | null = null;
  juntaId: number | null = null;
  votos: Record<number, number | null> = {};
  especiales: Record<TipoDignidad, { nulos: number | null; blancos: number | null }> = {
    ALCALDE: { nulos: 0, blancos: 0 },
    CONCEJAL: { nulos: 0, blancos: 0 },
    VOCAL: { nulos: 0, blancos: 0 }
  };
  cargando = false;
  consultando = false;
  consultado = false;
  guardando = false;
  registroExistente = false;
  registroFinalizado = false;
  cambiosSinGuardar = false;
  fechaCierre: string | null = null;
  fotoDisponible = false;
  fotoSeleccionada: File | null = null;
  fotoVista: SafeUrl | null = null;
  fotoResolucion = '';
  private fotoUrl: string | null = null;
  subiendoFoto = false;
  procesandoFoto = false;
  error = '';
  mensaje = '';
  advertenciaCatalogo = '';
  /** Sólo se muestran los códigos oficiales del Excel que tienen juntas en la API. */
  get recintos(): RecintoElectoral[] {
    const codigos = new Set(this.juntas.map(j => this.codigoDeJunta(j)).filter((n): n is number => n !== null));
    return RECINTOS_ELECTORALES.filter(r => codigos.has(r.codigo))
      .sort((a, b) => a.codigo - b.codigo);
  }
  get recinto(): RecintoElectoral | null {
    return this.codigoRecinto === null ? null : RECINTOS_POR_CODIGO.get(this.codigoRecinto) ?? null;
  }
  get ambito(): AmbitoRecinto | null {
    return this.recinto?.ambito ?? null;
  }
  get juntasRecinto(): CfJunta[] {
    return this.codigoRecinto === null ? []
      : this.juntas.filter(j => this.codigoDeJunta(j) === this.codigoRecinto);
  }
  get juntasDisponibles(): CfJunta[] {
    return this.tipo === null ? [] : this.juntasRecinto
      .filter(j => j.tipo === this.tipo)
      .sort((a, b) => Number(a.numero) - Number(b.numero));
  }
  get junta(): CfJunta | null {
    return this.juntasRecinto.find(j => Number(j.id) === this.juntaId) ?? null;
  }
  /** Se exige el padrón real de la junta: nunca usar el promedio 350 como padrón oficial. */

  get limiteJunta(): number | null {
    const junta = this.junta;

    if (!junta) return null;

    const padron = Number(junta.padron);

    // Nunca aceptar padrones vacíos, negativos o decimales.
    if (!Number.isSafeInteger(padron) || padron <= 0) {
      return null;
    }

    const fuente = (
      junta as CfJunta & { padron_fuente?: string }
    ).padron_fuente;

    // Aceptar el padrón referencial autorizado
    // explícitamente por el backend para simulaciones.
    if (fuente === 'REFERENCIAL_PRUEBAS') {
      return padron;
    }

    // Para padrones oficiales conservar la comprobación
    // contra el total de electores del recinto.
    const electores = this.recinto?.electores;

    if (
      typeof electores !== 'number' ||
      !Number.isSafeInteger(electores) ||
      electores <= 0 ||
      padron > electores
    ) {
      return null;
    }

    return padron;
  }

  get dignidadesEspeciales(): { tipo: TipoDignidad; titulo: string }[] {
    const datos: { tipo: TipoDignidad; titulo: string }[] = [
      { tipo: 'ALCALDE', titulo: 'Alcaldía' },
      { tipo: 'CONCEJAL', titulo: 'Concejalía' }
    ];
    if (this.ambito === 'RURAL') datos.push({ tipo: 'VOCAL', titulo: 'Vocales' });
    return datos;
  }
  get juntaBloqueada(): boolean { return this.registroFinalizado; }
  /** Estado individual de cada junta; nunca depende del cierre de la junta seleccionada. */
  juntaEstaBloqueada(junta: CfJunta): boolean {
    return junta.bloqueado === true || Number(junta.bloqueado) === 1;
  }
  get limiteReferencial(): boolean {
    return this.junta !== null && this.limiteJunta === null;
  }
  /** Voces de la API filtradas por el código CNE del recinto, incluidas las listas solo VOCAL. */
  get candidatosActivos(): CfCandidato[] {
    const ambito = this.ambito;
    if (!ambito || this.codigoRecinto === null) return [];
    const concejalesValidos = new Set(LISTAS_CONCEJALES[ambito]);
    const vocalesValidos = new Set(VOCALES_POR_RECINTO[this.codigoRecinto] || []);
    return this.candidatos.filter(c => {
      const tipo = String(c.tipo ?? '').trim().toUpperCase();
      const lista = this.numeroLista(c);
      const ambitoC = String(c.ambito ?? '').trim().toUpperCase();
      if (tipo === 'VOCAL') {
        return ambito === 'RURAL' && vocalesValidos.has(lista) &&
          (ambitoC === 'RURAL' || ambitoC === '');
      }
      if (!concejalesValidos.has(lista)) return false;
      if (tipo === 'ALCALDE') return true;
      if (tipo !== 'CONCEJAL') return false;
      if (ambitoC === ambito) return true;
      return ambito === 'RURAL' && !ambitoC && Number(c.id) === 29 && lista === '1' &&
        ['MANUEL PAREDES', 'LISTA 1'].includes(this.normalizarNombre(c.nombre));
    });
  }
  get vocalesFaltantes(): string[] {
    const esperados = this.codigoRecinto === null ? [] : VOCALES_POR_RECINTO[this.codigoRecinto] || [];
    if (this.ambito !== 'RURAL') return [];
    const presentes = new Set(this.vocales.map(c => this.numeroLista(c)));
    return esperados.filter(lista => !presentes.has(lista));
  }
  get alcaldes(): CfCandidato[] {
    return this.candidatosActivos.filter(c => c.tipo === 'ALCALDE');
  }
  get concejales(): CfCandidato[] {
    return this.candidatosActivos.filter(c => c.tipo === 'CONCEJAL');
  }
  get vocales(): CfCandidato[] {
    return this.candidatosActivos.filter(c => c.tipo === 'VOCAL');
  }
  get totalVocales(): number {
    return this.sumar(this.vocales);
  }
  private totalEspecial(tipo: TipoDignidad): number {
    const e = this.especiales[tipo];
    return (Number(e.nulos) || 0) + (Number(e.blancos) || 0);
  }
  private totalDignidad(tipo: TipoDignidad): number {
    const candidatos = tipo === 'ALCALDE' ? this.totalAlcaldes :
      tipo === 'CONCEJAL' ? this.totalConcejales : this.totalVocales;
    return candidatos + this.totalEspecial(tipo);
  }
  /** Errores visibles en el mismo instante de escribir, también por suma de dignidad. */
  errorVoto(c: CfCandidato): string {
    if (!this.consultado) return '';
    const cantidad = this.votos[c.id];
    const nombre = String(c.nombre ?? '').trim();
    const limite = this.limiteJunta;
    if (cantidad === null || cantidad === undefined ||
      !Number.isSafeInteger(cantidad) || cantidad < 0) {
      return `${nombre}: ingresa un número entero desde cero.`;
    }
    if (limite === null) return 'Esta junta no tiene un padrón válido.';
    if (cantidad > limite) return `${cantidad} excede el máximo de votos.`;
    const total = this.totalDignidad(c.tipo);
    if (total > limite && this.ultimoCampoModificado === `voto-${c.id}`) {
      return `${total} excede el máximo de votos.`;
    }
    return '';
  }
  errorEspecial(tipo: TipoDignidad, campo: 'nulos' | 'blancos'): string {
    if (!this.consultado) return '';
    const cantidad = this.especiales[tipo][campo];
    const limite = this.limiteJunta;
    const titulo = `${this.nombreDignidad(tipo)} · ${campo}`;
    if (cantidad === null || cantidad === undefined ||
      !Number.isSafeInteger(cantidad) || cantidad < 0) {
      return `${titulo}: introduce un número entero desde cero.`;
    }
    if (limite === null) return 'Esta junta no tiene un padrón válido.';
    if (cantidad > limite) return `${cantidad} supera máximo de votos.`;
    const total = this.totalDignidad(tipo);
    if (total > limite && this.ultimoCampoModificado === `especial-${tipo}-${campo}`) {
      return `${total} supera los votos en total.`;
    }
    return '';
  }
  private nombreDignidad(tipo: TipoDignidad): string {
    return tipo === 'ALCALDE' ? 'Alcaldía' : tipo === 'VOCAL' ? 'Vocales' : 'Concejalía';
  }
  /** Evita el toast repetitivo al escribir dígitos consecutivos. */
  private notificarErrorDeCampo(clave: string, mensaje: string): void {
    if (!mensaje) {
      this.camposConErrorNotificado.delete(clave);
      return;
    }
    if (this.camposConErrorNotificado.has(clave)) return;
    this.camposConErrorNotificado.add(clave);
    // En vacío el mensaje inline basta: no interrumpe al reemplazar el 0 inicial.
    if (mensaje.includes('introduce un número') || mensaje.includes('ingresa un número')) return;
    void this.mostrarToast(mensaje);
  }
  actualizarEspecial(tipo: TipoDignidad, campo: 'nulos' | 'blancos', valor: number | null): void {
    this.especiales[tipo][campo] = valor;
    this.ultimoCampoModificado = `especial-${tipo}-${campo}`;
    this.cambiosSinGuardar = true;
    this.mensaje = '';
    this.notificarErrorDeCampo(`especial-${tipo}-${campo}`, this.errorEspecial(tipo, campo));
  }
  avisarEspecialAlSalir(tipo: TipoDignidad): void {
    const limite = this.limiteJunta;
    if (!this.consultado || limite === null || this.guardando) return;
    if (this.totalDignidad(tipo) > limite) {
      void this.mostrarToast(`${tipo}: con nulos y blancos registra ${this.totalDignidad(tipo)}; máximo ${limite}.`);
    }
  }
  private especialesParaGuardar(): CfEspeciales {
    return {
      ALCALDE: { nulos: Number(this.especiales.ALCALDE.nulos), blancos: Number(this.especiales.ALCALDE.blancos) },
      CONCEJAL: { nulos: Number(this.especiales.CONCEJAL.nulos), blancos: Number(this.especiales.CONCEJAL.blancos) },
      VOCAL: { nulos: Number(this.especiales.VOCAL.nulos), blancos: Number(this.especiales.VOCAL.blancos) }
    };
  }
  /** Muestra solo listas que realmente tengan candidatos en la API. */
  get listas(): ListaAgrupada[] {
    if (!this.ambito) return [];
    const mapa = new Map<string, ListaAgrupada>();
    for (const candidato of this.candidatosActivos) {
      const numero = this.numeroLista(candidato);
      if (!numero) continue;
      if (!mapa.has(numero)) {
        mapa.set(numero, { numero, alcaldes: [], concejales: [], vocales: [], disponible: true });
      }
      const grupo = mapa.get(numero)!;
      if (candidato.tipo === 'ALCALDE') grupo.alcaldes.push(candidato);
      else if (candidato.tipo === 'CONCEJAL') grupo.concejales.push(candidato);
      else if (candidato.tipo === 'VOCAL') grupo.vocales.push(candidato);
    }
    return [...mapa.values()].sort((a, b) =>
      a.numero.localeCompare(b.numero, 'es', { numeric: true })
    );
  }
  get listasSinCandidato(): string[] {
    if (!this.ambito) return [];
    const presentes = new Set(this.concejales.map(c => this.numeroLista(c)));
    return [...new Set(this.alcaldes.map(c => this.numeroLista(c)))].filter(n =>
      !!n && !presentes.has(n)
    );
  }
  get totalAlcaldes(): number {
    return this.sumar(this.alcaldes);
  }
  get totalConcejales(): number {
    return this.sumar(this.concejales);
  }
  /** Validar listas y nulos/blancos sin agregar mensajes al alto de la página. */
  get erroresValidacion(): string[] {
    if (!this.consultado || !this.junta) return [];
    const errores: string[] = [];
    const limite = this.limiteJunta;
    if (limite === null) return ['Falta un padrón válido para esta junta.'];
    if (this.vocalesFaltantes.length) {
      errores.push(`Faltan listas VOCAL de esta parroquia en la API: ${this.vocalesFaltantes.join(', ')}.`);
    }
    for (const c of this.candidatosActivos) {
      const n = this.votos[c.id];
      if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
        errores.push(`Votos inválidos de ${c.nombre}. Introduce un entero desde cero.`);
      } else if (n > limite) {
        errores.push(`${c.nombre}: ${n} excede los ${limite} votos de la junta.`);
      }
    }
    for (const tipo of (this.ambito === 'RURAL'
      ? ['ALCALDE', 'CONCEJAL', 'VOCAL'] as const
      : ['ALCALDE', 'CONCEJAL'] as const)) {
      for (const campo of ['nulos', 'blancos'] as const) {
        const n = this.especiales[tipo][campo];
        if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
          errores.push(`${tipo}: ${campo} debe ser entero desde cero.`);
        }
      }
      if (this.totalDignidad(tipo) > limite) {
        errores.push(`${tipo}: candidaturas, nulos y blancos (${this.totalDignidad(tipo)}) exceden ${limite}.`);
      }
      if (this.recinto && this.totalDignidad(tipo) > this.recinto.electores) {
        errores.push(`${tipo}: el total excede ${this.recinto.electores} electores del recinto.`);
      }
    }
    return errores;
  }
  get puedeGuardar(): boolean {
    return this.consultado && !this.guardando && !this.consultando && !this.registroFinalizado &&
      !!this.junta && this.alcaldes.length > 0 && this.concejales.length > 0 &&
      this.erroresValidacion.length === 0;
  }
  ngOnInit(): void {
    void this.cargar();
  }
  /** Notifica una sola vez: los mensajes no ocupan espacio dentro del formulario. */
  private async mostrarToast(
    texto: string,
    color: 'danger' | 'success' | 'warning' = 'danger'
  ): Promise<void> {
    if (!texto || this.destroyRef.destroyed) return;
    const version = ++this.toastVersion;
    const anterior = this.toastActual;
    this.toastActual = null;
    if (anterior) await anterior.dismiss().catch(() => undefined);
    if (version !== this.toastVersion || this.destroyRef.destroyed) return;
    const toast = await this.toastController.create({
      message: texto,
      color,
      duration: 3500,
      position: 'top',
      buttons: [{ text: 'Cerrar', role: 'cancel' }]
    });
    if (version !== this.toastVersion || this.destroyRef.destroyed) {
      await toast.dismiss().catch(() => undefined);
      return;
    }
    this.toastActual = toast;
    await toast.present();
    void toast.onDidDismiss().then(() => {
      if (this.toastActual === toast) this.toastActual = null;
    });
  }
  /** Avisar solo al salir de un campo inválido, no por cada tecla pulsada. */
  avisarVotoAlSalir(id: number): void {
    if (!this.consultado || this.guardando) return;
    const candidato = this.candidatosActivos.find(c => Number(c.id) === Number(id));
    if (!candidato) return;
    const cantidad = this.votos[id];
    const limite = this.limiteJunta;
    const nombre = String(candidato.nombre ?? '').trim();
    if (typeof cantidad !== 'number' || !Number.isSafeInteger(cantidad) || cantidad < 0) {
      void this.mostrarToast(`${nombre}: ingresa votos enteros desde cero.`);
      return;
    }
    if (limite !== null && cantidad > limite) {
      void this.mostrarToast(`${nombre}: ${cantidad} votos. Máximo por junta: ${limite}.`);
      return;
    }
    if (limite !== null) {
      const total = candidato.tipo === 'ALCALDE'
        ? this.totalAlcaldes
        : candidato.tipo === 'VOCAL' ? this.totalVocales : this.totalConcejales;
      if (total + this.totalEspecial(candidato.tipo) > limite) {
        const dignidad = candidato.tipo === 'ALCALDE'
          ? 'Alcaldía' : candidato.tipo === 'VOCAL' ? 'Vocales' : 'Concejalía';
        void this.mostrarToast(`${dignidad}: ${total + this.totalEspecial(candidato.tipo)} incluyendo nulos y blancos. Máximo: ${limite}.`);
      }
    }
  }
  /** Identificador oficial; nunca se clasifica por nombre ni por parroquia. */
  private codigoDeJunta(j: CfJunta): number | null {
    // Si la API trae un código explícito, jamás sustituirlo por un ID interno.
    const oficiales = [j.codigo_recinto, j.recinto_codigo, j.cod_recinto]
      .filter(c => c !== null && c !== undefined && String(c).trim() !== '');
    // No aceptar recinto_id: es un ID interno que puede coincidir accidentalmente.
    const codigo = oficiales.length ? Number(oficiales[0]) : NaN;
    return Number.isSafeInteger(codigo) && RECINTOS_POR_CODIGO.has(codigo)
      ? codigo : null;
  }
  private normalizarNombre(valor: string): string {
    return String(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  }
  private normalizarCandidato(c: CfCandidato, eleccionId: number): CfCandidato {
    const previo = eleccionId === 1 ? CONCEJALES_LEGADOS[Number(c.id)] : undefined;
    const coincide = !!previo && c.tipo === 'CONCEJAL' &&
      this.normalizarNombre(c.nombre) === previo.nombre;
    const ambito = c.ambito === 'URBANO' || c.ambito === 'RURAL'
      ? c.ambito : coincide ? previo!.ambito : null;
    const numeroActual = String(c.numero_lista ?? '').trim();
    const numero_lista = numeroActual || (coincide ? previo!.numero : null);
    return { ...c, ambito, numero_lista };
  }
  private numeroLista(c: CfCandidato): string {
    return String(c.numero_lista ?? '').trim().replace(/\s*[–—/]\s*/g, '-').replace(/\s+/g, '');
  }
  private actualizarVista(): void {
    if (!this.destroyRef.destroyed) this.cdr.detectChanges();
  }
  private descripcionError(error: unknown): string {
    if (error && typeof error === 'object') {
      const e = error as { error?: { message?: string }; message?: string };
      if (typeof e.error?.message === 'string' && e.error.message) return e.error.message;
      if (typeof e.message === 'string' && e.message) return e.message;
    }
    return 'Error inesperado al registrar votos.';
  }
  private sumar(candidatos: CfCandidato[]): number {
    return candidatos.reduce((s, c) => s + (Number(this.votos[c.id]) || 0), 0);
  }
  private liberarFotoVista(): void {
    if (this.fotoUrl) URL.revokeObjectURL(this.fotoUrl);
    this.fotoUrl = null;
    this.fotoVista = null;
  }
  private limpiarFoto(): void {
    this.detenerCamara();
    this.liberarFotoVista();
    this.fotoDisponible = false;
    this.fotoSeleccionada = null;
    this.fotoResolucion = '';
    this.procesandoFoto = false;
    this.subiendoFoto = false;
  }
  private async cargarFotoGuardada(id: number): Promise<void> {
    const resFoto = await this.api.obtenerFoto(id);
    if (this.juntaId !== id) return;
    this.liberarFotoVista();
    this.fotoUrl = URL.createObjectURL(resFoto);
    this.fotoVista = this.sanitizer.bypassSecurityTrustUrl(this.fotoUrl);
  }
  /** Descarga la evidencia almacenada; funciona incluso si la junta ya se cerró. */
  async descargarActa(): Promise<void> {
    const id = this.juntaId;
    if (!id || !this.fotoDisponible) {
      await this.mostrarToast('Esta junta todavía no tiene una fotografía guardada.', 'warning');
      return;
    }
    try {
      const archivo = await this.api.descargarFoto(id);
      const esJpeg = archivo.type === 'image/jpeg';
      if (archivo.type && archivo.type !== 'image/png' && !esJpeg) {
        throw new Error('El servidor no devolvió una fotografía PNG válida.');
      }
      const tipo = this.tipo || 'J';
      const nro = this.junta?.numero ?? 0;
      const codigo = this.codigoRecinto ?? 'recinto';
      const nombre = `acta_${codigo}_${tipo}${this.numeroJunta(Number(nro))}.${esJpeg ? 'jpg' : 'png'}`;
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      enlace.style.display = 'none';
      document.body.appendChild(enlace);
      try { enlace.click(); }
      finally {
        enlace.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (e: unknown) {
      await this.mostrarToast(`No se pudo descargar el acta: ${this.descripcionError(e)}`);
    }
  }
  /** Abre únicamente la cámara. No permite elegir archivos de la galería. */
  async abrirCamara(): Promise<void> {
    if (this.guardando || this.registroFinalizado || this.consultando || this.camaraCargando) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      await this.mostrarToast('La cámara requiere HTTPS o localhost y permiso del dispositivo.');
      return;
    }
    const juntaInicial = this.juntaId;
    this.camaraCargando = true;
    try {
      this.detenerCamara();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      if (this.destroyRef.destroyed || this.registroFinalizado || this.juntaId !== juntaInicial) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.camaraStream = stream;
      this.camaraActiva = true;
      this.actualizarVista();
      const video = this.videoCamara?.nativeElement;
      if (!video) throw new Error('No se pudo activar la vista de la cámara.');
      video.srcObject = stream;
      await video.play();
    } catch (e: unknown) {
      this.detenerCamara();
      await this.mostrarToast(`No se pudo abrir la cámara: ${this.descripcionError(e)}`);
    } finally {
      this.camaraCargando = false;
      this.actualizarVista();
    }
  }
  cerrarCamara(): void { this.detenerCamara(); }
  private detenerCamara(): void {
    const stream = this.camaraStream;
    this.camaraStream = null;
    stream?.getTracks().forEach(track => track.stop());
    const video = this.videoCamara?.nativeElement;
    if (video) video.srcObject = null;
    this.camaraActiva = false;
  }
  /** Captura PNG en memoria para vista previa; NO llama a subirFoto ni a ninguna API. */
  async capturarFotografia(): Promise<void> {
    const video = this.videoCamara?.nativeElement;
    if (!video || !this.camaraActiva || video.videoWidth < 1 || video.videoHeight < 1) {
      await this.mostrarToast('La cámara todavía no muestra una imagen válida.');
      return;
    }
    this.procesandoFoto = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const contexto = canvas.getContext('2d', { alpha: false });
      if (!contexto) throw new Error('No se pudo preparar la fotografía.');
      contexto.drawImage(video, 0, 0);
      const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      canvas.width = 0;
      canvas.height = 0;
      if (!png || png.size < 512) throw new Error('La fotografía resultó vacía.');
      const archivo = new File([png], 'acta-local.png', { type: 'image/png' });
      this.liberarFotoVista();
      this.fotoSeleccionada = archivo;
      this.fotoResolucion = `${video.videoWidth} × ${video.videoHeight} píxeles`;
      this.fotoUrl = URL.createObjectURL(archivo);
      this.fotoVista = this.sanitizer.bypassSecurityTrustUrl(this.fotoUrl);
      this.detenerCamara();
      await this.mostrarToast('Fotografía capturada: vista previa local, no enviada al servidor.', 'success');
    } catch (e: unknown) {
      await this.mostrarToast(this.descripcionError(e));
    } finally {
      this.procesandoFoto = false;
      this.actualizarVista();
    }
  }
  /** Descarga la captura local por decisión del usuario, sin enviar datos por la red. */
  descargarFotoLocal(): void {
    if (!this.fotoSeleccionada) return;
    const url = URL.createObjectURL(this.fotoSeleccionada);
    const enlace = document.createElement('a');
    const numero = this.junta?.numero ?? 0;
    enlace.href = url;
    enlace.download = `acta_local_${this.codigoRecinto ?? 'recinto'}_${this.tipo ?? 'J'}${this.numeroJunta(Number(numero))}.png`;
    enlace.style.display = 'none';
    document.body.appendChild(enlace);
    try { enlace.click(); }
    finally {
      enlace.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }
  async finalizarJunta(): Promise<void> {
    if (!this.juntaId || this.guardando || this.registroFinalizado) return;
    if (this.cambiosSinGuardar) {
      await this.mostrarToast('Hay cambios sin guardar. Guarda los votos antes de finalizar.');
      return;
    }
    if (!this.registroExistente || !this.fotoDisponible || this.fotoSeleccionada) {
      await this.mostrarToast('Para finalizar, el servidor exige una foto guardada. La captura de esta pantalla es solo local y no se sube.');
      return;
    }
    if (this.erroresValidacion.length) {
      await this.mostrarToast(this.erroresValidacion[0]);
      return;
    }
    if (!window.confirm('¿Finalizar esta junta? Una vez cerrada, nadie podrá editar sus votos, nulos, blancos ni fotografía.')) return;
    const id = this.juntaId;
    this.guardando = true;
    try {
      const res = await this.api.finalizarJunta(id);
      if (!res.ok) throw new Error(res.message || 'No se pudo finalizar la junta.');
      if (this.juntaId !== id) return;
      this.registroFinalizado = true;
      const juntaCerrada = this.juntas.find(j => Number(j.id) === id);
      if (juntaCerrada) juntaCerrada.bloqueado = true;
      await this.mostrarToast('Junta finalizada. Registro bloqueado.', 'success');
      await this.consultarJunta();
    } catch (e: unknown) {
      await this.mostrarToast(this.descripcionError(e));
    } finally {
      this.guardando = false;
      this.actualizarVista();
    }
  }
  private limpiarVotos(): void {
    this.votos = Object.fromEntries(this.candidatos.map(c => [Number(c.id), 0]));
    this.especiales = {
      ALCALDE: { nulos: 0, blancos: 0 },
      CONCEJAL: { nulos: 0, blancos: 0 },
      VOCAL: { nulos: 0, blancos: 0 }
    };
  }
  private reiniciarJunta(): void {
    this.camposConErrorNotificado.clear();
    this.ultimoCampoModificado = null;
    this.consultaVersion += 1;
    this.juntaId = null;
    this.consultado = false;
    this.consultando = false;
    this.registroExistente = false;
    this.registroFinalizado = false;
    this.cambiosSinGuardar = false;
    this.fechaCierre = null;
    this.limpiarFoto();
    this.error = '';
    this.mensaje = '';
    this.limpiarVotos();
  }
  numeroJunta(numero: number): string {
    return String(numero).padStart(2, '0');
  }
  tieneJuntas(tipo: TipoJunta): boolean {
    return this.juntasRecinto.some(j => j.tipo === tipo);
  }
  /** Enter avanza al siguiente campo de votos sin guardar ni seleccionar listas. */
  irAlSiguienteVoto(evento: Event): void {
    evento.preventDefault();
    const actual = evento.target;
    if (!(actual instanceof HTMLInputElement)) return;
    // No avanzar desde un voto inválido: el mensaje aparece junto al campo.
    if (actual.classList.contains('voto-input--invalido')) return;
    const entradas = Array.from(document.querySelectorAll<HTMLInputElement>(
      '.contenedor-listas input.voto-input:not(:disabled)'
    ));
    const indice = entradas.indexOf(actual);
    if (indice >= 0 && indice < entradas.length - 1) {
      entradas[indice + 1].focus();
      entradas[indice + 1].select();
    } else if (indice === entradas.length - 1) {
      document.querySelector<HTMLButtonElement>('.btn-guardar:not(:disabled)')?.focus();
    }
  }
  seleccionarContenido(evento: Event): void {
    const el = evento.target;
    if (el instanceof HTMLInputElement) el.select();
  }
  actualizarVoto(id: number, valor: number | null): void {
    this.votos[id] = valor;
    this.ultimoCampoModificado = `voto-${id}`;
    this.cambiosSinGuardar = true;
    this.mensaje = '';
    const candidato = this.candidatosActivos.find(c => Number(c.id) === Number(id));
    if (candidato) this.notificarErrorDeCampo(`voto-${id}`, this.errorVoto(candidato));
  }
  async cargar(): Promise<void> {
    if (this.cargando || this.guardando) return;
    this.cargando = true;
    this.error = '';
    this.mensaje = '';
    try {
      const res = await this.api.catalogos();
      if (!res.ok || !res.data || !Array.isArray(res.data.juntas) || !Array.isArray(res.data.candidatos)) {
        throw new Error(res.message || 'No se pudo leer los catálogos electorales.');
      }
      this.juntas = res.data.juntas;
      this.candidatos = res.data.candidatos.map(c => {
        const normalizado = this.normalizarCandidato(c, Number(res.data.eleccion_id));
        return { ...normalizado, nombre: String(normalizado.nombre ?? '').replace(/\s+/g, ' ').trim() };
      });
      this.codigoRecinto = null;
      this.tipo = null;
      this.reiniciarJunta();
      if (!this.recintos.length) {
        throw new Error('La API no entrega códigos oficiales de recinto. Agrega codigo_recinto a /catalogos (por ejemplo 934, 2872). No se puede identificar la junta por su nombre.');
      }
      this.advertenciaCatalogo = this.juntas.some(j => this.codigoDeJunta(j) === null)
        ? 'Algunas juntas de la API no tienen código CNE reconocible y no se muestran.' : '';
    } catch (e: unknown) {
      this.error = this.descripcionError(e);
      await this.mostrarToast(this.error);
    } finally {
      this.cargando = false;
      this.actualizarVista();
    }
  }
  seleccionarRecinto(valor: number | null): void {
    if (this.guardando) return;
    const codigo = valor === null ? null : Number(valor);
    this.codigoRecinto = codigo !== null && RECINTOS_POR_CODIGO.has(codigo) ? codigo : null;
    this.tipo = null;
    this.reiniciarJunta();
  }
  seleccionarTipo(tipo: TipoJunta): void {
    if (this.guardando || !this.recinto || !this.tieneJuntas(tipo)) return;
    this.tipo = tipo;
    this.reiniciarJunta();
  }
  seleccionarJunta(id: number): void {
    if (this.guardando || !this.juntasDisponibles.some(j => j.id === Number(id))) return;
    this.reiniciarJunta();
    this.juntaId = Number(id);
    void this.consultarJunta();
  }
  async consultarJunta(): Promise<void> {
    if (!this.junta) return;
    const id = this.junta.id;
    const version = ++this.consultaVersion;
    this.consultando = true;
    this.consultado = false;
    this.error = '';
    this.mensaje = '';
    try {
      const res = await this.api.consultarRegistro(id);
      if (version !== this.consultaVersion || id !== this.juntaId) return;
      if (!res.ok) throw new Error(res.message || 'No se pudo consultar el registro.');
      this.limpiarVotos();
      this.registroExistente = !!res.data;
      this.registroFinalizado = res.data?.bloqueado === true || res.data?.estado === 'FINALIZADO';
      if (this.registroFinalizado) {
        const cerrada = this.juntas.find(j => Number(j.id) === id);
        if (cerrada) cerrada.bloqueado = true;
      }
      this.fechaCierre = res.data?.fecha_cierre || null;
      this.limpiarFoto();
      this.fotoDisponible = res.data?.evidencia?.disponible === true;
      for (const tipo of ['ALCALDE', 'CONCEJAL', 'VOCAL'] as const) {
        this.especiales[tipo] = {
          nulos: Number(res.data?.especiales?.[tipo]?.nulos ?? 0),
          blancos: Number(res.data?.especiales?.[tipo]?.blancos ?? 0)
        };
      }
      for (const fila of res.data?.votos ?? []) {
        const candidatoId = Number(fila.candidato_id);
        if (Object.prototype.hasOwnProperty.call(this.votos, candidatoId)) {
          this.votos[candidatoId] = Number(fila.votos);
        }
      }
      this.consultado = true;
      this.cambiosSinGuardar = false;
      if (this.fotoDisponible) {
        try { await this.cargarFotoGuardada(id); } catch { /* metadatos siguen disponibles */ }
      }
    } catch (e: unknown) {
      if (version === this.consultaVersion) {
        this.error = this.descripcionError(e);
        await this.mostrarToast(this.error);
      }
    } finally {
      if (version === this.consultaVersion) {
        this.consultando = false;
        this.actualizarVista();
      }
    }
  }
  /** Verifica la suma por dignidad entre TODAS las juntas del mismo código de recinto. */
  private async validarTotalRecinto(detalle: DetalleVoto[], juntaActual: number): Promise<void> {
    if (!this.recinto || !this.ambito) throw new Error('Código de recinto inválido.');
    const electores = this.recinto.electores;
    const acumulado: Record<TipoDignidad, number> = { ALCALDE: 0, CONCEJAL: 0, VOCAL: 0 };
    const porId = new Map(this.candidatos.map(c => [Number(c.id), c]));
    for (const tipo of ['ALCALDE', 'CONCEJAL', 'VOCAL'] as const) {
      acumulado[tipo] += this.totalEspecial(tipo);
    }
    for (const voto of detalle) {
      const c = porId.get(voto.candidato_id);
      if (!c) throw new Error(`Candidato ${voto.candidato_id} no encontrado en el catálogo.`);
      if (!['ALCALDE', 'CONCEJAL', 'VOCAL'].includes(c.tipo)) {
        throw new Error(`Dignidad desconocida: ${c.tipo}.`);
      }
      acumulado[c.tipo] += voto.votos;
    }
    const otras = this.juntasRecinto.filter(j => Number(j.id) !== juntaActual);
    // Consultar en lotes para no saturar la API de ConteoFast.
    for (let i = 0; i < otras.length; i += 4) {
      const lote = otras.slice(i, i + 4);
      const registros = await Promise.all(lote.map(async j => {
        const res = await this.api.consultarRegistro(Number(j.id));
        if (!res.ok) throw new Error(`No se pudo verificar la junta ${j.tipo}-${j.numero}.`);
        return { junta: j, registro: res.data };
      }));
      for (const { junta, registro } of registros) {
        if (!registro) continue;
        this.acumularRegistro(registro, junta, porId, acumulado);
      }
    }
    if (acumulado.ALCALDE > electores) {
      throw new Error(`Recinto ${this.recinto.codigo}: ${acumulado.ALCALDE} votos de Alcaldía exceden los ${electores} electores registrados.`);
    }
    if (acumulado.CONCEJAL > electores) {
      throw new Error(`Recinto ${this.recinto.codigo}: ${acumulado.CONCEJAL} votos de Concejalía exceden los ${electores} electores registrados.`);
    }
    if (acumulado.VOCAL > electores) {
      throw new Error(`Recinto ${this.recinto.codigo}: ${acumulado.VOCAL} votos de Vocales exceden los ${electores} electores registrados.`);
    }
  }
  private acumularRegistro(
    registro: CfRegistro, junta: CfJunta, catalogo: Map<number, CfCandidato>,
    acumulado: Record<TipoDignidad, number>
  ): void {
    for (const fila of registro.votos ?? []) {
      const n = Number(fila.votos);
      if (!Number.isSafeInteger(n) || n < 0) {
        throw new Error(`La junta ${junta.tipo}-${junta.numero} contiene votos inválidos.`);
      }
      if (n === 0) continue;
      const candidato = catalogo.get(Number(fila.candidato_id));
      const dignidad = candidato?.tipo ?? fila.tipo;
      if (dignidad !== 'ALCALDE' && dignidad !== 'CONCEJAL' && dignidad !== 'VOCAL') {
        throw new Error(`No se reconoce la dignidad de un voto en ${junta.tipo}-${junta.numero}.`);
      }
      if (dignidad === 'CONCEJAL' && candidato?.ambito && candidato.ambito !== this.ambito) {
        throw new Error(`La junta ${junta.tipo}-${junta.numero} contiene votos de concejales de otro ámbito.`);
      }
      if (dignidad === 'VOCAL' && this.ambito !== 'RURAL') {
        throw new Error(`La junta ${junta.tipo}-${junta.numero} contiene votos de Vocales en ámbito urbano.`);
      }
      acumulado[dignidad] += n;
    }
    for (const tipo of ['ALCALDE', 'CONCEJAL', 'VOCAL'] as const) {
      acumulado[tipo] += Number(registro.especiales?.[tipo]?.nulos || 0) +
        Number(registro.especiales?.[tipo]?.blancos || 0);
    }
  }
  /** Guarda exclusivamente los votos y especiales; jamás carga fotografías. */
  async guardar(): Promise<void> {
    if (this.guardando || this.consultando || this.procesandoFoto || !this.consultado) return;
    if (this.registroFinalizado) {
      await this.mostrarToast('Junta finalizada. No es posible modificar los votos ni la fotografía.');
      return;
    }
    this.error = '';
    this.mensaje = '';
    if (!this.junta || !this.recinto) {
      await this.mostrarToast('Selecciona un recinto y una junta válidos.');
      return;
    }
    if (!this.alcaldes.length || !this.concejales.length) {
      await this.mostrarToast('No hay candidatos de Alcaldía o Concejalía para este ámbito.');
      return;
    }
    const errores = this.erroresValidacion;
    if (errores.length) {
      await this.mostrarToast(errores[0] + (errores.length > 1 ? ` (+${errores.length - 1} advertencias)` : ''));
      return;
    }
    const detalle: DetalleVoto[] = this.candidatosActivos.map(c => ({
      candidato_id: Number(c.id), votos: Number(this.votos[c.id])
    }));
    const juntaId = Number(this.junta.id);
    this.guardando = true;
    try {
      await this.validarTotalRecinto(detalle, juntaId);
      const especiales = this.especialesParaGuardar();
      const res = this.registroExistente
        ? await this.api.actualizarRegistro(juntaId, detalle, especiales)
        : await this.api.guardarRegistro(juntaId, detalle, especiales);
      if (!res.ok) throw new Error(res.message || 'No se pudieron guardar los votos.');
      this.registroExistente = true;
      this.cambiosSinGuardar = false;
      this.mensaje = this.fotoSeleccionada
        ? 'Votos guardados. La fotografía sigue solo en este equipo y no fue enviada.'
        : 'Votos guardados correctamente. No se envió ninguna fotografía.';
      await this.mostrarToast(this.mensaje, 'success');
    } catch (e: unknown) {
      this.error = this.descripcionError(e);
      await this.mostrarToast(this.error);
    } finally {
      this.guardando = false;
      this.subiendoFoto = false;
      this.actualizarVista();
    }
  }
  async eliminar(): Promise<void> {
    if (!this.junta || !this.registroExistente || this.guardando) return;
    if (this.registroFinalizado) {
      await this.mostrarToast('Junta finalizada: no se puede eliminar.');
      return;
    }
    if (!window.confirm('¿Eliminar los votos de esta junta?')) return;
    const id = this.junta.id;
    this.guardando = true;
    this.error = '';
    this.mensaje = '';
    try {
      const res = await this.api.eliminarRegistro(id);
      if (!res.ok) throw new Error(res.message || 'No se pudo eliminar.');
      this.registroExistente = false;
      this.cambiosSinGuardar = false;
      this.limpiarFoto();
      this.limpiarVotos();
      this.mensaje = 'Se eliminó el registro de votos.';
      await this.mostrarToast(this.mensaje, 'success');
    } catch (e: unknown) {
      this.error = this.descripcionError(e);
      await this.mostrarToast(this.error);
    } finally {
      this.guardando = false;
      this.actualizarVista();
    }
  }
  siguienteJunta(): void {
    if (!this.guardando) this.reiniciarJunta();
  }
}
