'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import Image from 'next/image';
import type { CandidatoResultado } from '../../lib/electoral';
import { BASE_PATH } from '../../lib/electoral';
import type { DatosRecintos, JuntaEstado, RecintoEstado } from '../../lib/recintos-estado';
import { estaFinalizada, etiquetaJunta } from '../../lib/recintos-estado';
import { construirResumenActa, type TipoActa, type RegistroActa, type RespuestaRegistro } from '../../lib/revision-actas';
import type { IndiceActas } from '../../lib/indice-actas';
import './revision-actas.css';

type Props = {
  datos: DatosRecintos | null;
  candidatos: CandidatoResultado[];
  cargando: boolean;
  error: string;
  onActualizar: () => void;
};


// Consultar parámetros de URL sin setState en un efecto y sin provocar
// diferencias entre el renderizado del servidor y la hidratación.
function observarNavegacion(notificar: () => void): () => void {
  window.addEventListener('popstate', notificar);
  return () => window.removeEventListener('popstate', notificar);
}

function buscarEnNavegador(): string {
  return window.location.search;
}

function buscarEnServidor(): string {
  return '';
}

function fotoDisponible(junta: JuntaEstado, indice: IndiceActas): boolean {
  return (indice[junta.id]?.length ?? 0) > 0;
}
const rutaRegistro = (id: string) => `${BASE_PATH}/api/actas/junta/${encodeURIComponent(id)}`;
const rutaFoto = (id: string, tipo?: TipoActa) =>
  `${BASE_PATH}/api/actas/foto/${encodeURIComponent(id)}${tipo ? `?tipo=${tipo}` : ''}`;
const tiposActa: TipoActa[] = ['ALCALDE', 'CONCEJAL', 'VOCAL'];
function tiposConFoto(registro: RegistroActa | null): TipoActa[] {
  if (!registro?.dignidades) return [];
  return tiposActa.filter(tipo => registro.dignidades?.[tipo]?.foto === true);
}
async function consultaRegistro(id: string, signal?: AbortSignal): Promise<RegistroActa | null> {
  const res = await fetch(rutaRegistro(id), { cache: 'no-store', signal });
  const json = (await res.json().catch(() => null)) as RespuestaRegistro | null;
  if (!res.ok || !json?.ok) throw new Error(json?.message || `Error HTTP ${res.status}`);
  return json.data ?? null;
}

function etiquetaEstado(junta: JuntaEstado): string {
  if (estaFinalizada(junta)) return 'Finalizada';
  if (junta.estado === 'CONFIRMADO') return 'Registrada';
  if (junta.estado === 'EN_REVISION') return 'En revisión';
  return 'Pendiente';
}

function PanelDetalle({ recinto, junta, candidatos }: {
  recinto: RecintoEstado;
  junta: JuntaEstado;
  candidatos: CandidatoResultado[];
}) {
  const [registro, setRegistro] = useState<RegistroActa | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ampliar, setAmpliar] = useState(false);
  const [errorImagen, setErrorImagen] = useState(false);
  const [actualizar, setActualizar] = useState(0);
  const [tipoElegido, setTipoElegido] = useState<TipoActa | 'GENERAL' | null>(null);

  // PanelDetalle se monta con key={junta.id}; cada junta comienza
  // con su propio estado inicial. El efecto solo recibe respuestas asíncronas.
  useEffect(() => {
    const ctrl = new AbortController();

    void consultaRegistro(junta.id, ctrl.signal)
      .then(resultado => {
        if (ctrl.signal.aborted) return;
        setRegistro(resultado);
      })
      .catch(e => {
        if (!ctrl.signal.aborted) {
          setError(e instanceof Error ? e.message : 'No se pudo consultar esta junta.');
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });

    return () => ctrl.abort();
  }, [junta.id, actualizar]);

  const reintentar = () => {
    setCargando(true);
    setRegistro(null);
    setError('');
    setAmpliar(false);
    setErrorImagen(false);
    setActualizar(v => v + 1);
  };

  useEffect(() => {
    if (!ampliar) return;
    const cerrar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setAmpliar(false); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [ampliar]);

  const ambito = Number(recinto.codigo_recinto) > 0
    ? ([934, 852, 1110, 1678, 6507, 7917, 5355].includes(Number(recinto.codigo_recinto)) ? 'URBANO' : 'RURAL')
    : (['PELILEO', 'PELILEO GRANDE /R. MINO'].includes(recinto.parroquia.trim().toUpperCase()) ? 'URBANO' : 'RURAL');
  const resumenes = registro ? construirResumenActa(registro, candidatos, ambito) : [];
  const disponibles = tiposConFoto(registro);
  const tipoActivo = tipoElegido === 'GENERAL' && registro?.evidencia?.disponible === true
    ? null : tipoElegido && tipoElegido !== 'GENERAL' && disponibles.includes(tipoElegido) ? tipoElegido : disponibles[0] ?? null;
  const fotoRegistrada = tipoActivo !== null || registro?.evidencia?.disponible === true;
  const tieneFoto = fotoRegistrada && !errorImagen;
  const foto = rutaFoto(junta.id, tipoActivo ?? undefined);
  const resumenActivo = tipoActivo ? resumenes.find(r => r.tipo === tipoActivo) : null;

  return (
    <article className="ar-detalle" aria-live="polite">
      <header className="ar-detalle-cabecera">
        <div>
          <span className="ar-sobrelinea">REVISIÓN DE JUNTA</span>
          <h3>{etiquetaJunta(junta)}</h3>
          <p>{recinto.nombre}</p>
        </div>
        <span className={`ar-estado ${estaFinalizada(junta) ? 'ar-estado--finalizada' : junta.estado === 'CONFIRMADO' ? 'ar-estado--registrada' : ''}`}>
          {estaFinalizada(junta) ? '🔒 ' : ''}{etiquetaEstado(junta)}
        </span>
      </header>

      {cargando && <p className="ar-mensaje" role="status">Consultando votos y evidencia…</p>}
      {error && <div className="ar-alerta" role="alert">{error}<button type="button" onClick={reintentar}>Reintentar</button></div>}
      {!cargando && !error && !registro && <p className="ar-mensaje">Esta junta aún no tiene votos registrados ni acta asociada.</p>}
      {registro && <>
        {(disponibles.length > 0 || registro.evidencia?.disponible === true) && <div className="ar-juntas-botones" role="group" aria-label="Dignidad del acta">
          {registro.evidencia?.disponible === true && <button type="button" aria-pressed={tipoActivo === null}
            className={`ar-junta-boton ${tipoActivo === null ? 'ar-junta-boton--activo' : ''}`}
            onClick={() => { setTipoElegido('GENERAL'); setErrorImagen(false); setAmpliar(false); }}>Acta general</button>}
          {disponibles.map(tipo => <button type="button" key={tipo} aria-pressed={tipoActivo === tipo}
            className={`ar-junta-boton ${tipoActivo === tipo ? 'ar-junta-boton--activo' : ''}`}
            onClick={() => { setTipoElegido(tipo); setErrorImagen(false); setAmpliar(false); }}>
            {tipo === 'ALCALDE' ? 'Alcalde' : tipo === 'CONCEJAL' ? 'Concejales' : 'Vocales'}
            {registro.dignidades?.[tipo]?.finalizado ? ' 🔒' : ' 📷'}
          </button>)}
        </div>}
        {resumenActivo && <div className="ar-acta" aria-label="Totales de la dignidad seleccionada">
          <strong>{resumenActivo.titulo}</strong>
          <p>Válidos: {resumenActivo.validos} · Nulos: {resumenActivo.nulos} · Blancos: {resumenActivo.blancos} · Total: {resumenActivo.total}</p>
        </div>}
        <div className="ar-acta">
          <div className="ar-titulo-foto">
            <div><strong>Fotografía del acta</strong><small>Archivo original del servidor ConteoFast</small></div>
            <span className={`ar-foto-estado ${tieneFoto ? 'ar-foto-estado--ok' : ''}`}>{tieneFoto ? 'Acta disponible' : errorImagen ? 'Error de carga' : 'Sin fotografía'}</span>
          </div>
          {tieneFoto ? <>
            <button type="button" className="ar-foto-pulsable" onClick={() => setAmpliar(true)} aria-label="Ampliar la fotografía del acta">
              <Image unoptimized src={foto} width={1000} height={1300} alt={`Acta de la junta ${etiquetaJunta(junta)}, ${recinto.nombre}`}
                className="ar-foto" onError={() => setErrorImagen(true)} />
              <span>Ampliar fotografía</span>
            </button>
            <a className="ar-descarga" href={`${foto}${foto.includes('?') ? '&' : '?'}descargar=1`} download>Descargar acta</a>
          </> : <div className="ar-foto-vacia">📷 <span>{errorImagen ? 'No se pudo abrir el archivo. Comprueba la conexión y la integridad del acta.' : 'No hay una fotografía disponible para consultar.'}</span>{errorImagen && <button type="button" className="ar-actualizar" onClick={reintentar}>Reintentar</button>}</div>}
        </div>

      </>}

      {ampliar && tieneFoto && <div className="ar-modal" role="dialog" aria-modal="true" aria-label="Acta electoral ampliada">
        <button className="ar-modal-fondo" type="button" onClick={() => setAmpliar(false)} aria-label="Cerrar vista ampliada" />
        <div className="ar-modal-contenido">
          <div className="ar-modal-barra"><strong>{recinto.nombre} · {etiquetaJunta(junta)}</strong>
            <button type="button" onClick={() => setAmpliar(false)}>Cerrar ✕</button></div>
          <div className="ar-modal-imagen"><Image unoptimized src={foto} width={1200} height={1600} alt="Fotografía del acta electoral ampliada" /></div>
        </div>
      </div>}
    </article>
  );
}

export default function RevisionActas({ datos, candidatos, cargando, error, onActualizar }: Props) {
  const [buscar, setBuscar] = useState('');
  const [recintoId, setRecintoId] = useState<string | null>(null);
  const [juntaId, setJuntaId] = useState<string | null>(null);
  const [fotos, setFotos] = useState<IndiceActas>({});
  const [revisionNumero, setRevisionNumero] = useState(0);
  const [comprobando, setComprobando] = useState(true);
  const [errorIndice, setErrorIndice] = useState('');

  // Un índice de metadatos por consulta, no una petición por cada junta.
  useEffect(() => {
    const ctrl = new AbortController();
    let ocupada = false;
    async function actualizarIndice() {
      if (ocupada || ctrl.signal.aborted) return;
      ocupada = true;
      setComprobando(true);
      try {
        const respuesta = await fetch(`${BASE_PATH}/api/actas/indice`, {
          cache: 'no-store', signal: ctrl.signal,
        });
        const json = await respuesta.json();
        if (!respuesta.ok || json?.ok !== true || !json.data || typeof json.data !== 'object' || Array.isArray(json.data)) {
          throw new Error(json?.message || 'No se pudo consultar el índice de actas.');
        }
        if (!ctrl.signal.aborted) { setFotos(json.data as IndiceActas); setErrorIndice(''); }
      } catch (e) {
        if (!ctrl.signal.aborted) setErrorIndice(e instanceof Error ? e.message : 'Error consultando actas.');
      } finally {
        ocupada = false;
        if (!ctrl.signal.aborted) setComprobando(false);
      }
    }
    void Promise.resolve().then(actualizarIndice);
    const timer = window.setInterval(() => { if (!document.hidden) void actualizarIndice(); }, 15000);
    return () => { ctrl.abort(); window.clearInterval(timer); };
  }, [revisionNumero, datos?.eleccion_id]);

  const recintos = useMemo(() => datos?.recintos || [], [datos]);

  // En Resumen electoral se muestran SOLAMENTE recintos con fotografías de actas.
  // El índice se alimenta de metadatos de las actas, sin descargar imágenes.
  const recintosConFoto = useMemo(() => recintos.filter(r =>
    r.juntas.some(j => fotoDisponible(j, fotos))
  ), [recintos, fotos]);
  const visibilidad = useMemo(() => {
    const q = buscar.trim().toLocaleLowerCase('es');
    return recintosConFoto.filter(r =>
      !q || `${r.nombre} ${r.parroquia} ${r.codigo_recinto ?? ''}`.toLocaleLowerCase('es').includes(q)
    );
  }, [recintosConFoto, buscar]);

  // La URL se observa como un sistema externo mediante useSyncExternalStore.
  // El usuario puede sobrescribir esa selección pulsando un recinto o junta.
  const busquedaUrl = useSyncExternalStore(
    observarNavegacion,
    buscarEnNavegador,
    buscarEnServidor
  );
  const parametros = useMemo(() => new URLSearchParams(busquedaUrl), [busquedaUrl]);
  const recintoDeseado = recintoId ?? parametros.get('recinto');
  const juntaDeseada = juntaId ?? parametros.get('junta');

  const recintoSeleccionado = visibilidad.find(r => r.id === recintoDeseado) || visibilidad[0] || null;
  const juntasConFoto = recintoSeleccionado?.juntas.filter(j => fotoDisponible(j, fotos)) || [];
  const juntaSeleccionada = juntasConFoto.find(j => j.id === juntaDeseada) || juntasConFoto[0] || null;

  const revisarDeNuevo = () => {
    setComprobando(true);
    setRevisionNumero(v => v + 1);
    onActualizar();
  };

  return <section className="ar-modulo" id="revision-actas" aria-label="Revisión de actas electorales">
    <header className="ar-encabezado">
      <div><span className="ev-eyebrow">CONTROL DE ACTAS · SOLO LECTURA</span><h2>Revisión de actas por recinto</h2> </div>
      <button type="button" className="ar-actualizar" onClick={revisarDeNuevo} disabled={comprobando}>↻ Verificar actas</button>
    </header>
    {error && <p className="ar-alerta" role="alert">{error}</p>}
    {errorIndice && <p className="ar-alerta" role="alert">{errorIndice} Se conserva el último índice recibido, si existe.</p>}
    {!datos && cargando && <p className="ar-mensaje">Cargando recintos y juntas…</p>}
    {!datos && !cargando && !error && <p className="ar-mensaje">No hay datos de recintos disponibles.</p>}
    {datos && <>
      <div className="ar-filtros">
        <label className="ar-buscar"><span>Buscar recinto con fotografía</span><input value={buscar} type="search" onChange={(e: ChangeEvent<HTMLInputElement>) => setBuscar(e.target.value)} placeholder="Nombre, parroquia o código" /></label>
        <span className="ar-filtro-foto">📷 Solo recintos con actas</span>
      </div>
      <div className="ar-cuerpo">
        <aside className="ar-recintos" aria-label="Seleccionar recinto">
          <div className="ar-recintos-topo"><strong>Recintos electorales</strong><span>{visibilidad.length}</span></div>
          <div className="ar-recintos-lista">
            {visibilidad.map(recinto => {
              const fotosRecinto = recinto.juntas.reduce((total, j) => total + (fotos[j.id]?.length ?? 0), 0);
              const seleccionado = recintoSeleccionado?.id === recinto.id;
              return <button key={recinto.id} type="button" className={`ar-recinto-opcion ${seleccionado ? 'ar-recinto-opcion--activo' : ''}`}
                aria-pressed={seleccionado} onClick={() => { setRecintoId(recinto.id); setJuntaId(recinto.juntas.find(j => fotoDisponible(j, fotos))?.id || null); }}>
                <span className="ar-recinto-parroquia">{recinto.parroquia}</span>
                <strong>{recinto.nombre}</strong>
                <small>📷 {fotosRecinto} acta{fotosRecinto === 1 ? '' : 's'} disponible{fotosRecinto === 1 ? '' : 's'}</small>
              </button>;
            })}
            {!visibilidad.length && <p className="ar-sin-coincidencias">{comprobando ? 'Buscando recintos con actas cargadas…' : buscar ? 'No hay recintos con fotografías que coincidan con la búsqueda.' : 'Todavía no se detectaron fotografías de actas. Presiona «Verificar actas» para actualizar.'}</p>}
          </div>
        </aside>
        <div className="ar-contenido">
          {recintoSeleccionado ? <>
            <div className="ar-juntas-encabezado">
              <div><span className="ar-sobrelinea">{recintoSeleccionado.parroquia} · CÓDIGO {recintoSeleccionado.codigo_recinto ?? '—'}</span>
                <h3>{recintoSeleccionado.nombre}</h3><small>{recintoSeleccionado.direccion}</small></div>
              <strong>📷 {juntasConFoto.reduce((total, j) => total + (fotos[j.id]?.length ?? 0), 0)} actas</strong>
            </div>
            <div className="ar-juntas-botones" role="group" aria-label="Seleccionar junta para revisar">
              {juntasConFoto.map(junta => {
                return <button type="button" key={junta.id} onClick={() => setJuntaId(junta.id)}
                  aria-pressed={juntaSeleccionada?.id === junta.id}
                  className={`ar-junta-boton ${juntaSeleccionada?.id === junta.id ? 'ar-junta-boton--activo' : ''} ${estaFinalizada(junta) ? 'ar-junta-boton--cerrada' : ''}`}>
                  <strong>{String(junta.tipo).toUpperCase()}{String(junta.numero).padStart(2, '0')}</strong>
                  <small>{estaFinalizada(junta) ? '🔒' : junta.estado === 'CONFIRMADO' ? '✓' : '·'} {fotoDisponible(junta, fotos) ? '📷' : ''}</small>
                </button>;
              })}
            </div>
            {juntaSeleccionada && <PanelDetalle key={`${juntaSeleccionada.id}:${JSON.stringify(fotos[juntaSeleccionada.id])}:${revisionNumero}`} recinto={recintoSeleccionado} junta={juntaSeleccionada}
              candidatos={candidatos} />}
          </> : <p className="ar-mensaje">Selecciona un recinto para comenzar.</p>}
        </div>
      </div>
    </>}
  </section>;
}
