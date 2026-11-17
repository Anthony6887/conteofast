import type { DashboardDatos, DignidadEspecial, RegistroEspecial } from './electoral';

type Objeto = Record<string, unknown>;
const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const noNegativo = (valor: unknown): number => {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? Math.max(0, numero) : 0;
};

/** Comprueba la respuesta HTTP ANTES de enviarla a React. */
export function normalizarDashboard(respuesta: unknown): DashboardDatos {
  if (!esObjeto(respuesta) || respuesta.ok !== true || !esObjeto(respuesta.data)) {
    throw new Error(esObjeto(respuesta) && typeof respuesta.message === 'string'
      ? respuesta.message : 'La API no devolvió una respuesta válida.');
  }
  const bruto = respuesta.data;
  if (!Array.isArray(bruto.candidatos)) {
    throw new Error('La API respondió, pero data.candidatos no existe o no es un arreglo. Revisa /api/dashboard.');
  }
  const candidatos = bruto.candidatos.filter(esObjeto).map(item => ({
    ...item,
    nombre: String(item.nombre ?? ''),
    numero_lista: item.numero_lista == null ? null : String(item.numero_lista),
    total_votos: noNegativo(item.total_votos),
  }));
  const juntasPorParroquia = Array.isArray(bruto.juntas_por_parroquia)
    ? bruto.juntas_por_parroquia.filter(esObjeto).map(item => ({
      parroquia: String(item.parroquia ?? ''),
      juntas: noNegativo(item.juntas),
    }))
    : [];

  // Si el backend anterior no envía especiales, no fabricar ceros.
  const permitidas = new Set<DignidadEspecial>(['ALCALDE', 'URBANO', 'RURAL', 'VOCAL']);
  const especiales: RegistroEspecial[] | undefined = noNegativo(bruto.juntas_confirmadas) === 0
    ? (['ALCALDE', 'URBANO', 'RURAL', 'VOCAL'] as DignidadEspecial[]).map(dignidad => ({
      dignidad, nulos: 0, blancos: 0, disponible: true,
    }))
    : Array.isArray(bruto.especiales)
      ? bruto.especiales.filter(esObjeto).flatMap(item => {
        const dignidad = String(item.dignidad ?? '').trim().toUpperCase() as DignidadEspecial;
        if (!permitidas.has(dignidad)) return [];
        return [{
          dignidad,
          nulos: noNegativo(item.nulos),
          blancos: noNegativo(item.blancos),
          disponible: item.disponible === true,
        }];
      })
      : undefined;

  return {
    ...bruto,
    eleccion_id: noNegativo(bruto.eleccion_id),
    juntas_confirmadas: noNegativo(bruto.juntas_confirmadas),
    juntas_total: noNegativo(bruto.juntas_total),
    recintos_total: noNegativo(bruto.recintos_total),
    parroquias_total: noNegativo(bruto.parroquias_total),
    consultado_en: typeof bruto.consultado_en === 'string'
      ? bruto.consultado_en : new Date().toISOString(),
    juntas_por_parroquia: juntasPorParroquia,
    candidatos,
    especiales,
  } as DashboardDatos;
}
