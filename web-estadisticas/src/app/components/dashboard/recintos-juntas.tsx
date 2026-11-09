'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DatosRecintos, RecintoEstado } from '../../lib/recintos-estado';
import { numero } from '../../lib/electoral';

type Filtro = 'pendientes' | 'todos' | 'completos';
type Props = {
  datos: DatosRecintos | null;
  error: string;
  cargando: boolean;
  onActualizar: () => void;
};

function etiquetaTipo(tipo: string) {
  switch (tipo.toUpperCase()) {
    case 'F': return 'F';
    case 'M': return 'M';
    case 'MIXTA': return 'MX';
    default: return tipo || '?';
  }
}

function RecintoCine({ recinto }: { recinto: RecintoEstado }) {
  const completado = recinto.total_juntas > 0 && recinto.pendientes === 0;
  const porcentaje = recinto.total_juntas > 0
    ? Math.round(100 * recinto.confirmadas / recinto.total_juntas)
    : 0;

  return (
    <article className="rc-recinto" id={`recinto-${recinto.id}`}>
      <header className="rc-recinto-cabecera">
        <div>
          <span className="rc-parroquia">{recinto.parroquia || 'Parroquia no indicada'}</span>
          <h2>{recinto.nombre}</h2>
          <p>{numero(recinto.confirmadas)} confirmadas · {numero(recinto.pendientes)} pendientes · {numero(recinto.total_juntas)} juntas</p>
        </div>
        <span className={`rc-recinto-estado ${completado ? 'rc-recinto-estado--ok' : ''}`}>
          {completado ? 'Completo' : `${porcentaje}% completado`}
        </span>
      </header>

      <div className="rc-pista" aria-hidden="true">RECINTO ELECTORAL · DISTRIBUCIÓN DE JUNTAS</div>
      <div className="rc-juntas" role="list" aria-label={`Juntas del recinto ${recinto.nombre}`}>
        {recinto.juntas.map(junta => {
          const etiqueta = `${junta.numero} ${etiquetaTipo(junta.tipo)}`;
          const estadoTexto = junta.estado === 'CONFIRMADO'
            ? 'Confirmada' : junta.estado === 'EN_REVISION' ? 'Registro sin confirmar' : 'Sin registro';
          return (
            <div
              role="listitem"
              key={junta.id}
              className={`rc-junta rc-junta--${junta.estado.toLowerCase()}`}
              title={`Junta ${etiqueta} · ${estadoTexto}${junta.padron == null ? '' : ` · Padrón ${junta.padron}`}`}
              aria-label={`Junta ${etiqueta}, ${estadoTexto}`}
            >
              <strong>{junta.numero}</strong>
              <small>{etiquetaTipo(junta.tipo)}</small>
            </div>
          );
        })}
      </div>
      <div className="rc-progreso" aria-hidden="true">
        <span style={{ width: `${porcentaje}%` }} />
      </div>
    </article>
  );
}

export default function RecintosJuntas({ datos, error, cargando, onActualizar }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [buscar, setBuscar] = useState('');
  const desplazadoRef = useRef(false);

  const visibles = useMemo(() => {
    const texto = buscar.trim().toLocaleLowerCase('es');
    return (datos?.recintos || []).filter(r => {
      if (filtro === 'pendientes' && r.pendientes === 0) return false;
      if (filtro === 'completos' && r.pendientes !== 0) return false;
      return !texto || `${r.nombre} ${r.parroquia} ${r.direccion}`.toLocaleLowerCase('es').includes(texto);
    });
  }, [buscar, datos, filtro]);

  useEffect(() => {
    if (!datos || !window.location.hash.startsWith('#recinto-')) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const encontrado = datos.recintos.find(r => `recinto-${r.id}` === id);
    if (!encontrado) return;
    if (encontrado.pendientes === 0) setFiltro('todos');
  }, [datos]);

  useEffect(() => {
    if (desplazadoRef.current || !datos || !window.location.hash.startsWith('#recinto-')) return;
    const objetivo = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (objetivo) {
      objetivo.scrollIntoView({ block: 'start', behavior: 'smooth' });
      desplazadoRef.current = true;
    }
  }, [datos, visibles]);

  return (
    <section className="rc-modulo" aria-label="Recintos y juntas electorales">
      <header className="rc-encabezado">
        <div>
          <span className="ev-eyebrow">CONTROL DE CAPTURA</span>
          <h1>Recintos y juntas</h1>
          <p>Distribución visual tipo cine · se colorean con el estado confirmado en la base de datos.</p>
        </div>
        <button type="button" className="rc-actualizar" onClick={onActualizar}>Actualizar ahora</button>
      </header>

      {datos && <>
        <div className="rc-metricas">
          <div><small>Recintos</small><strong>{numero(datos.totales.recintos)}</strong></div>
          <div><small>Recintos incompletos</small><strong>{numero(datos.totales.recintos_pendientes)}</strong></div>
          <div><small>Juntas confirmadas</small><strong>{numero(datos.totales.confirmadas)}</strong></div>
          <div><small>Juntas pendientes</small><strong>{numero(datos.totales.pendientes)}</strong></div>
        </div>
        <div className="rc-herramientas">
          <div className="rc-filtros" role="group" aria-label="Filtrar recintos">
            <button type="button" className={filtro === 'pendientes' ? 'rc-filtro rc-filtro--activo' : 'rc-filtro'} onClick={() => setFiltro('pendientes')}>Pendientes</button>
            <button type="button" className={filtro === 'todos' ? 'rc-filtro rc-filtro--activo' : 'rc-filtro'} onClick={() => setFiltro('todos')}>Todos</button>
            <button type="button" className={filtro === 'completos' ? 'rc-filtro rc-filtro--activo' : 'rc-filtro'} onClick={() => setFiltro('completos')}>Completados</button>
          </div>
          <input
            className="rc-buscar"
            type="search"
            placeholder="Buscar recinto o parroquia..."
            aria-label="Buscar recintos"
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
          />
        </div>
        <div className="rc-leyenda" aria-label="Significado de los colores">
          <span><i className="rc-leyenda-color rc-leyenda-color--ok" /> Confirmada</span>
          <span><i className="rc-leyenda-color rc-leyenda-color--revision" /> Registro sin confirmar</span>
          <span><i className="rc-leyenda-color rc-leyenda-color--pendiente" /> Sin registro</span>
        </div>
      </>}

      {error && <p className="ev-error" role="alert">{error} {datos && 'Se muestran los últimos datos obtenidos.'}</p>}
      {!datos && cargando && <p className="ev-cargando">Consultando el estado de los recintos…</p>}
      {!datos && !cargando && !error && <p className="ev-cargando">No hay datos de recintos disponibles.</p>}

      {datos && (
        visibles.length > 0
          ? <div className="rc-grilla">{visibles.map(recinto => <RecintoCine recinto={recinto} key={recinto.id} />)}</div>
          : <p className="rc-sin-resultados">No hay recintos que coincidan con el filtro seleccionado.</p>
      )}
      <p className="rc-aclaracion">Una junta se considera completada únicamente cuando su registro tiene estado CONFIRMADO. Los datos son de seguimiento interno y no corresponden a resultados oficiales del CNE.</p>
    </section>
  );
}
