import Image from 'next/image';
import {
  BASE_PATH, DIGNIDADES, LISTAS, numero, obtenerCandidato,
  porcentaje,
} from '../../lib/electoral';
import type { CandidatoResultado, Dignidad } from '../../lib/electoral';

interface Props {
  candidatos: CandidatoResultado[];
  candidatosAnteriores?: CandidatoResultado[] | null;
  dignidad: Dignidad;
  onDignidadChange: (dignidad: Dignidad) => void;
}

export function GraficoRanking({ candidatos, candidatosAnteriores, dignidad, onDignidadChange }: Props) {
  const filas = LISTAS.map(lista => {
    const actual = obtenerCandidato(candidatos, lista, dignidad);
    const anterior = candidatosAnteriores
      ? obtenerCandidato(candidatosAnteriores, lista, dignidad)
      : null;
    const referencia = dignidad === 'ALCALDE' ? lista.alcalde
      : dignidad === 'URBANO' ? lista.urbano : lista.rural;
    const votos = Number(actual?.total_votos ?? 0);
    const votosPrevios = anterior ? Number(anterior.total_votos ?? 0) : null;
    return {
      lista,
      candidato: actual,
      nombre: actual?.nombre ?? referencia.nombre,
      foto: referencia.foto,
      votos,
      // Muestra diferencias solo cuando hay una lectura previa para ese candidato.
      diferencia: votosPrevios === null ? null : votos - votosPrevios,
    };
  }).sort((a, b) => b.votos - a.votos);

  const totalVisible = filas.reduce((suma, fila) => suma + fila.votos, 0);
  const mayor = Math.max(...filas.map(fila => fila.votos), 1);

  return (
    <section className="panel grafico-panel rt-ranking" aria-label="Barras de votos por candidato">
      <div className="panel-encabezado">
        <div>
          <div className="eyebrow">COMPARATIVO EN DIRECTO</div>
          <h2>Votos por candidato</h2>
          <p className="descripcion-panel">Actualización de barras con cada respuesta nueva de la API.</p>
        </div>
        <span className="mini-cifra">{numero(totalVisible)} votos</span>
      </div>

      <div className="filtros-dignidad" role="group" aria-label="Seleccionar dignidad">
        {DIGNIDADES.map(item => (
          <button
            key={item.id}
            type="button"
            className={item.id === dignidad ? 'filtro activo' : 'filtro'}
            aria-pressed={item.id === dignidad}
            onClick={() => onDignidadChange(item.id)}>
            {item.corto}
          </button>
        ))}
      </div>

      <div className="barras-ranking">
        {filas.map((fila, indice) => (
          <div className="ranking-fila rt-ranking-fila" key={fila.lista.numero}>
            <div className="ranking-perfil">
              <div className="ranking-posicion">{indice + 1}</div>
              <Image
                className="avatar avatar-sm"
                src={`${BASE_PATH}/candidatos/${fila.foto}`}
                width={40}
                height={40}
                alt={`Fotografía de ${fila.nombre}`}
                unoptimized
              />
              <div className="ranking-identidad">
                <strong title={fila.nombre}>{fila.nombre}</strong>
                <span>Lista {fila.lista.numero}</span>
              </div>
              <div className="ranking-valor">
                <strong>{fila.candidato ? numero(fila.votos) : '—'}</strong>
                {fila.candidato && fila.diferencia !== null && fila.diferencia !== 0 && (
                  <em className={fila.diferencia > 0 ? 'rt-variacion rt-variacion--sube' : 'rt-variacion rt-variacion--baja'}>
                    {fila.diferencia > 0 ? '+' : '−'}{numero(Math.abs(fila.diferencia))}
                  </em>

                )}
              </div>
            </div>
            <div className="barra-fondo rt-barra-fondo">
              <div
                className="barra-progreso rt-barra-progreso"
                style={{ width: `${porcentaje(fila.votos, mayor)}%`, backgroundColor: fila.lista.color }}
                role="img"
                aria-label={`${fila.nombre}: ${numero(fila.votos)} votos`}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="panel-pie">
        Porcentajes sobre las {LISTAS.length} listas mostradas en esta dignidad. Las variaciones (+/−)
        indican cambios respecto de la última consulta completada, no una proyección.
      </p>
    </section>
  );
}
