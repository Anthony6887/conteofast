export type DignidadIndice = 'GENERAL' | 'ALCALDE' | 'CONCEJAL' | 'VOCAL';
export interface ActaIndice { dignidad: DignidadIndice; sha256: string; actualizado_en: string; finalizada: boolean | null }
export type IndiceActas = Record<string, ActaIndice[]>;
const tipos = new Set(['GENERAL', 'ALCALDE', 'CONCEJAL', 'VOCAL']);
function objeto(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Índice de actas inválido.');
  return v as Record<string, unknown>;
}
/** Normaliza exclusivamente los campos de revisión; no confía en rutas devueltas. */
export function normalizarIndiceActas(valor: unknown): IndiceActas {
  const json = objeto(valor);
  const data = objeto(json.data);
  if (json.ok !== true || !Array.isArray(data.recintos)) throw new Error('Índice de actas inválido.');
  const indice: IndiceActas = {};
  for (const item of data.recintos) {
    const recinto = objeto(item);
    if (!Array.isArray(recinto.juntas)) throw new Error('Juntas del índice inválidas.');
    for (const itemJunta of recinto.juntas) {
      const junta = objeto(itemJunta);
      const id = String(junta.id);
      if (!/^[1-9]\d{0,8}$/.test(id) || !Array.isArray(junta.actas)) throw new Error('Junta del índice inválida.');
      const actas = new Map<DignidadIndice, ActaIndice>();
      for (const itemActa of junta.actas) {
        const acta = objeto(itemActa);
        const dignidad = String(acta.dignidad) as DignidadIndice;
        if (!tipos.has(dignidad)) throw new Error('Dignidad del índice inválida.');
        const sha256 = String(acta.sha256 ?? '');
        if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('Huella de acta inválida.');
        actas.set(dignidad, { dignidad, sha256, actualizado_en: String(acta.actualizado_en ?? ''),
          finalizada: typeof acta.finalizada === 'boolean' ? acta.finalizada : null });
      }
      if (actas.size) indice[id] = [...actas.values()].sort((a,b) => a.dignidad.localeCompare(b.dignidad));
    }
  }
  return indice;
}
