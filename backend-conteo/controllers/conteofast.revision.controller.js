'use strict';

// Consulta de solo lectura. Mantiene evidencias históricas y las nuevas por dignidad.
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

const validId = x => Number.isSafeInteger(Number(x)) && Number(x) > 0 ? Number(x) : null;
const allowed = new Set(['ALCALDE', 'CONCEJAL', 'VOCAL', 'GENERAL']);
const errorReply = (res, error) => {
  console.error('[CONTEOFAST REVISION]', error);
  return res.status(500).json({ ok: false, message: 'No fue posible consultar las actas.' });
};

async function recintosConActas(req, res) {
  try {
    const eleccionId = validId(process.env.CF_ELECCION_ID || 1);
    if (!eleccionId) return res.status(503).json({ ok: false, message: 'Elección activa inválida.' });
    const filas = await sequelize.query(`
      SELECT r.id AS recinto_id, r.codigo_recinto, r.nombre AS recinto,
             r.parroquia, j.id AS junta_id, j.numero AS junta_numero,
             j.tipo AS junta_tipo, f.dignidad, f.sha256, f.actualizado_en,
             CASE WHEN cd.registro_id IS NOT NULL THEN 1 ELSE 0 END AS finalizada
      FROM (
          SELECT e.registro_id, 'GENERAL' AS dignidad,
                 e.sha256, e.actualizado_en
            FROM cf_registro_evidencias e
          UNION ALL
          SELECT e.registro_id, e.tipo AS dignidad,
                 e.sha256, e.actualizado_en
            FROM cf_registro_dignidad_evidencias e
      ) f
      JOIN cf_registros cr ON cr.id = f.registro_id
      JOIN juntas j ON j.id = cr.junta_id
      JOIN recintos r ON r.id = j.recinto_id
      LEFT JOIN cf_registro_dignidad_cierres cd
             ON cd.registro_id = cr.id AND cd.tipo = f.dignidad
      WHERE cr.eleccion_id = :eleccionId AND j.activo = 1 AND r.activo = 1
      ORDER BY r.nombre, j.tipo, j.numero, f.dignidad
    `, { type: QueryTypes.SELECT, replacements: { eleccionId } });
    const recintos = new Map();
    for (const row of filas) {
      const rid = Number(row.recinto_id);
      if (!recintos.has(rid)) recintos.set(rid, {
        recinto_id: rid,
        codigo_recinto: row.codigo_recinto,
        nombre: row.recinto,
        parroquia: row.parroquia,
        total_actas: 0,
        juntas: []
      });
      const recinto = recintos.get(rid);
      let junta = recinto.juntas.find(x => x.id === Number(row.junta_id));
      if (!junta) {
        junta = { id: Number(row.junta_id), numero: row.junta_numero,
          tipo: row.junta_tipo, actas: [] };
        recinto.juntas.push(junta);
      }
      const dignidad = String(row.dignidad);
      junta.actas.push({
        dignidad,
        sha256: row.sha256,
        actualizado_en: row.actualizado_en,
        finalizada: dignidad === 'GENERAL' ? null : Boolean(Number(row.finalizada)),
        foto_url: dignidad === 'GENERAL'
          ? `/api/conteofast/registro/${junta.id}/foto`
          : `/api/conteofast/registro/${junta.id}/dignidad/${dignidad}/foto`
      });
      recinto.total_actas++;
    }
    const datos = [...recintos.values()];
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: {
      recintos: datos,
      total_recintos: datos.length,
      total_actas: filas.length
    }});
  } catch (error) { return errorReply(res, error); }
}

module.exports = { recintosConActas };
