'use strict';
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function eleccionId() {
  const id = Number(process.env.CF_ELECCION_ID || 1);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(503, 'CF_ELECCION_ID no es valido.');
  }
  return id;
}
function idPositivo(valor) {
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}
function responderError(res, error, origen) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ ok: false, message: error.message });
  }
  if (error?.original?.errno === 1062 || error?.parent?.errno === 1062) {
    return res.status(409).json({
      ok: false,
      message: 'La junta ya tiene un registro. Consulte la junta y vuelva a intentar.'
    });
  }
  console.error(`[CONTEOFAST ${origen}]`, error);
  return res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
}
async function catalogos(_req, res) {
  try {
    const eleccionIdActual = eleccionId();
    const [juntas, candidatos] = await Promise.all([
      sequelize.query(`
        SELECT j.id, j.recinto_id, j.numero, j.tipo, j.padron,
               j.numeracion_verificada,
               r.nombre AS recinto, r.parroquia, r.direccion,
               CONCAT(r.nombre, ' · ', IF(j.tipo='F','Femenina','Masculina'),
                      ' ', LPAD(j.numero,3,'0')) AS etiqueta
          FROM juntas j
          JOIN recintos r ON r.id = j.recinto_id
         WHERE j.activo = 1 AND r.activo = 1
         ORDER BY r.parroquia, r.nombre, j.tipo, j.numero
      `, { type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT id, nombre, tipo, modalidad, numero_lista, circunscripcion_id, ambito
          FROM cf_candidatos
         WHERE eleccion_id = :eleccionId AND activo = 1
         ORDER BY FIELD(tipo, 'ALCALDE', 'CONCEJAL'), id
      `, { type: QueryTypes.SELECT, replacements: { eleccionId: eleccionIdActual } })
    ]);
    return res.json({
      ok: true,
      data: { eleccion_id: eleccionIdActual, juntas, candidatos }
    });
  } catch (error) {
    return responderError(res, error, 'catalogos');
  }
}
async function registroPorJunta(req, res) {
  try {
    const juntaId = idPositivo(req.params.juntaId);
    if (!juntaId) throw new HttpError(400, 'El ID de la junta no es valido.');
    const eleccionIdActual = eleccionId();
    const registros = await sequelize.query(`
      SELECT id, junta_id, eleccion_id, estado, observaciones,
             fecha_registro, fecha_actualizacion
        FROM cf_registros
       WHERE junta_id = :juntaId AND eleccion_id = :eleccionId
       LIMIT 1
    `, {
      type: QueryTypes.SELECT,
      replacements: { juntaId, eleccionId: eleccionIdActual }
    });
    if (!registros.length) {
      return res.json({ ok: true, data: null });
    }
    const registro = registros[0];
    const votos = await sequelize.query(`
      SELECT v.candidato_id, v.votos, c.nombre, c.tipo
        FROM cf_registro_votos v
        JOIN cf_candidatos c ON c.id = v.candidato_id
       WHERE v.registro_id = :registroId
       ORDER BY FIELD(c.tipo, 'ALCALDE', 'CONCEJAL'), c.id
    `, {
      type: QueryTypes.SELECT,
      replacements: { registroId: registro.id }
    });
    return res.json({ ok: true, data: { ...registro, votos } });
  } catch (error) {
    return responderError(res, error, 'registroPorJunta');
  }
}
function validarDetalle(body) {
  const juntaId = idPositivo(body?.junta_id);
  const filas = body?.votos;
  if (!juntaId || !Array.isArray(filas) || filas.length < 1 || filas.length > 100) {
    throw new HttpError(400, 'Envie junta_id y votos: [{ candidato_id, votos }].');
  }
  const detalle = new Map();
  for (const fila of filas) {
    const candidatoId = idPositivo(fila?.candidato_id);
    const cantidad = fila?.votos;
    if (!candidatoId || typeof cantidad !== 'number' ||
      !Number.isSafeInteger(cantidad) || cantidad < 0) {
      throw new HttpError(400, 'Los votos deben ser numeros enteros, mayores o iguales a cero.');
    }
    if (detalle.has(candidatoId)) {
      throw new HttpError(400, 'No repita candidatos en el detalle.');
    }
    detalle.set(candidatoId, cantidad);
  }
  return { juntaId, detalle };
}
async function persistir(req, res, requiereExistente) {
  try {
    const { juntaId, detalle } = validarDetalle(req.body);
    const eleccionIdActual = eleccionId();
    if (requiereExistente && idPositivo(req.params.juntaId) !== juntaId) {
      throw new HttpError(400, 'El ID de la ruta y del cuerpo deben coincidir.');
    }
    const resultado = await sequelize.transaction(async transaction => {
      const seleccionar = { transaction, type: QueryTypes.SELECT };
      const juntas = await sequelize.query(`
        SELECT j.id, j.padron, j.numeracion_verificada
          FROM juntas j
          JOIN recintos r ON r.id = j.recinto_id
         WHERE j.id = :juntaId AND j.activo = 1 AND r.activo = 1
         LIMIT 1
      `, { ...seleccionar, replacements: { juntaId } });
      if (!juntas.length) {
        throw new HttpError(404, 'La junta no existe o esta inactiva.');
      }
      const junta = juntas[0];
      if (process.env.CF_EXIGIR_NUMERACION_VERIFICADA !== '0' &&
        Number(junta.numeracion_verificada) !== 1) {
        throw new HttpError(409, 'La numeracion de esta junta no esta verificada.');
      }
      const candidatos = await sequelize.query(`
        SELECT id FROM cf_candidatos
         WHERE eleccion_id = :eleccionId AND activo = 1
      `, {
        ...seleccionar,
        replacements: { eleccionId: eleccionIdActual }
      });
      if (!candidatos.length) {
        throw new HttpError(409, 'No existen candidatos activos.');
      }
      if (candidatos.length !== detalle.size ||
        candidatos.some(c => !detalle.has(Number(c.id)))) {
        throw new HttpError(400, 'Envie los votos de todos los candidatos activos. Use cero si corresponde.');
      }
      if (junta.padron != null && Number(junta.padron) > 0) {
        for (const cantidad of detalle.values()) {
          if (cantidad > Number(junta.padron)) {
            throw new HttpError(400, 'Los votos de un candidato superan el padron registrado.');
          }
        }
      }
      const previos = await sequelize.query(`
        SELECT id FROM cf_registros
         WHERE eleccion_id = :eleccionId AND junta_id = :juntaId
         LIMIT 1 FOR UPDATE
      `, {
        ...seleccionar,
        replacements: { eleccionId: eleccionIdActual, juntaId }
      });
      let registroId;
      let creado;
      if (previos.length) {
        registroId = Number(previos[0].id);
        creado = false;
        await sequelize.query(`
          UPDATE cf_registros
             SET estado = 'CONFIRMADO', fecha_actualizacion = CURRENT_TIMESTAMP
           WHERE id = :registroId
        `, { transaction, replacements: { registroId } });
        await sequelize.query(`
          DELETE FROM cf_registro_votos WHERE registro_id = :registroId
        `, { transaction, replacements: { registroId } });
      } else {
        if (requiereExistente) {
          throw new HttpError(404, 'La junta no tiene un registro para actualizar.');
        }
        await sequelize.query(`
          INSERT INTO cf_registros (eleccion_id, junta_id, estado)
          VALUES (:eleccionId, :juntaId, 'CONFIRMADO')
        `, {
          transaction,
          replacements: { eleccionId: eleccionIdActual, juntaId }
        });
        const ids = await sequelize.query('SELECT LAST_INSERT_ID() AS id', {
          ...seleccionar
        });
        registroId = Number(ids[0].id);
        creado = true;
      }
      for (const [candidatoId, cantidad] of detalle.entries()) {
        await sequelize.query(`
          INSERT INTO cf_registro_votos (registro_id, candidato_id, votos)
          VALUES (:registroId, :candidatoId, :votos)
        `, {
          transaction,
          replacements: { registroId, candidatoId, votos: cantidad }
        });
      }
      return {
        registro_id: registroId,
        junta_id: juntaId,
        estado: 'CONFIRMADO',
        creado
      };
    });
    return res.status(resultado.creado ? 201 : 200).json({
      ok: true,
      message: resultado.creado ? 'Registro creado.' : 'Registro actualizado.',
      data: resultado
    });
  } catch (error) {
    return responderError(res, error, requiereExistente ? 'actualizar' : 'guardar');
  }
}
async function guardar(req, res) {
  return persistir(req, res, false);
}
async function actualizar(req, res) {
  return persistir(req, res, true);
}
async function eliminar(req, res) {
  try {
    const juntaId = idPositivo(req.params.juntaId);
    if (!juntaId) throw new HttpError(400, 'El ID de junta no es valido.');
    const eleccionIdActual = eleccionId();
    const resultado = await sequelize.transaction(async transaction => {
      const registros = await sequelize.query(`
        SELECT id FROM cf_registros
         WHERE eleccion_id = :eleccionId AND junta_id = :juntaId
         LIMIT 1 FOR UPDATE
      `, {
        transaction,
        type: QueryTypes.SELECT,
        replacements: { eleccionId: eleccionIdActual, juntaId }
      });
      if (!registros.length) throw new HttpError(404, 'No existe un registro en esta junta.');
      const registroId = Number(registros[0].id);
      await sequelize.query(`
        DELETE FROM cf_registro_votos WHERE registro_id = :registroId
      `, { transaction, replacements: { registroId } });
      await sequelize.query(`
        DELETE FROM cf_registros WHERE id = :registroId
      `, { transaction, replacements: { registroId } });
      return { registro_id: registroId, junta_id: juntaId };
    });
    return res.json({ ok: true, message: 'Registro eliminado.', data: resultado });
  } catch (error) {
    return responderError(res, error, 'eliminar');
  }
}
async function resumen(_req, res) {
  try {
    const eleccionIdActual = eleccionId();
    const [candidatos, juntas] = await Promise.all([
      sequelize.query(`
        SELECT c.id AS candidato_id, c.nombre, c.tipo, c.modalidad, c.numero_lista, c.ambito,
               COALESCE(SUM(CASE WHEN r.estado = 'CONFIRMADO'
                    AND r.eleccion_id = :eleccionId THEN v.votos ELSE 0 END),0) AS total_votos
          FROM cf_candidatos c
          LEFT JOIN cf_registro_votos v ON v.candidato_id = c.id
          LEFT JOIN cf_registros r ON r.id = v.registro_id
         WHERE c.eleccion_id = :eleccionId AND c.activo = 1
         GROUP BY c.id, c.nombre, c.tipo, c.modalidad, c.numero_lista, c.ambito
         ORDER BY FIELD(c.tipo,'ALCALDE','CONCEJAL'), total_votos DESC
      `, { type: QueryTypes.SELECT, replacements: { eleccionId: eleccionIdActual } }),
      sequelize.query(`
        SELECT COUNT(*) AS juntas_confirmadas
          FROM cf_registros
         WHERE eleccion_id = :eleccionId AND estado = 'CONFIRMADO'
      `, { type: QueryTypes.SELECT, replacements: { eleccionId: eleccionIdActual } })
    ]);
    return res.json({
      ok: true,
      data: {
        eleccion_id: eleccionIdActual,
        juntas_confirmadas: Number(juntas[0]?.juntas_confirmadas || 0),
        candidatos
      }
    });
  } catch (error) {
    return responderError(res, error, 'resumen');
  }
}

/**
 * GET /api/conteofast/recintos-estado
 * Consulta el estado de cada junta por recinto para la elección configurada.
 * Solo lectura: no altera cf_registros ni los votos.
 * CONFIRMADO: registro guardado, EN_REVISION: registro existente en otro estado,
 * PENDIENTE: sin registro para esta elección.
 */
async function recintosEstado(_req, res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  try {
    const eleccionIdActual = eleccionId();

    // Mismas juntas y recintos activos que GET /catalogos.
    // LEFT JOIN mantiene visibles las juntas que todavía no tienen registro.
    const filas = await sequelize.query(`
      SELECT r.id AS recinto_id,
             r.nombre AS recinto_nombre,
             r.parroquia,
             r.direccion,
             j.id AS junta_id,
             j.numero AS junta_numero,
             j.tipo AS junta_tipo,
             j.padron,
             cr.estado AS registro_estado,
             cr.fecha_actualizacion AS actualizado_en
        FROM juntas j
        INNER JOIN recintos r ON r.id = j.recinto_id
        LEFT JOIN cf_registros cr
          ON cr.junta_id = j.id
         AND cr.eleccion_id = :eleccionId
       WHERE j.activo = 1 AND r.activo = 1
       ORDER BY r.parroquia, r.nombre,
                CAST(j.numero AS UNSIGNED), j.tipo, j.id
    `, {
      type: QueryTypes.SELECT,
      replacements: { eleccionId: eleccionIdActual }
    });

    const mapa = new Map();
    for (const fila of filas) {
      const recintoId = String(fila.recinto_id);
      if (!mapa.has(recintoId)) {
        mapa.set(recintoId, {
          id: recintoId,
          nombre: String(fila.recinto_nombre || ''),
          parroquia: String(fila.parroquia || ''),
          direccion: String(fila.direccion || ''),
          total_juntas: 0,
          confirmadas: 0,
          en_revision: 0,
          pendientes: 0,
          juntas: []
        });
      }

      const recinto = mapa.get(recintoId);
      const registroEstado = String(fila.registro_estado || '').trim().toUpperCase();
      const estado = registroEstado === 'CONFIRMADO'
        ? 'CONFIRMADO'
        : registroEstado ? 'EN_REVISION' : 'PENDIENTE';

      recinto.juntas.push({
        id: String(fila.junta_id),
        numero: String(fila.junta_numero ?? ''),
        tipo: String(fila.junta_tipo || ''),
        padron: fila.padron == null ? null : Number(fila.padron),
        estado,
        actualizado_en: fila.actualizado_en || null
      });

      recinto.total_juntas += 1;
      if (estado === 'CONFIRMADO') {
        recinto.confirmadas += 1;
      } else {
        recinto.pendientes += 1;
        if (estado === 'EN_REVISION') recinto.en_revision += 1;
      }
    }

    const recintos = Array.from(mapa.values());
    const totales = recintos.reduce((total, recinto) => {
      total.juntas += recinto.total_juntas;
      total.confirmadas += recinto.confirmadas;
      total.en_revision += recinto.en_revision;
      total.pendientes += recinto.pendientes;
      if (recinto.pendientes > 0) total.recintos_pendientes += 1;
      return total;
    }, {
      recintos: recintos.length,
      recintos_pendientes: 0,
      juntas: 0,
      confirmadas: 0,
      en_revision: 0,
      pendientes: 0
    });

    return res.json({
      ok: true,
      data: {
        eleccion_id: eleccionIdActual,
        consultado_en: new Date().toISOString(),
        totales,
        recintos
      }
    });
  } catch (error) {
    return responderError(res, error, 'recintosEstado');
  }
}

module.exports = {
  catalogos,
  registroPorJunta,
  guardar,
  actualizar,
  eliminar,
  resumen,
  recintosEstado
};
