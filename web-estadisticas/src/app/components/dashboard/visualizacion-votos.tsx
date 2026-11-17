'use client';

import { useMemo, useState, type CSSProperties, type ChangeEvent } from 'react';
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
import { VotosEspecialesColumnas } from './votos-especiales-columnas';
import { obtenerEspeciales } from './votos-especiales';

import './visualizacion-en-vivo.css';
import './visualizacion-imprimir.css';

type Props = { datos: DashboardDatos; conectado: boolean; hora: string };

const ESCENARIOS: { id: TipoEscenario; titulo: string; corto: string; detalle: string }[] = [
  { id: 'ALCALDE', titulo: 'Alcaldía', corto: 'Alcaldes', detalle: '' },
  { id: 'URBANO', titulo: 'Concejales urbanos', corto: 'Concejales urbanos', detalle: '' },
  { id: 'RURAL', titulo: 'Concejales rurales', corto: 'Concejales rurales', detalle: '' },
  { id: 'VOCAL', titulo: 'Vocales parroquiales', corto: 'Vocales', detalle: '' },
];

const LLAVE_ESCENARIO = (escenario: TipoEscenario) => escenario.toLowerCase();

/** Si falta la fotografía o el logotipo, mostrar un distintivo neutral. */
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
  return (
    <Image
      src={`${BASE_PATH}/${carpeta}/${encodeURIComponent(archivo)}`}
      width={72}
      height={72}
      alt={alt}
      className={clase}
      unoptimized
      onError={() => setFallida(archivo)}
    />
  );
}

function ColumnaVotos({ fila, escenario, maximo, totalGraficado }: {
  fila: ResultadoLista;
  escenario: TipoEscenario;
  maximo: number;
  totalGraficado: number;
}) {
  const altura = maximo > 0 ? (fila.votos / maximo) * 72 : 0;
  const porcentajeTotal = totalGraficado > 0 ? (fila.votos * 100) / totalGraficado : 0;
  const esAlcalde = escenario === 'ALCALDE';
  const nombres = fila.nombres.join(' / ');
  const etiquetaNombre = fila.nombres.length > 1
    ? `${fila.nombres[0]} (+${fila.nombres.length - 1})`
    : nombres;
  const estilo = {
    '--vl-altura': `${altura.toFixed(2)}%`,
    '--vl-color': fila.color,
  } as CSSProperties;

  return (
    <div
      className={`vl-columna ${fila.votos > 0 ? 'vl-columna--con-votos' : ''}`}
      style={estilo}
      role="listitem"
      aria-label={`Lista ${fila.lista}, ${numero(fila.votos)} votos. ${nombres}`}
    >
      <div className="vl-trazado">
        <div className="vl-altura-contenido">
          <div className="vl-numero-votos" aria-hidden="true">
            <strong>{numero(fila.votos)}</strong>
            <small>votos</small>
          </div>
          <div className="vl-barra-vertical" aria-hidden="true"><span /></div>
        </div>
      </div>
      <div className="vl-identidad">
        {esAlcalde ? (
          <ImagenLista
            archivo={fila.foto}
            carpeta="candidatos"
            clase="vl-avatar vl-avatar--alcalde"
            alt={`Fotografía de ${nombres}`}
            texto={fila.lista}
          />
        ) : (
          <ImagenLista
            archivo={fila.logo}
            carpeta="logos-partidos"
            clase="vl-avatar vl-avatar--logo"
            alt={`Logo de la lista ${fila.lista}`}
            texto={fila.lista}
          />
        )}

        <div className="vl-numero-lista">
          LISTA {fila.lista}
        </div>

        {esAlcalde && (
          <div className="vl-nombre">
            {etiquetaNombre}
          </div>
        )}

        <div
          className="vl-porcentaje"
          aria-label={`${porcentajeTotal.toFixed(1)} por ciento del total graficado`}
        >
          {porcentajeTotal.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

export default function VisualizacionVotos({ datos, conectado, hora }: Props) {
  const [escenario, setEscenario] = useState<TipoEscenario>('ALCALDE');
  const [orden, setOrden] = useState<OrdenVisual>('lista');

  const filas = useMemo(
    () => agruparPorListas(datos.candidatos, escenario, orden),
    [datos.candidatos, escenario, orden],
  );
  const especiales = obtenerEspeciales(datos.especiales, escenario);
  const totalListas = totalVotos(filas);
  const totalGraficado = totalListas + (especiales.disponible ? especiales.nulos + especiales.blancos : 0);
  const maximo = Math.max(
    1,
    ...filas.map(f => f.votos),
    especiales.disponible ? especiales.nulos : 0,
    especiales.disponible ? especiales.blancos : 0,
  );
  const cantidadColumnas = filas.length + 2;
  const reporteJuntas = Math.min(datos.juntas_confirmadas, datos.juntas_total);
  const progreso = datos.juntas_total > 0 ? (100 * reporteJuntas) / datos.juntas_total : 0;
  const seleccionado = ESCENARIOS.find(e => e.id === escenario)!;

  /** Imprime esta dignidad con los resultados actuales. Chrome permite Guardar como PDF. */
  const imprimirPDF = () => {
    const tituloAnterior = document.title;
    const nombre = `ConteoFast_${escenario}_${new Date().toISOString().slice(0, 10)}`;
    document.title = nombre;
    const restaurarTitulo = () => {
      document.title = tituloAnterior;
      window.removeEventListener('afterprint', restaurarTitulo);
    };
    window.addEventListener('afterprint', restaurarTitulo, { once: true });
    window.print();
  };

  return (
    <div className="vl-pagina">
      <section className="vl-panel" aria-label="Conteo electoral en tiempo real">
        <header className="vl-encabezado">
          <div className="vl-identidad-general">
            <div className="vl-etiqueta-superior">
              <i className={conectado ? '' : 'vl-desconectado'} />
              CONTEO ELECTORAL · {conectado ? 'EN VIVO' : 'ÚLTIMA LECTURA'}
            </div>
            <h1>Votos en tiempo real</h1>
            <p className="vl-solo-impresion">
              Reporte de {seleccionado.titulo} · {new Date().toLocaleDateString('es-EC')}
            </p>
          </div>

          <div className="vl-contadores">
            <div className="vl-contador-secundario">
              <span>Juntas registradas</span>
              <strong>{numero(reporteJuntas)} <small>/ {numero(datos.juntas_total)}</small></strong>
            </div>
            <div className="vl-contador-porcentaje">
              <span>Avance de juntas</span>
              <strong>{progreso.toFixed(1)}%</strong>
            </div>
          </div>
        </header>

        <div className="vl-barra-estado">
          <div
            className="vl-progreso"
            role="progressbar"
            aria-label="Cobertura de juntas"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number(progreso.toFixed(1))}
          >
            <span style={{ width: `${Math.max(0, Math.min(100, progreso))}%` }} />
          </div>
          <div className="vl-ultima-lectura">Actualizado: <strong>{hora}</strong></div>
        </div>

        <div className="vl-pestanas" role="tablist" aria-label="Escenarios electorales">
          {ESCENARIOS.map(e => (
            <button
              key={e.id}
              id={`tab-${LLAVE_ESCENARIO(e.id)}`}
              type="button"
              role="tab"
              className={`vl-pestana ${escenario === e.id ? 'vl-pestana--activa' : ''}`}
              aria-selected={escenario === e.id}
              aria-controls="panel-grafico-votos"
              onClick={() => setEscenario(e.id)}
            >
              {e.corto}
            </button>
          ))}
        </div>

        <div className="vl-cabecera-grafico">
          <div>
            <h2>{seleccionado.titulo}</h2>
            {seleccionado.detalle && <span>{seleccionado.detalle}</span>}
          </div>
          <div className="vl-herramientas">
            <button
              className="vl-boton-pdf"
              type="button"
              onClick={imprimirPDF}
              aria-label={`Imprimir o guardar como PDF el reporte de ${seleccionado.titulo}`}
              title="Imprimir o guardar como PDF"
            >
              <svg
                width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              >
                <path d="M6 9V3h12v6" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v7H6z" />
                <path d="M18 12h.01" />
              </svg>
            </button>
            <label htmlFor="vl-orden">Ordenar:</label>
            <select
              id="vl-orden"
              value={orden}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setOrden(e.target.value as OrdenVisual)}
            >
              <option value="lista">Número de lista</option>
              <option value="votos">Mayor votación</option>
            </select>
          </div>
        </div>

        <div
          id="panel-grafico-votos"
          role="tabpanel"
          aria-labelledby={`tab-${LLAVE_ESCENARIO(escenario)}`}
        >
          <div
            className="vl-desplazamiento"
            tabIndex={0}
            aria-label="Gráfico completo de listas, votos nulos y votos blancos"
          >
            {!filas.length && (
              <p className="vl-aviso-vacio">
                No hay listas para esta dignidad. Se muestran los votos nulos y blancos disponibles.
              </p>
            )}
            <div
              className="vl-grafico"
              role="list"
              aria-label={`Votos de ${seleccionado.titulo}: listas, nulos y blancos`}
              style={{ '--vl-columnas': cantidadColumnas } as CSSProperties}
            >
              {filas.map(fila => (
                <ColumnaVotos
                  key={`${escenario}-${fila.lista}`}
                  fila={fila}
                  escenario={escenario}
                  maximo={maximo}
                  totalGraficado={totalGraficado}
                />
              ))}
              <VotosEspecialesColumnas
                especiales={datos.especiales}
                dignidad={escenario}
                maximo={maximo}
                totalGraficado={totalGraficado}
                juntasConfirmadas={datos.juntas_confirmadas}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
