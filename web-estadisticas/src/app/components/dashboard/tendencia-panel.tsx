'use client';

import { useMemo, type CSSProperties } from 'react';
import { numero, porcentaje, porcentajeTexto } from '../../lib/electoral';
import type { CandidatoResultado, Dignidad } from '../../lib/electoral';
import { FotoCandidato } from './foto-candidato';
import {
  crearFilasTendencia,
  diferenciaConAnterior,
  contarSinDignidad,
} from './tendencia-candidatos';
import { obtenerEspeciales, type RegistroEspecial } from './votos-especiales';
import './tendencia-candidatos.css';

interface Props {
  candidatos: CandidatoResultado[];
  candidatosAnteriores?: CandidatoResultado[] | null;
  /** Valores calculados en backend desde cf_registro_especiales. */
  especiales?: RegistroEspecial[] | null;
  dignidad: Dignidad;
  onCambiarDignidad: (valor: Dignidad) => void;
  variante?: 'principal' | 'ranking';
}

const FILTROS: { id: Dignidad; titulo: string }[] = [
  { id: 'ALCALDE', titulo: 'Alcaldes' },
  { id: 'URBANO', titulo: 'Concejales urbanos' },
  { id: 'RURAL', titulo: 'Concejales rurales' },
];

/** Gráfico comparativo con barras para listas, nulos y blancos en la misma escala. */
export function TendenciaPanel({
  candidatos,
  candidatosAnteriores = null,
  especiales,
  dignidad,
  onCambiarDignidad,
  variante = 'principal',
}: Props) {
  const filas = useMemo(() => crearFilasTendencia(candidatos, dignidad), [candidatos, dignidad]);
  const anteriores = useMemo(() => candidatosAnteriores
    ? crearFilasTendencia(candidatosAnteriores, dignidad) : [], [candidatosAnteriores, dignidad]);
  const totalesEspeciales = useMemo(() => obtenerEspeciales(especiales, dignidad), [especiales, dignidad]);
  const validos = filas.reduce((acum, fila) => acum + fila.votos, 0);
  const emitidos = validos + (totalesEspeciales.disponible ? totalesEspeciales.nulos + totalesEspeciales.blancos : 0);
  const mayor = Math.max(1, totalesEspeciales.nulos, totalesEspeciales.blancos, ...filas.map(fila => fila.votos));
  const sinDignidad = useMemo(() => contarSinDignidad(candidatos), [candidatos]);
  const titulo = FILTROS.find(f => f.id === dignidad)?.titulo ?? 'Alcaldes';
  const especialesGraficados = [
    { id: 'nulos', titulo: 'VOTOS NULOS', votos: totalesEspeciales.nulos, color: '#f3002d', signo: '×' },
    { id: 'blancos', titulo: 'VOTOS BLANCOS', votos: totalesEspeciales.blancos, color: '#3194af', signo: '○' },
  ] as const;

  return (
    <section
      className={`ev-panel tc-vertical-panel tc-vertical-panel--${variante}`}
      aria-label={`Votos por listas y especiales: ${titulo}`}
    >
      <header className="tc-vb-header">
        <div>
          <span className="tc-vb-kicker"><i /> CONTEO ELECTORAL · EN VIVO</span>
          <h1>Votos en tiempo real</h1>
        </div>
        <div className="tc-vb-total">
          <small>{titulo} · Votos de listas</small>
          <strong>{numero(validos)}</strong>
        </div>
      </header>

      <div className="tc-vb-filtros" role="group" aria-label="Dignidad electoral">
        {FILTROS.map(filtro => (
          <button key={filtro.id} type="button"
            className={`tc-vb-filtro ${dignidad === filtro.id ? 'tc-vb-filtro--activo' : ''}`}
            aria-pressed={dignidad === filtro.id}
            onClick={() => onCambiarDignidad(filtro.id)}>
            {filtro.titulo}
          </button>
        ))}
      </div>

      {filas.length > 0 ? (
        <div className="tc-vb-desplazamiento" role="region" tabIndex={0}
          aria-label="Gráfico comparativo de votos por lista, nulos y blancos">
          <div className="tc-vb-grid" style={{ '--tc-columnas': filas.length + 2 } as CSSProperties}>
            {filas.map(fila => {
              const alto = fila.registrado && fila.votos > 0 ? (fila.votos / mayor) * 62 : 0;
              const porcentajeReal = fila.registrado ? porcentaje(fila.votos, validos) : 0;
              const diferencia = candidatosAnteriores ? diferenciaConAnterior(fila, anteriores) : null;
              const estilo = { '--tc-color': fila.color, '--tc-alto': `${alto}%` } as CSSProperties;
              return (
                <article className="tc-vb-columna" key={fila.id} style={estilo}
                  aria-label={`Lista ${fila.numeroLista}, ${fila.nombre}, ${fila.registrado ? numero(fila.votos) + ' votos' : 'sin datos'}`}>
                  <div className="tc-vb-escala">
                    <div className="tc-vb-barra" aria-hidden="true" />
                    <div className="tc-vb-marcador">
                      <div className="tc-vb-cantidad">
                        <strong>{fila.registrado ? numero(fila.votos) : '—'}</strong>
                        <small>{fila.registrado ? 'votos' : 'sin dato'}</small>
                      </div>
                      <FotoCandidato nombre={fila.nombre} archivo={fila.foto}
                        size={78} className="tc-vb-foto" />
                    </div>
                  </div>
                  <div className="tc-vb-pie">
                    <strong className="tc-vb-lista">LISTA {fila.numeroLista}</strong>
                    <span className="tc-vb-nombre" title={fila.nombre}>{fila.nombre}</span>
                    <small className="tc-vb-cuota">
                      {fila.registrado ? porcentajeTexto(porcentajeReal) : 'Sin registro'}
                    </small>
                    {diferencia !== null && diferencia !== 0 && (
                      <span className={`tc-vb-diferencia ${diferencia > 0 ? 'tc-vb-diferencia--sube' : 'tc-vb-diferencia--baja'}`}>
                        {diferencia > 0 ? '+' : '−'}{numero(Math.abs(diferencia))}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}

            {especialesGraficados.map(item => {
              const alto = totalesEspeciales.disponible && item.votos > 0
                ? (item.votos / mayor) * 62 : 0;
              const estilo = { '--tc-color': item.color, '--tc-alto': `${alto}%` } as CSSProperties;
              return (
                <article className={`tc-vb-columna tc-vb-columna--especial tc-vb-columna--${item.id}`}
                  key={item.id} style={estilo}
                  aria-label={`${item.titulo}: ${totalesEspeciales.disponible ? numero(item.votos) : 'no disponible desde la API'}`}>
                  <div className="tc-vb-escala">
                    <div className="tc-vb-barra" aria-hidden="true" />
                    <div className="tc-vb-marcador">
                      <div className="tc-vb-cantidad">
                        <strong>{totalesEspeciales.disponible ? numero(item.votos) : '—'}</strong>
                        <small>{totalesEspeciales.disponible ? 'votos' : 'sin dato'}</small>
                      </div>
                      <span className="tc-vb-simbolo" aria-hidden="true">{item.signo}</span>
                    </div>
                  </div>
                  <div className="tc-vb-pie">
                    <strong className="tc-vb-lista">{item.titulo}</strong>
                    <span className="tc-vb-nombre">
                      {totalesEspeciales.disponible ? 'Papeletas registradas' : 'API sin información'}
                    </span>
                    <small className="tc-vb-cuota">
                      {totalesEspeciales.disponible ? porcentajeTexto(porcentaje(item.votos, emitidos)) : 'Sin registro'}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="tc-vb-vacio">No se encontraron listas para esta dignidad.</p>
      )}

      <footer className="tc-vb-nota">
        <span>Datos preliminares y no oficiales · Actualización automática</span>
        <span>Listas: {numero(validos)} · Nulos: {totalesEspeciales.disponible ? numero(totalesEspeciales.nulos) : '—'} · Blancos: {totalesEspeciales.disponible ? numero(totalesEspeciales.blancos) : '—'}</span>
        {sinDignidad > 0 && <span title="Registros sin dignidad identificable">{numero(sinDignidad)} sin clasificar</span>}
      </footer>
    </section>
  );
}
