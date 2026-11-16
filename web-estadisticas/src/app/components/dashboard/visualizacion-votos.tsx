'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import type { DashboardDatos } from '../../lib/electoral';
import { BASE_PATH, numero } from '../../lib/electoral';
import {
  agruparPorListas,
  totalVotos,
  type TipoEscenario,
  type OrdenVisual,
  type ResultadoLista,
} from '../../lib/visualizacion-en-vivo';
import './visualizacion-en-vivo.css';

type Props = { datos: DashboardDatos; conectado: boolean; hora: string };

const ESCENARIOS: { id: TipoEscenario; titulo: string; corto: string; detalle: string }[] = [
  { id: 'ALCALDE', titulo: 'Alcaldía', corto: 'Alcaldes', detalle: 'Candidatos a alcalde, con sus fotografías' },
  { id: 'URBANO', titulo: 'Concejales urbanos', corto: 'Concejales urbanos', detalle: 'Votos agrupados por lista política urbana' },
  { id: 'RURAL', titulo: 'Concejales rurales', corto: 'Concejales rurales', detalle: 'Votos agrupados por lista política rural' },
  { id: 'VOCAL', titulo: 'Vocales parroquiales', corto: 'Vocales', detalle: 'Votos por lista, sumados entre las parroquias rurales registradas' },
];

const LLAVE_ESCENARIO = (escenario: TipoEscenario) => escenario.toLowerCase();

/** En caso de falta de una foto/logo, mostrar un distintivo neutral. */
function ImagenLista({ archivo, carpeta, alt, texto, clase }: {
  archivo: string | null;
  carpeta: 'candidatos' | 'logos-partidos';
  alt: string;
  texto: string;
  clase: string;
}) {
  const [fallida, setFallida] = useState('');
  if (!archivo || fallida === archivo) {
    return <span role="img" aria-label={alt} className={`${clase} vl-imagen-reemplazo`}>{texto}</span>;
  }
  return <Image
    src={`${BASE_PATH}/${carpeta}/${encodeURIComponent(archivo)}`}
    width={72} height={72} alt={alt} className={clase} unoptimized
    onError={() => setFallida(archivo)}
  />;
}

function ColumnaVotos({ fila, escenario, maximo }: {
  fila: ResultadoLista;
  escenario: TipoEscenario;
  maximo: number;
}) {
  const altura = maximo > 0 ? (fila.votos / maximo) * 100 : 0;
  const esAlcalde = escenario === 'ALCALDE';
  const nombres = fila.nombres.join(' / ');
  const estilo = {
    '--vl-altura': `${(altura * 0.82).toFixed(2)}%`,
    '--vl-color': fila.color,
  } as CSSProperties;

  return <div className={`vl-columna ${fila.votos > 0 ? 'vl-columna--con-votos' : ''}`} style={estilo}
    role="listitem" aria-label={`Lista ${fila.lista}, ${numero(fila.votos)} votos. ${nombres}`}>
    <div className="vl-trazado">
      <div className="vl-altura-contenido">
        <div className="vl-numero-votos" aria-hidden="true">
          <strong>{numero(fila.votos)}</strong><small>votos</small>
        </div>
        <div className="vl-barra-vertical" aria-hidden="true"><span /></div>
      </div>
    </div>
    <div className="vl-identidad">
      {esAlcalde ?
        <ImagenLista archivo={fila.foto} carpeta="candidatos"
          clase="vl-avatar vl-avatar--alcalde" alt={`Fotografía de ${nombres}`}
          texto={fila.lista} />
        : <ImagenLista archivo={fila.logo} carpeta="logos-partidos"
          clase="vl-avatar vl-avatar--logo" alt={`Logo de la lista ${fila.lista}`}
          texto={fila.lista} />}
      <div className="vl-numero-lista">LISTA {fila.lista}</div>
      <div className="vl-nombre" title={nombres}>
        {esAlcalde ? nombres : `Lista ${fila.lista}`}
      </div>
      {!esAlcalde && <div className="vl-candidaturas" title={nombres}>
        {escenario === 'VOCAL' ? 'Vocales' : 'Concejalía'}
      </div>}
      <div className="vl-porcentaje" aria-label={`${fila.porcentaje.toFixed(1)} por ciento del total`}>{fila.porcentaje.toFixed(1)}%</div>
    </div>
  </div>;
}

export default function VisualizacionVotos({ datos, conectado, hora }: Props) {
  const [escenario, setEscenario] = useState<TipoEscenario>('ALCALDE');
  const [orden, setOrden] = useState<OrdenVisual>('lista');

  const filas = useMemo(
    () => agruparPorListas(datos.candidatos, escenario, orden),
    [datos.candidatos, escenario, orden],
  );
  const maximo = Math.max(0, ...filas.map(f => f.votos));
  const total = totalVotos(filas);
  const reporteJuntas = Math.min(datos.juntas_confirmadas, datos.juntas_total);
  const progreso = datos.juntas_total > 0 ? (100 * reporteJuntas) / datos.juntas_total : 0;
  const seleccionado = ESCENARIOS.find(e => e.id === escenario)!;

  return <div className="vl-pagina">
    <section className="vl-panel" aria-label="Conteo electoral en tiempo real">
      <header className="vl-encabezado">
        <div className="vl-identidad-general">
          <div className="vl-etiqueta-superior"><i className={conectado ? '' : 'vl-desconectado'} /> CONTEO ELECTORAL · {conectado ? 'EN VIVO' : 'ÚLTIMA LECTURA'}</div>
          <h1>Votos en tiempo real</h1>
          <p>Resultados registrados en ConteoFast · Actualización automática cada segundo</p>
        </div>
        <div className="vl-contadores">
          <div className="vl-contador-principal"><span>{seleccionado.titulo} · Votos</span><strong>{numero(total)}</strong></div>
          <div className="vl-contador-secundario"><span>Juntas registradas</span><strong>{numero(reporteJuntas)} <small>/ {numero(datos.juntas_total)}</small></strong></div>
        </div>
      </header>

      <div className="vl-barra-estado">
        <div className="vl-progreso" role="progressbar" aria-label="Cobertura de juntas" aria-valuemin={0}
          aria-valuemax={100} aria-valuenow={Number(progreso.toFixed(1))}>
          <span style={{ width: `${Math.max(0, Math.min(100, progreso))}%` }} />
        </div>
        <div className="vl-ultima-lectura">Actualizado: <strong>{hora}</strong></div>
      </div>

      <div className="vl-pestanas" role="tablist" aria-label="Escenarios electorales">
        {ESCENARIOS.map(e => <button key={e.id} id={`tab-${LLAVE_ESCENARIO(e.id)}`} type="button" role="tab"
          className={`vl-pestana ${escenario === e.id ? 'vl-pestana--activa' : ''}`}
          aria-selected={escenario === e.id}
          aria-controls="panel-grafico-votos"
          onClick={() => setEscenario(e.id)}>{e.corto}</button>)}
      </div>

      <div className="vl-cabecera-grafico">
        <div><h2>{seleccionado.titulo}</h2><span>{seleccionado.detalle}</span></div>
        <div className="vl-herramientas">
          <span>{filas.length} listas</span>
          <label htmlFor="vl-orden">Ordenar:</label>
          <select id="vl-orden" value={orden} onChange={e => setOrden(e.target.value as OrdenVisual)}>
            <option value="lista">Número de lista</option>
            <option value="votos">Mayor votación</option>
          </select>
        </div>
      </div>

      <div id="panel-grafico-votos" role="tabpanel" aria-labelledby={`tab-${LLAVE_ESCENARIO(escenario)}`}>
        {filas.length ? <div className="vl-desplazamiento" tabIndex={0} aria-label="Gráfico de barras; desliza horizontalmente para consultar todas las listas">
          <div className="vl-grafico" role="list" aria-label={`Votos de ${seleccionado.titulo} por lista`}
            style={{ minWidth: `${Math.max(0, filas.length * 113)}px`, gridTemplateColumns: `repeat(${filas.length}, minmax(0, 1fr))` }}>
            {filas.map(fila => <ColumnaVotos key={`${escenario}-${fila.lista}`} fila={fila} escenario={escenario} maximo={maximo} />)}
          </div>
        </div> : <div className="vl-vacio">
          <strong>Aún no hay listas registradas para {seleccionado.titulo.toLowerCase()}.</strong>
          <p>Cuando la API devuelva candidaturas de esta dignidad, aparecerán sus barras automáticamente.</p>
        </div>}
      </div>

      <footer className="vl-pie"><span>Los resultados corresponden al registro interno y están sujetos a verificación.</span>
        <span>Fuente: ConteoFast · Elección {datos.eleccion_id}</span></footer>
    </section>
  </div>;
}
