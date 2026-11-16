'use client';

import { IndicadorCobertura } from './indicador-cobertura';
import { agruparPorListas, totalVotos, type TipoEscenario } from '../../lib/visualizacion-en-vivo';
import { numero } from '../../lib/electoral';
import type { DashboardDatos } from '../../lib/electoral';
import type { DatosRecintos } from '../../lib/recintos-estado';
import RevisionActas from './revision-actas';

type Props = {
  datos: DashboardDatos | null;
  recintos: DatosRecintos | null;
  errorRecintos: string;
  cargandoRecintos: boolean;
  onActualizar: () => void;
};
const TIPOS: { id: TipoEscenario; nombre: string; icono: string }[] = [
  { id: 'ALCALDE', nombre: 'Alcaldía', icono: '◉' },
  { id: 'URBANO', nombre: 'Concejales urbanos', icono: '▥' },
  { id: 'RURAL', nombre: 'Concejales rurales', icono: '▥' },
  { id: 'VOCAL', nombre: 'Vocales parroquiales', icono: '▤' },
];

export default function ResumenElectoral({ datos, recintos, errorRecintos, cargandoRecintos, onActualizar }: Props) {
  const candidatos = datos?.candidatos || [];
  return <div className="ev-pagina-resumen ar-resumen-pagina">

    <RevisionActas datos={recintos} candidatos={candidatos} cargando={cargandoRecintos}
      error={errorRecintos} onActualizar={onActualizar} />
    <style jsx>{`
      .ar-resumen-pagina{display:grid;gap:15px;min-width:0}
      .ar-resumen-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .ar-resumen-kpi{display:flex;flex-direction:column;min-width:0;gap:6px;background:#fff;padding:16px;border:1px solid #dce7f4;border-radius:13px}
      .ar-resumen-kpi>span{font-size:11px;font-weight:800;color:#526e90;display:flex;gap:7px;align-items:center}
      .ar-resumen-kpi>span i{font-style:normal;font-size:15px;color:#3471ac}
      .ar-resumen-kpi strong{font-size:clamp(20px,2.2vw,30px);color:#1b467f;font-variant-numeric:tabular-nums}
      .ar-resumen-kpi small{font-size:10px;color:#8491a4}
      @media (max-width:850px){.ar-resumen-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (max-width:430px){.ar-resumen-kpis{gap:7px}.ar-resumen-kpi{padding:11px}}
    `}</style>
  </div>;
}
