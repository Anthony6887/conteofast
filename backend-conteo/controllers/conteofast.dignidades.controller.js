'use strict';

// Las rutas de este controlador exigen autenticación y autorización en producción.
const crypto = require('node:crypto');
const storage = require('../services/evidencias-storage');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { _internals: reglas } = require('./conteofast.controller');
const MAX_PNG = 30 * 1024 * 1024;
const TIPOS = ['ALCALDE', 'CONCEJAL', 'VOCAL'];
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const numero = v => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
const responder = (res, e, lugar) => {
  if (e.status >= 400 && e.status < 500) return res.status(e.status).json({ ok: false, message: e.message });
  console.error(`[CONTEOFAST DIGNIDADES ${lugar}]`, e);
  return res.status(500).json({ ok: false, message: 'Error del servidor al procesar la dignidad.' });
};
function validarTipo(req) {
  const tipo = String(req.params.tipo || '').toUpperCase();
  if (!TIPOS.includes(tipo)) throw new HttpError(400, 'Dignidad inválida.');
  return tipo;
}
function validarId(req) {
  const id = numero(req.params.juntaId);
  if (!id) throw new HttpError(400, 'Junta inválida.');
  return id;
}
function eleccionId() {
  const id = numero(process.env.CF_ELECCION_ID || '1');
  if (!id) throw new HttpError(503, 'Elección activa inválida.');
  return id;
}
async function contexto(juntaId, transaction = null, bloquear = false) {
  const select = { type: QueryTypes.SELECT, transaction };
  const rows = await sequelize.query(`
    SELECT j.id, j.padron, j.numeracion_verificada, j.recinto_id, r.codigo_recinto
    FROM juntas j JOIN recintos r ON r.id = j.recinto_id
    WHERE j.id = :juntaId AND j.activo = 1 AND r.activo = 1 LIMIT 1
  `, { ...select, replacements: { juntaId } });
  if (!rows.length) throw new HttpError(404, 'Junta no encontrada.');
  const junta = rows[0];
  const recinto = reglas.obtenerRecinto(junta.codigo_recinto);
  if (bloquear) {
    await sequelize.query('SELECT id FROM recintos WHERE id=:id FOR UPDATE', { ...select, replacements: { id: junta.recinto_id } });
    await sequelize.query('SELECT id FROM juntas WHERE id=:id FOR UPDATE', { ...select, replacements: { id: juntaId } });
  }
  const regs = await sequelize.query(`
    SELECT id, estado FROM cf_registros WHERE eleccion_id=:eleccionId AND junta_id=:juntaId
    LIMIT 1 ${bloquear ? 'FOR UPDATE' : ''}
  `, { ...select, replacements: { eleccionId: eleccionId(), juntaId } });
  const registro = regs[0] || null;
  return { junta, recinto, registro, select };
}
async function verificarSinCierreGlobal(registroId, select) {
  if (!registroId) return;
  const rows = await sequelize.query('SELECT registro_id FROM cf_registro_cierres WHERE registro_id=:id LIMIT 1', {
    ...select, replacements: { id: registroId }
  });
  if (rows.length) throw new HttpError(409, 'La junta tiene un cierre global antiguo y es de solo lectura.');
}
async function verificarTipo(recinto, tipo) {
  if (tipo === 'VOCAL' && recinto.ambito !== 'RURAL') throw new HttpError(400, 'No existen vocales en una junta urbana.');
}
async function candidatosTipo(recinto, tipo, select) {
  const todos = await sequelize.query(`
    SELECT id, nombre, tipo, numero_lista, ambito FROM cf_candidatos
    WHERE eleccion_id=:eleccionId AND activo=1
  `, { ...select, replacements: { eleccionId: eleccionId() } });
  const permitidos = reglas.candidatosPermitidos(todos, recinto).filter(c => c.tipo === tipo);
  if (!permitidos.length) throw new HttpError(409, `No existen candidatos válidos para ${tipo}.`);
  return permitidos;
}
async function estado(req, res) {
  try {
    const juntaId = validarId(req);
    const { registro, recinto, select } = await contexto(juntaId);
    const salida = Object.fromEntries(TIPOS.map(t => [t, { guardado: false, foto: false, finalizado: false }]));
    if (registro) {
      const [extras, fotos, cierres] = await Promise.all([
        sequelize.query('SELECT tipo FROM cf_registro_dignidad_guardados WHERE registro_id=:id', { ...select, replacements: { id: registro.id } }),
        sequelize.query('SELECT tipo,ruta_archivo,tamano_bytes FROM cf_registro_dignidad_evidencias WHERE registro_id=:id', { ...select, replacements: { id: registro.id } }),
        sequelize.query('SELECT tipo,fecha_cierre FROM cf_registro_dignidad_cierres WHERE registro_id=:id', { ...select, replacements: { id: registro.id } })
      ]);
      for (const x of extras) if (salida[x.tipo]) salida[x.tipo].guardado = true;
      for (const x of fotos) if (salida[x.tipo]) salida[x.tipo].foto = await storage.disponible(x);
      for (const x of cierres) if (salida[x.tipo]) { salida[x.tipo].finalizado = true; salida[x.tipo].fecha_cierre = x.fecha_cierre; }
      const global = await sequelize.query('SELECT registro_id FROM cf_registro_cierres WHERE registro_id=:id LIMIT 1', {
        ...select, replacements: { id: registro.id }
      });
      if (global.length) for (const t of TIPOS) if (t !== 'VOCAL' || recinto.ambito === 'RURAL') salida[t].finalizado = true;
    }
    return res.json({ ok: true, data: salida });
  } catch (e) { return responder(res, e, 'estado'); }
}
async function guardar(req, res) {
  try {
    const juntaId = validarId(req), tipo = validarTipo(req);
    const body = req.body || {};
    if (!Array.isArray(body.votos)) throw new HttpError(400, 'Envíe votos de la dignidad.');
    const nulos = body.nulos, blancos = body.blancos;
    if (![nulos, blancos].every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)) {
      throw new HttpError(400, 'Nulos y blancos deben ser enteros no negativos.');
    }
    const respuesta = await sequelize.transaction(async transaction => {
      const { junta, recinto, registro, select } = await contexto(juntaId, transaction, true);
      await verificarTipo(recinto, tipo);
      await verificarSinCierreGlobal(registro?.id, select);
      if (registro) {
        const cerrado = await sequelize.query(`SELECT tipo FROM cf_registro_dignidad_cierres WHERE registro_id=:id AND tipo=:tipo LIMIT 1 FOR UPDATE`, {
          ...select, replacements: { id: registro.id, tipo }
        });
        if (cerrado.length) throw new HttpError(409, `${tipo} finalizado: sus votos no se pueden editar.`);
      }
      const limite = reglas.resolverPadron(junta.padron, recinto);
      if (!numero(limite.padron)) throw new HttpError(409, 'La junta no tiene padrón válido.');
      if (process.env.CF_EXIGIR_NUMERACION_VERIFICADA !== '0' && Number(junta.numeracion_verificada) !== 1) {
        throw new HttpError(409, 'La numeración de la junta no está verificada.');
      }
      const candidatos = await candidatosTipo(recinto, tipo, select);
      const mapa = new Map();
      for (const f of body.votos) {
        const id = numero(f?.candidato_id), votos = f?.votos;
        if (!id || typeof votos !== 'number' || !Number.isSafeInteger(votos) || votos < 0 || votos > limite.padron || mapa.has(id)) {
          throw new HttpError(400, 'Detalle de votos inválido, duplicado o superior al padrón.');
        }
        mapa.set(id, votos);
      }
      if (mapa.size !== candidatos.length || candidatos.some(c => !mapa.has(Number(c.id)))) {
        throw new HttpError(400, `Debe enviar todos los candidatos válidos de ${tipo}, sin incluir otras dignidades.`);
      }
      const total = [...mapa.values()].reduce((a, b) => a + b, 0) + nulos + blancos;
      if (total > limite.padron) throw new HttpError(400, `${tipo}: ${total} supera el padrón ${limite.padron}.`);
      const [votosOtros, especialesOtros] = await Promise.all([
        sequelize.query(`SELECT COALESCE(SUM(v.votos),0) AS total FROM cf_registro_votos v
          JOIN cf_candidatos c ON c.id=v.candidato_id JOIN cf_registros cr ON cr.id=v.registro_id
          JOIN juntas j ON j.id=cr.junta_id JOIN recintos r ON r.id=j.recinto_id
          WHERE cr.eleccion_id=:eleccionId AND cr.estado='CONFIRMADO'
            AND j.id<>:juntaId AND r.codigo_recinto=:codigo AND c.tipo=:tipo`, {
          ...select, replacements: { eleccionId: eleccionId(), juntaId, codigo: recinto.codigo, tipo }
        }),
        sequelize.query(`SELECT COALESCE(SUM(e.nulos+e.blancos),0) AS total FROM cf_registro_especiales e
          JOIN cf_registros cr ON cr.id=e.registro_id JOIN juntas j ON j.id=cr.junta_id
          JOIN recintos r ON r.id=j.recinto_id
          WHERE cr.eleccion_id=:eleccionId AND cr.estado='CONFIRMADO'
            AND j.id<>:juntaId AND r.codigo_recinto=:codigo AND e.tipo=:tipo`, {
          ...select, replacements: { eleccionId: eleccionId(), juntaId, codigo: recinto.codigo, tipo }
        })
      ]);
      if (total + Number(votosOtros[0].total) + Number(especialesOtros[0].total) > recinto.electores) {
        throw new HttpError(409, `Los votos acumulados de ${tipo} superan los electores del recinto.`);
      }
      let registroId = registro?.id;
      if (!registroId) {
        await sequelize.query(`INSERT INTO cf_registros(eleccion_id,junta_id,estado)
          VALUES (:eleccionId,:juntaId,'CONFIRMADO')`, {
          transaction, replacements: { eleccionId: eleccionId(), juntaId }
        });
        const ids = await sequelize.query('SELECT LAST_INSERT_ID() AS id', select);
        registroId = Number(ids[0].id);
      } else {
        await sequelize.query(`UPDATE cf_registros SET estado='CONFIRMADO',fecha_actualizacion=CURRENT_TIMESTAMP
          WHERE id=:registroId`, { transaction, replacements: { registroId } });
      }
      const ids = candidatos.map(c => Number(c.id));
      await sequelize.query(`DELETE v FROM cf_registro_votos v JOIN cf_candidatos c ON c.id=v.candidato_id
        WHERE v.registro_id=:registroId AND c.tipo=:tipo`, { transaction, replacements: { registroId, tipo } });
      for (const id of ids) {
        await sequelize.query(`INSERT INTO cf_registro_votos(registro_id,candidato_id,votos)
          VALUES (:registroId,:candidatoId,:votos)`, {
          transaction, replacements: { registroId, candidatoId: id, votos: mapa.get(id) }
        });
      }
      await sequelize.query(`INSERT INTO cf_registro_especiales(registro_id,tipo,nulos,blancos)
        VALUES (:registroId,:tipo,:nulos,:blancos)
        ON DUPLICATE KEY UPDATE nulos=VALUES(nulos),blancos=VALUES(blancos)`, {
        transaction, replacements: { registroId, tipo, nulos, blancos }
      });
      await sequelize.query(`INSERT INTO cf_registro_dignidad_guardados(registro_id,tipo)
        VALUES (:registroId,:tipo) ON DUPLICATE KEY UPDATE actualizado_en=CURRENT_TIMESTAMP`, {
        transaction, replacements: { registroId, tipo }
      });
      return { registro_id: registroId, junta_id: juntaId, tipo, total };
    });
    return res.json({ ok: true, message: `${tipo} guardado correctamente.`, data: respuesta });
  } catch (e) { return responder(res, e, 'guardar'); }
}
async function subirFoto(req, res) {
  try {
    const juntaId = validarId(req), tipo = validarTipo(req);
    if (!Buffer.isBuffer(req.body) || req.body.length < 512 || req.body.length > MAX_PNG ||
      !req.body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
      String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'image/png') {
      throw new HttpError(415, 'Enviar PNG binario válido de máximo 30 MiB.');
    }
    const foto = req.body;
    await sequelize.transaction(async transaction => {
      const { junta, registro, recinto, select } = await contexto(juntaId, transaction, true);
      await verificarTipo(recinto, tipo);
      if (!registro) throw new HttpError(409, 'Guarde primero los votos de esta dignidad.');
      await verificarSinCierreGlobal(registro.id, select);
      const cerrado = await sequelize.query(`SELECT tipo FROM cf_registro_dignidad_cierres
        WHERE registro_id=:id AND tipo=:tipo LIMIT 1 FOR UPDATE`, { ...select, replacements: { id: registro.id, tipo } });
      if (cerrado.length) throw new HttpError(409, 'Dignidad finalizada; no se puede cambiar su fotografía.');
      const especial = await sequelize.query(`SELECT tipo FROM cf_registro_dignidad_guardados WHERE registro_id=:id AND tipo=:tipo`, {
        ...select, replacements: { id: registro.id, tipo }
      });
      if (!especial.length) throw new HttpError(409, 'Guarde primero los votos de esta dignidad.');
      const ruta = await storage.guardar({ eleccionId: eleccionId(), recintoId: junta.recinto_id, juntaId, registroId: registro.id, tipo, foto, mime: 'image/png' });
      await sequelize.query(`INSERT INTO cf_registro_dignidad_evidencias
        (registro_id,tipo,nombre_archivo,mime,tamano_bytes,sha256,ruta_archivo)
        VALUES ($registroId,$tipo,$nombre,'image/png',$bytes,$hash,$ruta)
        ON DUPLICATE KEY UPDATE nombre_archivo=VALUES(nombre_archivo),mime=VALUES(mime),
          tamano_bytes=VALUES(tamano_bytes),sha256=VALUES(sha256),ruta_archivo=VALUES(ruta_archivo),actualizado_en=CURRENT_TIMESTAMP`, {
        transaction, bind: { registroId: registro.id, tipo, nombre: `acta_${tipo.toLowerCase()}.png`, bytes: foto.length, hash: hash(foto), ruta }
      });
    });
    return res.json({ ok: true, message: `Fotografía de ${tipo} guardada.`, data: { sha256: hash(foto), mime: 'image/png', bytes: foto.length } });
  } catch (e) { return responder(res, e, 'subirFoto'); }
}
async function obtenerFoto(req, res) {
  try {
    const juntaId = validarId(req), tipo = validarTipo(req);
    const { registro } = await contexto(juntaId);
    if (!registro) throw new HttpError(404, 'No hay fotografía de esta dignidad.');
    const rows = await sequelize.query(`SELECT ruta_archivo,sha256,mime,tamano_bytes FROM cf_registro_dignidad_evidencias
      WHERE registro_id=:id AND tipo=:tipo LIMIT 1`, {
      type: QueryTypes.SELECT, replacements: { id: registro.id, tipo }
    });
    if (!rows.length) throw new HttpError(404, 'No existe fotografía de esta dignidad.');
    const foto = await storage.leer(rows[0]);
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[rows[0].mime];
    res.set({
      'Content-Type': rows[0].mime, 'Content-Length': String(foto.length), 'Cache-Control': 'private,no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="acta_${juntaId}_${tipo.toLowerCase()}.${extension}"`
    });
    return res.end(foto);
  } catch (e) { return responder(res, e, 'obtenerFoto'); }
}
async function finalizar(req, res) {
  try {
    const juntaId = validarId(req), tipo = validarTipo(req);
    const resultado = await sequelize.transaction(async transaction => {
      const { junta, recinto, registro, select } = await contexto(juntaId, transaction, true);
      await verificarTipo(recinto, tipo);
      if (!registro) throw new HttpError(409, 'Guarde primero los votos de esta dignidad.');
      await verificarSinCierreGlobal(registro.id, select);
      const cierres = await sequelize.query(`SELECT tipo FROM cf_registro_dignidad_cierres
        WHERE registro_id=:id AND tipo=:tipo LIMIT 1 FOR UPDATE`, {
        ...select, replacements: { id: registro.id, tipo }
      });
      if (cierres.length) throw new HttpError(409, `${tipo} ya está finalizado.`);
      if (registro.estado !== 'CONFIRMADO') throw new HttpError(409, 'Registro sin confirmar.');
      const limite = reglas.resolverPadron(junta.padron, recinto);
      const simula = process.env.CF_PERMITIR_CIERRE_PRUEBAS === '1' && ['development', 'test'].includes(String(process.env.NODE_ENV).toLowerCase());
      if (!numero(limite.padron) || (limite.padron_fuente !== 'BASE_DATOS' && !simula) ||
        (Number(junta.numeracion_verificada) !== 1 && !simula)) {
        throw new HttpError(409, 'Cierre requiere padrón y numeración verificados (o permiso de pruebas en desarrollo).');
      }
      const [fotos, extras, votos, candidatos] = await Promise.all([
        sequelize.query(`SELECT sha256,ruta_archivo,mime,tamano_bytes FROM cf_registro_dignidad_evidencias WHERE registro_id=:id AND tipo=:tipo`, {
          ...select, replacements: { id: registro.id, tipo }
        }),
        sequelize.query(`SELECT nulos,blancos FROM cf_registro_especiales WHERE registro_id=:id AND tipo=:tipo`, {
          ...select, replacements: { id: registro.id, tipo }
        }),
        sequelize.query(`SELECT v.candidato_id,v.votos FROM cf_registro_votos v
          JOIN cf_candidatos c ON c.id=v.candidato_id WHERE v.registro_id=:id AND c.tipo=:tipo ORDER BY v.candidato_id`, {
          ...select, replacements: { id: registro.id, tipo }
        }),
        candidatosTipo(recinto, tipo, select)
      ]);
      const guardado = await sequelize.query(`SELECT tipo FROM cf_registro_dignidad_guardados WHERE registro_id=:id AND tipo=:tipo`, {
        ...select, replacements: { id: registro.id, tipo }
      });
      if (!guardado.length) throw new HttpError(409, `Guarde primero los votos de ${tipo}.`);
      if (!fotos.length) throw new HttpError(409, `Falta fotografía del acta de ${tipo}.`);
      try { await storage.leer(fotos[0]); } catch { throw new HttpError(409, 'La fotografía no está disponible o no supera la verificación de integridad.'); }
      if (!extras.length || votos.length !== candidatos.length ||
        candidatos.some(c => !votos.some(v => Number(v.candidato_id) === Number(c.id)))) {
        throw new HttpError(409, `Faltan votos o especiales de ${tipo}.`);
      }
      const total = votos.reduce((s, v) => s + Number(v.votos), 0) + Number(extras[0].nulos) + Number(extras[0].blancos);
      if (!Number.isSafeInteger(total) || total > limite.padron) throw new HttpError(409, `${tipo} supera el padrón.`);
      const sumas = await sequelize.query(`SELECT COALESCE(SUM(v.votos),0) AS total
        FROM cf_registro_votos v JOIN cf_candidatos c ON c.id=v.candidato_id
        JOIN cf_registros cr ON cr.id=v.registro_id JOIN juntas j ON j.id=cr.junta_id
        JOIN recintos r ON r.id=j.recinto_id WHERE cr.eleccion_id=:eleccionId
          AND cr.estado='CONFIRMADO' AND j.id<>:juntaId AND r.codigo_recinto=:codigo AND c.tipo=:tipo`, {
        ...select, replacements: { eleccionId: eleccionId(), juntaId, codigo: recinto.codigo, tipo }
      });
      const sumaExtras = await sequelize.query(`SELECT COALESCE(SUM(e.nulos+e.blancos),0) AS total
        FROM cf_registro_especiales e JOIN cf_registros cr ON cr.id=e.registro_id
        JOIN juntas j ON j.id=cr.junta_id JOIN recintos r ON r.id=j.recinto_id
        WHERE cr.eleccion_id=:eleccionId AND cr.estado='CONFIRMADO' AND j.id<>:juntaId
          AND r.codigo_recinto=:codigo AND e.tipo=:tipo`, {
        ...select, replacements: { eleccionId: eleccionId(), juntaId, codigo: recinto.codigo, tipo }
      });
      if (total + Number(sumas[0].total) + Number(sumaExtras[0].total) > recinto.electores) {
        throw new HttpError(409, `El acumulado de ${tipo} supera los electores del recinto.`);
      }
      const hashVotos = hash(JSON.stringify({ tipo, votos, especiales: extras[0] }));
      await sequelize.query(`INSERT INTO cf_registro_dignidad_cierres(registro_id,tipo,sha256_votos,sha256_acta)
        VALUES(:id,:tipo,:hashVotos,:hashActa)`, {
        transaction, replacements: { id: registro.id, tipo, hashVotos, hashActa: fotos[0].sha256 }
      });
      return { junta_id: juntaId, tipo, finalizado: true };
    });
    return res.json({ ok: true, message: `${tipo} finalizado y bloqueado. Las demás dignidades siguen disponibles.`, data: resultado });
  } catch (e) { return responder(res, e, 'finalizar'); }
}
module.exports = { estado, guardar, subirFoto, obtenerFoto, finalizar };
