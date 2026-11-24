export const PARROQUIAS_VOCALES = [
  { id: 'salasaca', nombre: 'Salasaca', recintos: [2872, 3320], juntas: 14, electores: 4777 },
  { id: 'bolivar', nombre: 'Bolívar', recintos: [2886, 3328], juntas: 8, electores: 2278 },
  { id: 'cotalo', nombre: 'Cotaló', recintos: [2883], juntas: 6, electores: 1854 },
  { id: 'chiquicha', nombre: 'Chiquicha', recintos: [2884], juntas: 6, electores: 1898 },
  { id: 'rosario', nombre: 'El Rosario / Rumichaca', recintos: [1688], juntas: 8, electores: 2417 },
  { id: 'garcia-moreno', nombre: 'García Moreno', recintos: [3418, 5428], juntas: 9, electores: 2995 },
  { id: 'huambalo', nombre: 'Huambaló', recintos: [1690, 1701], juntas: 20, electores: 6968 },
  { id: 'benitez', nombre: 'Benítez / Pachanlica', recintos: [2861], juntas: 6, electores: 2071 },
] as const;
export interface VocalesParroquia {
  parroquia: string;
  eleccion_id: number;
  juntas_total: number;
  juntas_confirmadas: number;
  votos: { candidato_id: number; votos: number }[];
  nulos: number;
  blancos: number;
  consultado_en: string;
}
