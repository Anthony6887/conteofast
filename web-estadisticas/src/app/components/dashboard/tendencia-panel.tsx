'use client';

import { useMemo, type CSSProperties } from 'react';
import { numero, porcentaje } from '../../lib/electoral';
import type { CandidatoResultado, Dignidad } from '../../lib/electoral';
import { FotoCandidato } from './foto-candidato';
import {
  crearFilasTendencia,
  diferenciaConAnterior,
  contarSinDignidad,
} from './tendencia-candidatos';
import './tendencia-candidatos.css';

interface Props {
  candidatos: CandidatoResultado[];
  candidatosAnteriores?: CandidatoResultado[] | null;
  dignidad: Dignidad;
  onCambiarDignidad: (valor: Dignidad) => void;
  variante?: 'principal' | 'ranking';
}

const FILTROS: { id: Dignidad; titulo: string }[] = [
  { id: 'ALCALDE', titulo: 'Alcaldes' },
  { id: 'URBANO', titulo: 'Concejales urbanos' },
  { id: 'RURAL', titulo: 'Concejales rurales' },
];

/** Comparación vertical por listas, siempre con la misma escala para cada dignidad. */
export function TendenciaPanel({
  candidatos,
  candidatosAnteriores = null,
  dignidad,
  onCambiarDignidad,
  variante = 'principal',
}: Props) {
  const filas = useMemo(
    () => crearFilasTendencia(candidatos, dignidad),
    [candidatos, dignidad],
  );
  const anteriores = useMemo(
    () => candidatosAnteriores ? crearFilasTendencia(candidatosAnteriores, dignidad) : [],
    [candidatosAnteriores, dignidad],
  );
  const votos = filas.reduce((acum, fila) => acum + fila.votos, 0);
  const mayor = Math.max(1, ...filas.map(fila => fila.votos));
  const sinDignidad = useMemo(() => contarSinDignidad(candidatos), [candidatos]);
  const titulo = FILTROS.find(f => f.id === dignidad)?.titulo ?? 'Alcaldes';

  return (
    <section className={`ev-panel tc-vertical-panel tc-vertical-panel--${variante}`}
      aria-label={`Votos por listas: ${titulo}`}>
      <header className="tc-vb-header">
        <div>
          <span className="tc-vb-kicker"><i /> CONTEO ELECTORAL · EN VIVO</span>
          <h1>Votos en tiempo real</h1>
        </div>
        <div className="tc-vb-total">
          <small>{titulo} · Votos</small>
          <strong>{numero(votos)}</strong>
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
        <div className="tc-vb-desplazamiento" role="region"
          tabIndex={0} aria-label="Gráfico comparativo de votos por lista">
          <div className="tc-vb-grid" style={{ '--tc-columnas': filas.length } as CSSProperties}>
            {filas.map(fila => {
              // 58 % de altura máxima: reserva espacio para la foto y el contador.
              // Todas las barras usan el mismo máximo dentro de la dignidad.
              const alto = fila.registrado && fila.votos > 0
                ? (fila.votos / mayor) * 58 : 0;
              const porcentajeReal = fila.registrado ? porcentaje(fila.votos, votos) : 0;
              const diferencia = candidatosAnteriores
                ? diferenciaConAnterior(fila, anteriores) : null;
              const estilo = {
                '--tc-color': fila.color,
                '--tc-alto': `${alto}%`,
              } as CSSProperties;

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
                        size={66} className="tc-vb-foto" />
                    </div>
                  </div>
                  <div className="tc-vb-pie">
                    <strong className="tc-vb-lista">LISTA {fila.numeroLista}</strong>
                    <span className="tc-vb-nombre" title={fila.nombre}>{fila.nombre}</span>
                    {diferencia !== null && diferencia !== 0 && (
                      <span className={`tc-vb-diferencia ${diferencia > 0 ? 'tc-vb-diferencia--sube' : 'tc-vb-diferencia--baja'}`}>
                        {diferencia > 0 ? '+' : '−'}{numero(Math.abs(diferencia))}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="tc-vb-vacio">No se encontraron listas para esta dignidad.</p>
      )}

    </section>
  );
}
