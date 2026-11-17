import type { CSSProperties } from 'react';
import type { DignidadEspecial, RegistroEspecial } from '../../lib/electoral';
import { numero } from '../../lib/electoral';
import { obtenerEspeciales } from './votos-especiales';

type Props = {
  especiales?: readonly RegistroEspecial[] | null;
  dignidad: DignidadEspecial;
  maximo: number;
  totalGraficado: number;
  juntasConfirmadas: number;
};

/** Nulos y blancos siempre al final; comparten la escala de las listas. */
export function VotosEspecialesColumnas({ especiales, dignidad, maximo, totalGraficado, juntasConfirmadas }: Props) {
  const dato = obtenerEspeciales(especiales, dignidad);
  const grupos = [
    { id: 'nulos', titulo: 'VOTOS NULOS', votos: dato.nulos, color: '#da163a', simbolo: '×' },
    { id: 'blancos', titulo: 'VOTOS BLANCOS', votos: dato.blancos, color: '#23abe6', simbolo: '○' },
  ] as const;

  return <>
    {grupos.map(item => {
      const altura = dato.disponible && maximo > 0 ? (item.votos / maximo) * 72 : 0;
      const porcentaje = dato.disponible && totalGraficado > 0
        ? (item.votos * 100 / totalGraficado).toFixed(1) + '%' : '—';
      const estilo = {
        '--vl-color': item.color,
        '--vl-altura': `${altura.toFixed(2)}%`,
      } as CSSProperties;

      return (
        <article key={item.id} className={`vl-columna vl-columna--especial vl-columna--${item.id} ${item.votos > 0 && dato.disponible ? 'vl-columna--con-votos' : ''}`}
          role="listitem" style={estilo}
          aria-label={`${item.titulo}: ${dato.disponible ? numero(item.votos) + ' votos' : 'dato no recibido'}`}>
          <div className="vl-trazado">
            <div className="vl-altura-contenido">
              <div className="vl-numero-votos">
                <strong>{dato.disponible ? numero(item.votos) : '—'}</strong>
                <small>{dato.disponible ? 'votos' : 'sin dato'}</small>
              </div>
              <div className="vl-barra-vertical" aria-hidden="true"><span /></div>
            </div>
          </div>
          <div className="vl-identidad">
            <span className="vl-avatar vl-avatar--especial" aria-hidden="true">{item.simbolo}</span>
            <strong className="vl-numero-lista">{item.titulo}</strong>
            <span className="vl-porcentaje">{porcentaje}</span>
          </div>
        </article>
      );
    })}
  </>;
}
