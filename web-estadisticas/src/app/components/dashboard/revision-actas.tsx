'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import Image from 'next/image';
import type { CandidatoResultado } from '../../lib/electoral';
import { BASE_PATH, numero } from '../../lib/electoral';
import type { DatosRecintos, JuntaEstado, RecintoEstado } from '../../lib/recintos-estado';
import { estaFinalizada, etiquetaJunta } from '../../lib/recintos-estado';
import { construirResumenActa, type TipoActa, type RegistroActa, type RespuestaRegistro } from '../../lib/revision-actas';
import './revision-actas.css';

type Props = {
  datos: DatosRecintos | null;
  candidatos: CandidatoResultado[];
  cargando: boolean;
  error: string;
  onActualizar: () => void;
};

type EstadoFoto = 'disponible' | 'sin-foto' | 'desconocido';

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

/** Nunca mostrar una junta sin fotografía confirmada en la revisión. */
function fotoDisponible(junta: JuntaEstado, indice: Record<string, EstadoFoto>): boolean {
  const estado = indice[junta.id];
  return estado === 'disponible' || (estado !== 'sin-foto' && junta.tiene_foto === true);
}
const rutaRegistro = (id: string) => `${BASE_PATH}/api/actas/junta/${encodeURIComponent(id)}`;
const rutaFoto = (id: string, tipo?: TipoActa) =>
  `${BASE_PATH}/api/actas/foto/${encodeURIComponent(id)}${tipo ? `?tipo=${tipo}` : ''}`;
const tiposActa: TipoActa[] = ['ALCALDE', 'CONCEJAL', 'VOCAL'];
function tiposConFoto(registro: RegistroActa | null): TipoActa[] {
  if (!registro?.dignidades) return [];
  return tiposActa.filter(tipo => registro.dignidades?.[tipo]?.foto === true);
}
function existeFoto(registro: RegistroActa | null): boolean {
  return tiposConFoto(registro).length > 0 || registro?.evidencia?.disponible === true;
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

function PanelDetalle({ recinto, junta, candidatos, onFoto }: {
  recinto: RecintoEstado;
  junta: JuntaEstado;
  candidatos: CandidatoResultado[];
  onFoto: (juntaId: string, disponible: EstadoFoto) => void;
}) {
  const [registro, setRegistro] = useState<RegistroActa | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ampliar, setAmpliar] = useState(false);
  const [errorImagen, setErrorImagen] = useState(false);
  const [actualizar, setActualizar] = useState(0);
  const [tipoElegido, setTipoElegido] = useState<TipoActa | null>(null);

  // PanelDetalle se monta con key={junta.id}; cada junta comienza
  // con su propio estado inicial. El efecto solo recibe respuestas asíncronas.
  useEffect(() => {
    const ctrl = new AbortController();

    void consultaRegistro(junta.id, ctrl.signal)
      .then(resultado => {
        if (ctrl.signal.aborted) return;
        setRegistro(resultado);
        onFoto(junta.id, existeFoto(resultado) ? 'disponible' : 'sin-foto');
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
  }, [junta.id, actualizar, onFoto]);

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
  const tipoActivo = tipoElegido && disponibles.includes(tipoElegido) ? tipoElegido : disponibles[0] ?? null;
  const tieneFoto = (tipoActivo !== null || registro?.evidencia?.disponible === true) && !errorImagen;
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
        {disponibles.length > 0 && <div className="ar-juntas-botones" role="group" aria-label="Dignidad del acta">
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
            <div><strong>Fotografía del acta</strong><small>Consulta del archivo original almacenado en ConteoFast</small></div>
            <span className={`ar-foto-estado ${tieneFoto ? 'ar-foto-estado--ok' : ''}`}>{tieneFoto ? 'PNG cargado' : 'Sin fotografía'}</span>
          </div>
          {tieneFoto ? <>
            <button type="button" className="ar-foto-pulsable" onClick={() => setAmpliar(true)} aria-label="Ampliar la fotografía del acta">
              <Image unoptimized src={foto} width={1000} height={1300} alt={`Acta de la junta ${etiquetaJunta(junta)}, ${recinto.nombre}`}
                className="ar-foto" onError={() => setErrorImagen(true)} />
              <span>Ampliar fotografía</span>
            </button>
            <a className="ar-descarga" href={`${foto}${foto.includes('?') ? '&' : '?'}descargar=1`} download={`acta_junta_${junta.id}${tipoActivo ? `_${tipoActivo}` : ''}.png`}>Descargar acta</a>
          </> : <div className="ar-foto-vacia">📷 <span>No hay una fotografía disponible para consultar.</span></div>}
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
  const [fotos, setFotos] = useState<Record<string, EstadoFoto>>({});
  const [revisionNumero, setRevisionNumero] = useState(0);
  const [comprobando, setComprobando] = useState(false);
  const [comprobados, setComprobados] = useState(0);
  const fotosRef = useRef(fotos);
  const onFoto = useCallback((id: string, disponible: EstadoFoto) => {
    fotosRef.current = { ...fotosRef.current, [id]: disponible };
    setFotos(prev => prev[id] === disponible ? prev : { ...prev, [id]: disponible });
  }, []);

  // Incluir todas las juntas: el estado legado puede figurar PENDIENTE
  // aunque una dignidad haya sido guardada mediante la API nueva.
  const juntasConRegistro = useMemo(() => (datos?.recintos || [])
    .flatMap(r => r.juntas).map(j => j.id).sort(), [datos]);
  const idsRevision = juntasConRegistro.join('|');

  // Índice ligero de fotografías: solo consulta el JSON de cada junta, nunca el PNG.
  // Se controla la concurrencia y se reconsulta únicamente al solicitar actualización.
  useEffect(() => {
    const ctrl = new AbortController();

    // El inicio del proceso se notifica en una microtarea, nunca
    // mediante setState síncrono en el cuerpo del efecto.
    void Promise.resolve().then(async () => {
      if (ctrl.signal.aborted) return;

      const ids = idsRevision ? idsRevision.split('|') : [];
      const pendientes = ids.filter(id => !fotosRef.current[id]);
      const yaRevisados = ids.length - pendientes.length;

      setComprobados(yaRevisados);
      setComprobando(pendientes.length > 0);
      if (!pendientes.length) return;

      let siguiente = 0;
      let completados = 0;
      const trabajar = async () => {
        while (!ctrl.signal.aborted && siguiente < pendientes.length) {
          const id = pendientes[siguiente++];
          try {
            const resultado = await consultaRegistro(id, ctrl.signal);
            if (!ctrl.signal.aborted) {
              onFoto(id, existeFoto(resultado) ? 'disponible' : 'sin-foto');
            }
          } catch {
            // Un fallo de red no significa que la junta carezca de fotografía.
          }
          if (ctrl.signal.aborted) break;
          completados++;
          setComprobados(yaRevisados + completados);
        }
      };

      try {
        await Promise.all(
          Array.from({ length: Math.min(4, pendientes.length) }, () => trabajar())
        );
      } finally {
        if (!ctrl.signal.aborted) setComprobando(false);
      }
    });

    return () => ctrl.abort();
  }, [idsRevision, revisionNumero, onFoto]);

  const recintos = useMemo(() => datos?.recintos || [], [datos]);

  // En Resumen electoral se muestran SOLAMENTE recintos con fotografías de actas.
  // El índice se alimenta de los metadatos de registro, no de descargar todos los PNG.
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

  const totalFotos = recintos.reduce((suma, r) => suma + r.juntas.filter(j => fotoDisponible(j, fotos)).length, 0);
  const totalFinalizadasConFoto = recintos.reduce((suma, r) => suma + r.juntas.filter(j =>
    fotoDisponible(j, fotos) && estaFinalizada(j)
  ).length, 0);
  const totalConocido = juntasConRegistro.filter(id => fotos[id] && fotos[id] !== 'desconocido').length;
  const revisarDeNuevo = () => {
    fotosRef.current = {};
    setFotos({});
    setComprobados(0);
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
              const fotosRecinto = recinto.juntas.filter(j => fotoDisponible(j, fotos)).length;
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
              <strong>📷 {juntasConFoto.length} acta{juntasConFoto.length === 1 ? '' : 's'}</strong>
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
            {juntaSeleccionada && <PanelDetalle key={juntaSeleccionada.id} recinto={recintoSeleccionado} junta={juntaSeleccionada}
              candidatos={candidatos} onFoto={onFoto} />}
          </> : <p className="ar-mensaje">Selecciona un recinto para comenzar.</p>}
        </div>
      </div>
    </>}
  </section>;
}
