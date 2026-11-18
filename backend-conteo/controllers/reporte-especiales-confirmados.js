'use strict';

/**
 * ConteoFast - Votos nulos y blancos para /api/conteofast/resumen.
 *
 * Un registro de junta puede contener solo algunas dignidades guardadas.
 * No se debe considerar a todas las dignidades como registradas simplemente
 * porque cf_registros.estado = 'CONFIRMADO'.
 *
 * Fuentes de verdad:
 *   - cf_registro_dignidad_guardados: identifica las dignidades realmente
 *     guardadas con el flujo nuevo (ALCALDE, CONCEJAL, VOCAL).
 *   - cf_registro_especiales: contiene los valores nulos/blancos por dignidad.
 *   - Para registros históricos SIN NINGÚN marcador en guardados, se conserva
 *     la compatibilidad con el flujo antiguo, que guardaba la junta completa.
 *
 * La información solo se lee. No altera votos, fotos, cierres ni tablas.
 */
async function consultarEspecialesConfirmados({ sequelize, QueryTypes, eleccionId, recintos }) {
  const id = Number(eleccionId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Elección inválida para consultar votos especiales.');
  }

  const opciones = { type: QueryTypes.SELECT, replacements: { eleccionId: id } };
  const [registros, guardados, especiales] = await Promise.all([
    // Registro base: se requiere estado CONFIRMADO, pero este no implica
    // que todas sus dignidades estén guardadas.
    sequelize.query(`
      SELECT cr.id AS registro_id, rc.codigo_recinto
      FROM cf_registros cr
      JOIN juntas j ON j.id = cr.junta_id
      JOIN recintos rc ON rc.id = j.recinto_id
      WHERE cr.eleccion_id = :eleccionId
        AND cr.estado = 'CONFIRMADO'
    `, opciones),

    sequelize.query(`
      SELECT g.registro_id, g.tipo
      FROM cf_registro_dignidad_guardados g
      JOIN cf_registros cr ON cr.id = g.registro_id
      WHERE cr.eleccion_id = :eleccionId
        AND cr.estado = 'CONFIRMADO'
        AND g.tipo IN ('ALCALDE', 'CONCEJAL', 'VOCAL')
    `, opciones),

    sequelize.query(`
      SELECT e.registro_id, e.tipo, e.nulos, e.blancos
      FROM cf_registro_especiales e
      JOIN cf_registros cr ON cr.id = e.registro_id
      WHERE cr.eleccion_id = :eleccionId
        AND cr.estado = 'CONFIRMADO'
        AND e.tipo IN ('ALCALDE', 'CONCEJAL', 'VOCAL')
    `, opciones),
  ]);

  const salidas = ['ALCALDE', 'URBANO', 'RURAL', 'VOCAL'];
  const acumulados = Object.fromEntries(salidas.map(dignidad => [dignidad, {
    dignidad, nulos: 0, blancos: 0, esperados: 0, encontrados: 0, invalido: false,
  }]));

  const codigo = valor => {
    const n = Number(valor);
    return Number.isSafeInteger(n) && n > 0
      ? String(n) : String(valor ?? '').trim();
  };
  const ambitoDe = valor => String(recintos?.[codigo(valor)]?.ambito ?? '').toUpperCase();
  const identificador = valor => String(valor ?? '').trim();
  const enteroValido = valor => {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null;
    const n = Number(valor);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  };
  const destinoDe = (tipo, ambito) => {
    if (tipo === 'ALCALDE') return 'ALCALDE';
    if (tipo === 'CONCEJAL') return ambito;
    if (tipo === 'VOCAL' && ambito === 'RURAL') return 'VOCAL';
    return null;
  };

  const guardadosPorRegistro = new Map();
  for (const fila of guardados) {
    const registroId = identificador(fila.registro_id);
    const tipo = String(fila.tipo ?? '').trim().toUpperCase();
    if (!registroId || !['ALCALDE', 'CONCEJAL', 'VOCAL'].includes(tipo)) continue;
    if (!guardadosPorRegistro.has(registroId)) guardadosPorRegistro.set(registroId, new Set());
    guardadosPorRegistro.get(registroId).add(tipo);
  }

  const extrasPorRegistro = new Map();
  for (const fila of especiales) {
    const registroId = identificador(fila.registro_id);
    const tipo = String(fila.tipo ?? '').trim().toUpperCase();
    if (!registroId || !['ALCALDE', 'CONCEJAL', 'VOCAL'].includes(tipo)) continue;
    if (!extrasPorRegistro.has(registroId)) extrasPorRegistro.set(registroId, new Map());
    // Una fila por (registro_id, tipo) según la clave única esperada.
    if (extrasPorRegistro.get(registroId).has(tipo)) {
      // Se marcará como información ambigua, en lugar de duplicar los votos.
      extrasPorRegistro.get(registroId).set(tipo, null);
    } else {
      extrasPorRegistro.get(registroId).set(tipo, fila);
    }
  }

  const avisos = new Set();
  for (const registro of registros) {
    const registroId = identificador(registro.registro_id);
    const ambito = ambitoDe(registro.codigo_recinto);
    if (ambito !== 'URBANO' && ambito !== 'RURAL') {
      avisos.add(codigo(registro.codigo_recinto) || '(sin código)');
      continue;
    }

    const marcados = guardadosPorRegistro.get(registroId);
    // Con la interfaz nueva se exige exclusivamente lo que se guardó.
    // Solo un registro que nunca usó ese flujo se interpreta como legado.
    const tiposEsperados = marcados && marcados.size > 0
      ? marcados
      : new Set(ambito === 'RURAL'
        ? ['ALCALDE', 'CONCEJAL', 'VOCAL']
        : ['ALCALDE', 'CONCEJAL']);

    for (const tipo of tiposEsperados) {
      const destino = destinoDe(tipo, ambito);
      if (!destino || !acumulados[destino]) continue;
      const salida = acumulados[destino];
      salida.esperados += 1;

      const extra = extrasPorRegistro.get(registroId)?.get(tipo);
      if (!extra) continue;
      const nulos = enteroValido(extra.nulos);
      const blancos = enteroValido(extra.blancos);
      if (nulos === null || blancos === null) {
        salida.invalido = true;
        continue;
      }
      salida.encontrados += 1;
      salida.nulos += nulos;
      salida.blancos += blancos;
    }
  }

  if (avisos.size > 0) {
    console.warn('[ConteoFast especiales] Recintos sin ámbito oficial:', [...avisos].join(', '));
  }

  return salidas.map(dignidad => {
    const dato = acumulados[dignidad];
    return {
      dignidad,
      nulos: dato.nulos,
      blancos: dato.blancos,
      // Sin dignidades registradas para este escenario: total real cero.
      // Si falta un detalle esperado: no se presenta un total incompleto.
      disponible: !dato.invalido && dato.encontrados === dato.esperados,
    };
  });
}

module.exports = { consultarEspecialesConfirmados };
