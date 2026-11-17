'use strict';

/**
 * Lee SOLO actas confirmadas. Una fila por escenario de la pantalla:
 * ALCALDE, URBANO, RURAL, VOCAL.
 *
 * Reglas:
 * - Sin actas confirmadas en una dignidad: valor real acumulado = 0.
 * - Con actas, pero sin todos los registros de especiales: disponible=false.
 * - Concejalía urbana/rural se diferencia por codigo_recinto, usando el
 *   catálogo oficial local. No se deduce del nombre de la parroquia.
 * - No modifica tablas, cierres, actas ni votos.
 */
async function consultarEspecialesConfirmados({ sequelize, QueryTypes, eleccionId, recintos }) {
  const id = Number(eleccionId);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error('Elección inválida para consultar votos especiales.');
  }

  const opciones = { type: QueryTypes.SELECT, replacements: { eleccionId: id } };
  const [juntas, especiales] = await Promise.all([
    sequelize.query(`
      SELECT rc.codigo_recinto, COUNT(DISTINCT cr.id) AS confirmadas
      FROM cf_registros cr
      JOIN juntas j ON j.id = cr.junta_id
      JOIN recintos rc ON rc.id = j.recinto_id
      WHERE cr.eleccion_id = :eleccionId AND cr.estado = 'CONFIRMADO'
      GROUP BY rc.codigo_recinto
    `, opciones),
    sequelize.query(`
      SELECT rc.codigo_recinto, e.tipo,
             COUNT(DISTINCT e.registro_id) AS registros,
             COALESCE(SUM(e.nulos), 0) AS nulos,
             COALESCE(SUM(e.blancos), 0) AS blancos
      FROM cf_registro_especiales e
      JOIN cf_registros cr ON cr.id = e.registro_id
      JOIN juntas j ON j.id = cr.junta_id
      JOIN recintos rc ON rc.id = j.recinto_id
      WHERE cr.eleccion_id = :eleccionId
        AND cr.estado = 'CONFIRMADO'
        AND e.tipo IN ('ALCALDE', 'CONCEJAL', 'VOCAL')
      GROUP BY rc.codigo_recinto, e.tipo
    `, opciones),
  ]);

  const dignidades = ['ALCALDE', 'URBANO', 'RURAL', 'VOCAL'];
  const salida = Object.fromEntries(dignidades.map(dignidad => [dignidad, {
    dignidad, nulos: 0, blancos: 0, registros: 0, confirmadas: 0,
  }]));
  const seguro = valor => {
    const n = Number(valor);
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  };
  const codigo = valor => {
    const n = Number(valor);
    return Number.isSafeInteger(n) && n > 0 ? String(n) : String(valor ?? '').trim();
  };
  const ambitoDe = valor => String(recintos?.[codigo(valor)]?.ambito ?? '').toUpperCase();
  const avisos = new Set();

  // Identificar cuántas actas DEBERÍAN tener fila de especiales por dignidad.
  for (const junta of juntas) {
    const clave = codigo(junta.codigo_recinto);
    const ambito = ambitoDe(junta.codigo_recinto);
    const cantidad = seguro(junta.confirmadas);
    if (ambito !== 'URBANO' && ambito !== 'RURAL') {
      avisos.add(clave || '(sin código)');
      continue;
    }
    salida.ALCALDE.confirmadas += cantidad;
    salida[ambito].confirmadas += cantidad;
    if (ambito === 'RURAL') salida.VOCAL.confirmadas += cantidad;
  }

  for (const fila of especiales) {
    const clave = codigo(fila.codigo_recinto);
    const ambito = ambitoDe(fila.codigo_recinto);
    const tipo = String(fila.tipo ?? '').trim().toUpperCase();
    if (ambito !== 'URBANO' && ambito !== 'RURAL') {
      avisos.add(clave || '(sin código)');
      continue;
    }
    let destino;
    if (tipo === 'ALCALDE') destino = 'ALCALDE';
    if (tipo === 'CONCEJAL') destino = ambito;
    if (tipo === 'VOCAL' && ambito === 'RURAL') destino = 'VOCAL';
    if (!destino) continue;
    salida[destino].nulos += seguro(fila.nulos);
    salida[destino].blancos += seguro(fila.blancos);
    salida[destino].registros += seguro(fila.registros);
  }
  if (avisos.size > 0) {
    console.warn('[ConteoFast especiales] Códigos sin ámbito configurado:', [...avisos].join(', '));
  }
  return dignidades.map(dignidad => {
    const x = salida[dignidad];
    // Cero actas => cero votos, dato válido. Actas incompletas => no inventar 0.
    return {
      dignidad: x.dignidad,
      nulos: x.nulos,
      blancos: x.blancos,
      disponible: x.confirmadas === 0 || x.registros >= x.confirmadas,
    };
  });
}

module.exports = { consultarEspecialesConfirmados };
