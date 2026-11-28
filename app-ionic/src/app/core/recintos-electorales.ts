/** Catálogo transcrito de los dos Excel suministrados (16-11-2026).
 * Los datos son límites y clasificación de referencia; la API debe confirmar
 * el padrón oficial de CADA junta y el código CNE del recinto.
 */
export type AmbitoRecinto = 'URBANO' | 'RURAL';

export interface RecintoElectoral {
  codigo: number;
  ambito: AmbitoRecinto;
  parroquia: string;
  nombre: string;
  electores: number;
  juntasF: number;
  juntasM: number;
}

/** El padrón exacto de cada junta debe proceder de la API; no se estima con promedios. */
export const RECINTOS_ELECTORALES: readonly RecintoElectoral[] = [
  {
    "codigo": 934,
    "ambito": "URBANO",
    "parroquia": "PELILEO",
    "nombre": "ESCUELA DE EDUCACION BASICA GABRIELA MISTRAL",
    "electores": 3500,
    "juntasF": 5,
    "juntasM": 5
  },
  {
    "codigo": 852,
    "ambito": "URBANO",
    "parroquia": "PELILEO",
    "nombre": "UNIDAD EDUCATIVA JOAQUIN ARIAS",
    "electores": 4900,
    "juntasF": 7,
    "juntasM": 7
  },
  {
    "codigo": 1110,
    "ambito": "URBANO",
    "parroquia": "PELILEO",
    "nombre": "UNIDAD EDUCATIVA DOMINGO FAUSTINO SARMIENTO",
    "electores": 4200,
    "juntasF": 6,
    "juntasM": 6
  },
  {
    "codigo": 1678,
    "ambito": "URBANO",
    "parroquia": "PELILEO",
    "nombre": "UNIDAD EDUCATIVA MARIANO BENITEZ",
    "electores": 6300,
    "juntasF": 9,
    "juntasM": 9
  },
  {
    "codigo": 6507,
    "ambito": "URBANO",
    "parroquia": "PELILEO",
    "nombre": "UNIDAD EDUCATIVA JOSE IGNACIO ORDOÑEZ",
    "electores": 3150,
    "juntasF": 5,
    "juntasM": 4
  },
  {
    "codigo": 7917,
    "ambito": "URBANO",
    "parroquia": "PELILEO",
    "nombre": "UNIDAD EDUCATIVA PELILEO",
    "electores": 2628,
    "juntasF": 5,
    "juntasM": 3
  },
  {
    "codigo": 5355,
    "ambito": "URBANO",
    "parroquia": "PELILEO GRANDE /R. MINO",
    "nombre": "UNIDAD EDUCATIVA NACIONES UNIDAS",
    "electores": 1252,
    "juntasF": 2,
    "juntasM": 2
  },
  {
    "codigo": 2872,
    "ambito": "RURAL",
    "parroquia": "SALASACA",
    "nombre": "UNIDAD EDUCATIVA FRAY BARTOLOME DE LAS CASAS BLOQUE 1",
    "electores": 4200,
    "juntasF": 6,
    "juntasM": 6
  },
  {
    "codigo": 3320,
    "ambito": "RURAL",
    "parroquia": "SALASACA",
    "nombre": "UNIDAD EDUCATIVA MANZANAPAMBA",
    "electores": 577,
    "juntasF": 1,
    "juntasM": 1
  },
  {
    "codigo": 2886,
    "ambito": "RURAL",
    "parroquia": "BOLIVAR",
    "nombre": "ESCUELA DE EDUCACION BASICA ABDON CALDERON",
    "electores": 1400,
    "juntasF": 2,
    "juntasM": 2
  },
  {
    "codigo": 3328,
    "ambito": "RURAL",
    "parroquia": "BOLIVAR",
    "nombre": "COLISEO GAD PARROQUIAL BOLIVAR",
    "electores": 878,
    "juntasF": 2,
    "juntasM": 2
  },
  {
    "codigo": 2883,
    "ambito": "RURAL",
    "parroquia": "COTALO",
    "nombre": "UNIDAD EDUCATIVA COTALO",
    "electores": 1854,
    "juntasF": 3,
    "juntasM": 3
  },
  {
    "codigo": 2884,
    "ambito": "RURAL",
    "parroquia": "CHIQUICHA",
    "nombre": "UNIDAD EDUCATIVA DOCTOR BENIGNO MALO",
    "electores": 1898,
    "juntasF": 3,
    "juntasM": 3
  },
  {
    "codigo": 1688,
    "ambito": "RURAL",
    "parroquia": "EL ROSARIO /RUMICHACA",
    "nombre": "UNIDAD EDUCATIVA EUGENIO ESPEJO",
    "electores": 2417,
    "juntasF": 4,
    "juntasM": 4
  },
  {
    "codigo": 3418,
    "ambito": "RURAL",
    "parroquia": "GARCIA MORENO",
    "nombre": "COLISEO GAD GARCIA MORENO",
    "electores": 1245,
    "juntasF": 2,
    "juntasM": 2
  },
  {
    "codigo": 5428,
    "ambito": "RURAL",
    "parroquia": "GARCIA MORENO",
    "nombre": "UNIDAD EDUCATIVA EUCLIDES BARRERA EX ESCUELA MIGUEL DE CERVANTES",
    "electores": 1750,
    "juntasF": 3,
    "juntasM": 2
  },
  {
    "codigo": 1690,
    "ambito": "RURAL",
    "parroquia": "HUAMBALO",
    "nombre": "ESCUELA DE EDUCACION BASICA 12 DE OCTUBRE",
    "electores": 3468,
    "juntasF": 5,
    "juntasM": 5
  },
  {
    "codigo": 1701,
    "ambito": "RURAL",
    "parroquia": "HUAMBALO",
    "nombre": "UNIDAD EDUCATIVA HUAMBALO",
    "electores": 3500,
    "juntasF": 5,
    "juntasM": 5
  },
  {
    "codigo": 2861,
    "ambito": "RURAL",
    "parroquia": "BENITEZ /PACHANLICA",
    "nombre": "UNIDAD EDUCATIVA MARIANO BENITEZ TORRES",
    "electores": 2071,
    "juntasF": 3,
    "juntasM": 3
  }
] as const;

export const LISTAS_ALCALDES: readonly string[] = ["3", "4", "6-8", "7", "18", "20", "21", "61", "62"];

export const LISTAS_CONCEJALES: Record<AmbitoRecinto, readonly string[]> = {
  "URBANO": [
    "3",
    "4",
    "6-8",
    "7",
    "18",
    "20",
    "21",
    "61",
    "62"
  ],
  "RURAL": [
    "1",
    "3",
    "6-8",
    "7",
    "18",
    "20",
    "21",
    "61",
    "62"
  ]
} as const;

export const RECINTOS_POR_CODIGO: ReadonlyMap<number, RecintoElectoral> =
  new Map(RECINTOS_ELECTORALES.map(recinto => [recinto.codigo, recinto]));


/** Listas de vocales según la matriz entregada, por código oficial de recinto.
 * EL ROSARIO: lista 6-8 confirmada por el usuario (corrige 6-9).
 * Los candidatos son votos por lista, no nombres de personas.
 */
export const VOCALES_POR_RECINTO: Readonly<Record<number, readonly string[]>> = {
  "1688": [
    "6-8",
    "7",
    "18",
    "20",
    "62"
  ],
  "1690": [
    "3",
    "6-8",
    "7",
    "20",
    "62"
  ],
  "1701": [
    "3",
    "6-8",
    "7",
    "20",
    "62"
  ],
  "2861": [
    "3",
    "4",
    "7",
    "18",
    "62"
  ],
  "2872": [
    "4",
    "6-8",
    "18",
    "62"
  ],
  "2883": [
    "6-8",
    "7",
    "20",
    "62"
  ],
  "2884": [
    "3",
    "6-8",
    "7",
    "20",
    "62"
  ],
  "2886": [
    "3",
    "6-8",
    "7",
    "18",
    "20",
    "61",
    "62"
  ],
  "3320": [
    "4",
    "6-8",
    "18",
    "62"
  ],
  "3328": [
    "3",
    "6-8",
    "7",
    "18",
    "20",
    "61",
    "62"
  ],
  "3418": [
    "3",
    "6-8",
    "7",
    "18",
    "20",
    "61",
    "62"
  ],
  "5428": [
    "3",
    "6-8",
    "7",
    "18",
    "20",
    "61",
    "62"
  ]
} as const;
