'use client';

import { IndicadorCobertura } from './indicador-cobertura';
import { TarjetaLista } from './tarjeta-lista';
import {
  LISTAS,
  numero,
  votosDignidad,
  porcentaje,
  porcentajeTexto
} from '../../lib/electoral';
import type { DashboardDatos } from '../../lib/electoral';

type Props = { datos: DashboardDatos };

function Caja({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="ev-resumen-kpi">
      <span>{titulo}</span>
      <strong>{valor}</strong>
      {nota && <small>{nota}</small>}
    </div>
  );
}

/** Pantalla separada del gráfico principal: estadísticas y tarjetas existentes. */
export default function ResumenElectoral({ datos }: Props) {
  const avance = porcentaje(datos.juntas_confirmadas ?? 0, datos.juntas_total ?? 0);
  const candidatos = Array.isArray(datos?.candidatos)
    ? datos.candidatos
    : [];

  const adicionales = candidatos.filter(
    candidato =>
      candidato.numero_lista &&
      !LISTAS.some(
        lista =>
          String(lista.numero) === String(candidato.numero_lista)
      )
  ).length;

  return (
    <div className="ev-pagina-resumen">
      <header className="ev-resumen-encabezado">
        <span className="ev-eyebrow">ESTADÍSTICAS</span>
        <h1>Resumen electoral</h1>
        <p>Seguimiento de votos registrados y avance de juntas. Información no oficial.</p>
      </header>

      <section className="ev-resumen-kpis" aria-label="Resumen de votos y juntas">
        <Caja titulo="Votos · Alcalde" valor={numero(votosDignidad(candidatos, 'ALCALDE'))} />
        <Caja titulo="Votos · Concejales urbanos" valor={numero(votosDignidad(candidatos, 'URBANO'))} />
        <Caja titulo="Votos · Concejales rurales" valor={numero(votosDignidad(candidatos, 'RURAL'))} />
        <Caja titulo="Juntas confirmadas" valor={`${numero(datos.juntas_confirmadas)} / ${numero(datos.juntas_total)}`} nota={`${porcentajeTexto(avance)} completado`} />
      </section>

      <div className="ev-resumen-cobertura">
        <IndicadorCobertura registradas={datos.juntas_confirmadas} total={datos.juntas_total} />
      </div>

      <section className="seccion-listas ev-resumen-listas">
        <div className="seccion-titulo">
          <div><h2>Candidatos y concejales</h2></div>
          <div className="pildora-listas">{LISTAS.length} listas</div>
        </div>
        <div className="listas-grid">
          {LISTAS.map(lista => (
            <TarjetaLista key={lista.numero} lista={lista} candidatos={candidatos} />
          ))}
        </div>
        {adicionales > 0 && (
          <p className="ev-nota">La API también devuelve {numero(adicionales)} candidato(s) de otras listas no configuradas para este panel.</p>
        )}
      </section>
    </div>
  );
}
