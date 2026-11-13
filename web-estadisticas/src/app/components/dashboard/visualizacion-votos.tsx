'use client';

import type { CandidatoResultado, Dignidad } from '../../lib/electoral';
import { TendenciaPanel } from './tendencia-panel';

interface Props {
  candidatos: CandidatoResultado[];
  dignidad: Dignidad;
  onCambiarDignidad: (valor: Dignidad) => void;
}

/** Pantalla principal de ConteoFast: barras verticales por lista. */
export default function VisualizacionVotos({ candidatos, dignidad, onCambiarDignidad }: Props) {
  return (
    <TendenciaPanel
      candidatos={candidatos}
      dignidad={dignidad}
      onCambiarDignidad={onCambiarDignidad}
      variante="principal"
    />
  );
}
