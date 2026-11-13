'use client';

import type { CandidatoResultado, Dignidad } from '../../lib/electoral';
import { TendenciaPanel } from './tendencia-panel';

interface Props {
  candidatos: CandidatoResultado[];
  candidatosAnteriores?: CandidatoResultado[] | null;
  dignidad: Dignidad;
  onDignidadChange: (valor: Dignidad) => void;
}

/** Ranking secundario con el mismo gráfico vertical y sin el filtro «Todos». */
export function GraficoRanking({ candidatos, candidatosAnteriores, dignidad, onDignidadChange }: Props) {
  return (
    <TendenciaPanel
      candidatos={candidatos}
      candidatosAnteriores={candidatosAnteriores}
      dignidad={dignidad}
      onCambiarDignidad={onDignidadChange}
      variante="ranking"
    />
  );
}
