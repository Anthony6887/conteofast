'use client';

import Image from 'next/image';
import { DIGNIDADES, LISTAS, numero, obtenerCandidato, BASE_PATH } from '../../lib/electoral';
import type { CandidatoResultado, Dignidad } from '../../lib/electoral';

type Props = {
  candidatos: CandidatoResultado[];
  dignidad: Dignidad;
  onCambiarDignidad: (valor: Dignidad) => void;
};

/**
 * Panel principal: 4 barras verticales, cada una con la foto del candidato
 * sobre su barra y los votos leídos de la API, sin porcentajes inventados.
 */
export default function VisualizacionVotos({ candidatos, dignidad, onCambiarDignidad }: Props) {
  // Orden de la maqueta: 7, 8, 18, 63. Solo se usan listas existentes.
  const ordenPreferido = ['7', '8', '18', '62'];
  const listasOrdenadas = [...LISTAS].sort((a, b) => {
    const ia = ordenPreferido.indexOf(String(a.numero));
    const ib = ordenPreferido.indexOf(String(b.numero));
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const filas = listasOrdenadas.map(lista => {
    const candidato = obtenerCandidato(candidatos, lista, dignidad);
    const referencia = dignidad === 'ALCALDE' ? lista.alcalde
      : dignidad === 'URBANO' ? lista.urbano : lista.rural;
    const votos = candidato ? Math.max(0, Number(candidato.total_votos) || 0) : 0;
    return {
      numeroLista: lista.numero,
      color: lista.color,
      nombre: candidato?.nombre ?? referencia.nombre,
      foto: referencia.foto,
      registrado: Boolean(candidato),
      votos,
    };
  });

  const mayor = Math.max(1, ...filas.map(fila => fila.votos));
  const totalVisible = filas.reduce((total, fila) => total + fila.votos, 0);

  return (
    <section className="ev-panel" aria-label="Visualización de votos registrados en tiempo real">
      <div className="ev-panel-topo">
        <div>   
          <span className="ev-eyebrow">CONTEO ELECTORAL</span>
          <h1>Votos en tiempo real</h1>
        </div>
        <div className="ev-total-votos">
          <span>Votos de las listas mostradas</span>
          <strong>{numero(totalVisible)}</strong>
        </div>
      </div>

      <div className="ev-filtros" role="group" aria-label="Dignidad electoral">
        {DIGNIDADES.map(item => (
          <button
            type="button"
            key={item.id}
            className={`ev-filtro ${dignidad === item.id ? 'ev-filtro--activo' : ''}`}
            aria-pressed={dignidad === item.id}
            onClick={() => onCambiarDignidad(item.id)}
          >
            {item.corto}
          </button>
        ))}
      </div>

      <div className="ev-barras" aria-label="Comparación de las listas configuradas">
        {filas.map(fila => {
          // Máximo visual de 72%, para reservar espacio para las fotos y cifras.
          const alto = fila.votos === 0 ? 0 : Math.max(2, (fila.votos / mayor) * 58);
          return (
            <article className="ev-columna" key={fila.numeroLista} aria-label={`Lista ${fila.numeroLista}: ${fila.registrado ? numero(fila.votos) + ' votos' : 'sin registro'}`}>
              <div className="ev-escala">
                <div
                  className="ev-barra"
                  style={{ height: `${alto}%`, backgroundColor: fila.color }}
                  role="img"
                  aria-label={`${fila.nombre}: ${fila.registrado ? numero(fila.votos) + ' votos' : 'sin dato'}`}
                >
                  <div className="ev-cabeza">
                    <strong className="ev-cantidad" aria-live="off">
                      {fila.registrado ? numero(fila.votos) : '—'}
                      <small>votos</small>
                    </strong>
                    <Image
                      src={`${BASE_PATH}/candidatos/${fila.foto}`}
                      alt={`Foto de ${fila.nombre}`}
                      width={72}
                      height={72}
                      className="ev-foto"
                      unoptimized
                    />
                  </div>
                </div>
              </div>
              <div className="ev-pie-barra">
                <strong className="ev-lista" style={{ color: fila.color }}>LISTA {fila.numeroLista}</strong>
                <span className="ev-nombre" title={fila.nombre}>{fila.nombre}</span>
              </div>
            </article>
          );
        })}
      </div>

    </section>
  );
}
