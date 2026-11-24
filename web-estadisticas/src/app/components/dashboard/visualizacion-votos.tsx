'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from 'react';
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
import { PARROQUIAS_VOCALES, type VocalesParroquia } from '../../lib/parroquias-vocales';
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

  const [parroquia, setParroquia] = useState<string>(PARROQUIAS_VOCALES[0].id);
  const [lectura, setLectura] = useState<{ id: string; data?: VocalesParroquia; error?: string } | null>(null);
  const esVocal = escenario === 'VOCAL';
  const ficha = PARROQUIAS_VOCALES.find(p => p.id === parroquia)!;
  useEffect(() => {
    if (!esVocal) return;
    let activo = true;
    let timer: ReturnType<typeof setTimeout>;
    const ctrl = new AbortController();
    async function consultar() {
      try {
        const r = await fetch(`${BASE_PATH}/api/vocales-parroquia?parroquia=${encodeURIComponent(parroquia)}`, { cache: 'no-store', signal: ctrl.signal });
        const json = await r.json();
        if (!r.ok || !json.ok || !json.data) throw new Error(json.message || 'Error consultando parroquia.');
        if (activo) setLectura({ id: parroquia, data: json.data });
      } catch (e) {
        if (activo) setLectura({ id: parroquia, error: e instanceof Error ? e.message : 'Sin conexión.' });
      } finally {
        if (activo) timer = setTimeout(consultar, 10000);
      }
    }
    void consultar();
    return () => { activo = false; ctrl.abort(); clearTimeout(timer); };
  }, [esVocal, parroquia]);
  const local = lectura?.id === parroquia ? lectura.data : undefined;
  const errorLocal = lectura?.id === parroquia ? lectura.error : undefined;
  const candidatosLocales = useMemo(() => {
    if (!local || Number(local.eleccion_id) !== Number(datos.eleccion_id)) return null;
    const catalogo = new Map(datos.candidatos.filter(c => ['VOCAL', 'VOCALES'].includes(String(c.tipo).toUpperCase())).map(c => [Number(c.candidato_id), c]));
    if (local.votos.some(v => !catalogo.has(v.candidato_id) || !catalogo.get(v.candidato_id)?.numero_lista)) return null;
    return local.votos.map(v => ({ ...catalogo.get(v.candidato_id)!, total_votos: v.votos }));
  }, [local, datos.candidatos, datos.eleccion_id]);
  const listo = !esVocal || (!!local && candidatosLocales !== null);
  const filas = useMemo(
    () => agruparPorListas(esVocal ? candidatosLocales ?? [] : datos.candidatos, escenario, orden),
    [datos.candidatos, candidatosLocales, esVocal, escenario, orden],
  );
  const especialesGrafico = esVocal ? (listo && local ? [{ dignidad: 'VOCAL' as const, nulos: local.nulos, blancos: local.blancos, disponible: true }] : []) : datos.especiales;
  const especiales = obtenerEspeciales(especialesGrafico, escenario);
  const totalListas = totalVotos(filas);
  const totalGraficado = totalListas + (especiales.disponible ? especiales.nulos + especiales.blancos : 0);
  const maximo = Math.max(
    1,
    ...filas.map(f => f.votos),
    especiales.disponible ? especiales.nulos : 0,
    especiales.disponible ? especiales.blancos : 0,
  );
  const cantidadColumnas = filas.length + 2;
  const juntasTotal = esVocal ? ficha.juntas : datos.juntas_total;
  const reporteJuntas = esVocal ? (listo ? local?.juntas_confirmadas ?? 0 : 0) : Math.min(datos.juntas_confirmadas, datos.juntas_total);
  const progreso = juntasTotal > 0 ? (100 * reporteJuntas) / juntasTotal : 0;
  const seleccionado = ESCENARIOS.find(e => e.id === escenario)!;

  /** Imprime esta dignidad con los resultados actuales. Chrome permite Guardar como PDF. */
  const imprimirPDF = () => {
    const tituloAnterior = document.title;
    const nombre = `ConteoFast_${escenario}${esVocal ? `_${parroquia}` : ""}_${new Date().toISOString().slice(0, 10)}`;
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
              <i className={(esVocal ? listo : conectado) ? '' : 'vl-desconectado'} />
              CONTEO ELECTORAL · {(esVocal ? listo : conectado) ? 'EN VIVO' : 'SIN DATOS ACTUALES'}
            </div>
            <h1>Votos en tiempo real</h1>
            <p className="vl-solo-impresion">
              Reporte de {seleccionado.titulo}{esVocal ? ` — ${ficha.nombre}` : ""} · {new Date().toLocaleDateString('es-EC')}
            </p>
          </div>

          <div className="vl-contadores">
            <div className="vl-contador-secundario">
              <span>Juntas registradas</span>
              <strong>{listo ? numero(reporteJuntas) : "—"} <small>/ {numero(juntasTotal)}</small></strong>
            </div>
            <div className="vl-contador-porcentaje">
              <span>Avance de juntas</span>
              <strong>{listo ? `${progreso.toFixed(1)}%` : "—"}</strong>
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
            aria-valuenow={listo ? Number(progreso.toFixed(1)) : undefined}
          >
            <span style={{ width: `${Math.max(0, Math.min(100, progreso))}%` }} />
          </div>
          <div className="vl-ultima-lectura">Actualizado: <strong>{esVocal ? (listo && local ? new Date(local.consultado_en).toLocaleTimeString("es-EC") : "—") : hora}</strong></div>
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

        {esVocal && <div className="vl-parroquias" aria-label="Parroquias rurales">
          {PARROQUIAS_VOCALES.map(p => <button key={p.id} type="button" aria-pressed={parroquia === p.id} className={`vl-pestana ${parroquia === p.id ? 'vl-pestana--activa' : ''}`} onClick={() => { if (p.id !== parroquia) { setLectura(null); setParroquia(p.id); } }}>{p.nombre}</button>)}
        </div>}
        <div className="vl-cabecera-grafico">
          <div>
            <h2>{seleccionado.titulo}{esVocal ? ` — ${ficha.nombre}` : ""}</h2>
          
            {seleccionado.detalle && <span>{seleccionado.detalle}</span>}
          </div>
          <div className="vl-herramientas">
            <button
              className="vl-boton-pdf"
              type="button"
              onClick={imprimirPDF}
              disabled={!listo}
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
          {!listo ? <p className="vl-aviso-vacio" role="status">{errorLocal || (local ? 'El catálogo de candidatos no coincide con los votos de la parroquia.' : 'Consultando resultados de la parroquia…')}</p> : <div
            className="vl-desplazamiento"
            tabIndex={0}
            aria-label="Gráfico completo de listas, votos nulos y votos blancos"
          >
            {!filas.length && (
              <p className="vl-aviso-vacio">
                {esVocal ? 'Aún no hay votos de listas registrados para esta parroquia.' : 'No hay listas para esta dignidad. Se muestran los votos nulos y blancos disponibles.'}
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
                especiales={especialesGrafico}
                dignidad={escenario}
                maximo={maximo}
                totalGraficado={totalGraficado}
                juntasConfirmadas={reporteJuntas}
              />
            </div>
          </div>}
        </div>
      </section>
    </div>
  );
}
