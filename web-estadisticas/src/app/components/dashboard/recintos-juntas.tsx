'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import type { DatosRecintos, RecintoEstado } from '../../lib/recintos-estado';
import { estaFinalizada, tieneRegistro } from '../../lib/recintos-estado';
import { numero } from '../../lib/electoral';
import './recintos-juntas.css';

type Filtro = 'todos' | 'pendientes' | 'registrados' | 'finalizados';
type Props = {
  datos: DatosRecintos | null;
  error: string;
  cargando: boolean;
  onActualizar: () => void;
};

function RecintoTarjeta({ recinto }: { recinto: RecintoEstado }) {
  const cerradas = recinto.juntas.filter(estaFinalizada).length;
  const porcentaje = recinto.total_juntas > 0 ? Math.round(100 * cerradas / recinto.total_juntas) : 0;
  return <article className="rc-recinto" id={`recinto-${recinto.id}`}>
    <header className="rc-recinto-cabecera">
      <div><span className="rc-parroquia">{recinto.parroquia || 'Sin parroquia'} · {recinto.codigo_recinto ?? 'Sin código'}</span>
        <h2>{recinto.nombre}</h2><p>{recinto.direccion}</p></div>
      <span className={`rc-recinto-estado ${porcentaje === 100 ? 'rc-recinto-estado--ok' : ''}`}>{porcentaje}%</span>
    </header>
    <div className="rc-conteos"><span>{cerradas} de {recinto.total_juntas} finalizadas</span><span>{recinto.confirmadas} con votos registrados</span></div>
    <div className="rc-progreso" role="progressbar" aria-label={`Avance del recinto ${recinto.nombre}`}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentaje}><span style={{ width: `${porcentaje}%` }}/></div>
    <div className="rc-juntas" role="list" aria-label={`Juntas del recinto ${recinto.nombre}`}>
      {recinto.juntas.map(junta => {
        const cerrada = estaFinalizada(junta);
        const tieneVotos = tieneRegistro(junta);
        return <span role="listitem" key={junta.id}
          className={`rc-junta ${cerrada ? 'rc-junta--finalizado' : tieneVotos ? 'rc-junta--confirmado' : junta.estado === 'EN_REVISION' ? 'rc-junta--en_revision' : 'rc-junta--pendiente'}`}
          aria-label={`${junta.tipo.toUpperCase() === 'F' ? 'Femenina' : 'Masculina'} ${junta.numero}: ${cerrada ? 'Finalizada y bloqueada' : tieneVotos ? 'Con votos registrados, pendiente de finalizar' : 'Pendiente'}`}
          title={`${junta.tipo.toUpperCase() === 'F' ? 'Femenina' : 'Masculina'} ${junta.numero} · ${cerrada ? 'Finalizada' : tieneVotos ? 'Registrada' : 'Pendiente'}`}>
          <strong>{String(junta.tipo).toUpperCase()}{String(junta.numero).padStart(2, '0')}</strong>
          <small aria-hidden="true">{cerrada ? '✓' : tieneVotos ? '●' : '·'}</small>
        </span>;
      })}
    </div>

  </article>;
}

export default function RecintosJuntas({ datos, error, cargando, onActualizar }: Props) {
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [parroquia, setParroquia] = useState('TODAS');
  const parroquias = useMemo(() => [...new Set((datos?.recintos || []).map(r => r.parroquia).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, 'es')), [datos]);
  const visibles = useMemo(() => {
    const consulta = buscar.trim().toLocaleLowerCase('es');
    return (datos?.recintos || []).filter(r => {
      if (parroquia !== 'TODAS' && r.parroquia !== parroquia) return false;
      if (filtro === 'pendientes' && r.pendientes === 0) return false;
      if (filtro === 'registrados' && r.confirmadas === 0) return false;
      if (filtro === 'finalizados' && !r.juntas.some(estaFinalizada)) return false;
      return !consulta || `${r.nombre} ${r.parroquia} ${r.codigo_recinto ?? ''}`.toLocaleLowerCase('es').includes(consulta);
    });
  }, [datos, buscar, filtro, parroquia]);

  return <section className="rc-modulo" aria-label="Recintos y juntas electorales">
    <header className="rc-encabezado"><div><span className="ev-eyebrow">CONTROL DE CAPTURA</span>
      <h1>Recintos y juntas</h1><p>Estado de avance por recinto. Las juntas finalizadas se señalan en verde, sin redirecciones.</p></div>
      <button type="button" className="rc-actualizar" onClick={onActualizar}>↻ Actualizar</button>
    </header>
    {datos && <div className="rc-metricas">
      <div><small>Recintos</small><strong>{numero(datos.totales.recintos)}</strong></div>
      <div><small>Registradas</small><strong>{numero(datos.totales.confirmadas)}</strong></div>
      <div><small>Finalizadas</small><strong>{numero(datos.totales.finalizadas || datos.recintos.flatMap(r => r.juntas).filter(estaFinalizada).length)}</strong></div>
      <div><small>Pendientes</small><strong>{numero(datos.totales.pendientes)}</strong></div>
    </div>}
    <div className="rc-herramientas">
      <label><span>Buscar</span><input type="search" value={buscar} onChange={(e: ChangeEvent<HTMLInputElement>) => setBuscar(e.target.value)} placeholder="Recinto, parroquia o código" /></label>
      <label><span>Parroquia</span><select value={parroquia} onChange={(e: ChangeEvent<HTMLSelectElement>) => setParroquia(e.target.value)}>
        <option value="TODAS">Todas las parroquias</option>{parroquias.map(p => <option key={p} value={p}>{p}</option>)}
      </select></label>
      <label><span>Estado</span><select value={filtro} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFiltro(e.target.value as Filtro)}>
        <option value="todos">Todos los recintos</option><option value="pendientes">Con pendientes</option>
        <option value="registrados">Con registros</option><option value="finalizados">Con finalizadas</option>
      </select></label>
    </div>
    <div className="rc-leyenda">
      <span><i className="rc-leyenda-color rc-leyenda-color--finalizado" /> Verde: finalizada y bloqueada</span>
      <span><i className="rc-leyenda-color rc-leyenda-color--ok" /> Azul: votos registrados sin cerrar</span>
      <span><i className="rc-leyenda-color rc-leyenda-color--pendiente" /> Gris: pendiente</span>
      <span>Panel informativo sin navegación</span>
    </div>
    {error && <p className="ev-error" role="alert">{error}{datos ? ' · Mostrando último estado válido' : ''}</p>}
    {!datos && cargando && <p className="ev-cargando">Consultando recintos y juntas…</p>}
    {datos && (visibles.length
      ? <div className="rc-grilla">{visibles.map(recinto => <RecintoTarjeta key={recinto.id} recinto={recinto} />)}</div>
      : <p className="rc-sin-resultados">No existen recintos con estos filtros.</p>)}
  </section>;
}
