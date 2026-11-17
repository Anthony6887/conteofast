import type { DignidadEspecial, RegistroEspecial } from '../../lib/electoral';
export type { DignidadEspecial, RegistroEspecial } from '../../lib/electoral';

export interface TotalesEspeciales {
  nulos: number;
  blancos: number;
  disponible: boolean;
}

/** Una fila agregada por dignidad; no mezcla concejalías urbanas y rurales. */
export function obtenerEspeciales(
  registros: readonly RegistroEspecial[] | null | undefined,
  dignidad: DignidadEspecial,
): TotalesEspeciales {
  const fila = registros?.find(x => x.dignidad === dignidad);
  if (!fila || !fila.disponible) return { nulos: 0, blancos: 0, disponible: false };
  const seguro = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  };
  return { nulos: seguro(fila.nulos), blancos: seguro(fila.blancos), disponible: true };
}
