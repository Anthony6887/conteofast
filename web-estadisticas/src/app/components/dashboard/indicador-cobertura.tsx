import { numero, porcentaje } from '../../lib/electoral';

interface Props {
  registradas: number;
  total: number;
  recintos?: number | null;
  parroquias?: number | null;
}

export function IndicadorCobertura({ registradas, total, recintos, parroquias }: Props) {
  const completado = porcentaje(registradas, total);
  const pendientes = Math.max(total - registradas, 0);
  const estilo = {
    background: `conic-gradient(#163f77 0 ${completado}%, #e8eef7 ${completado}% 100%)`,
  };

  return (
    <section className="panel panel-cobertura" aria-label="Cobertura de juntas confirmadas">
      <div className="panel-encabezado">
        <div>
          <div className="eyebrow">COBERTURA DE CAPTURA</div>
          <h2>Avance por juntas</h2>
          <p className="descripcion-panel">Registros confirmados / juntas del catálogo</p>
        </div>
      </div>
      <div className="cobertura-cuerpo">
        <div className="cobertura-datos">
          <div><span className="leyenda-punto registrado" /> <span>Registradas</span> <strong>{numero(registradas)}</strong></div>
          <div><span className="leyenda-punto pendiente" /> <span>Pendientes</span> <strong>{numero(pendientes)}</strong></div>
          <div className="cobertura-total"><span>Total de juntas</span><strong>{numero(total)}</strong></div>
        </div>
      </div>
      {(recintos != null || parroquias != null) && (
        <div className="cobertura-pie">
          {recintos != null && <span>{numero(recintos)} recintos</span>}
          {parroquias != null && <span>{numero(parroquias)} parroquias/sectores</span>}
        </div>
      )}
    </section>
  );
}
