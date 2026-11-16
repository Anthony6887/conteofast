'use strict';

/**
 * Evidencia fotográfica y cierre definitivo de cada junta.
 * La imagen se almacena en MySQL; no depende de archivos del contenedor.
 * IMPORTANTE: incorporar autenticación de usuarios en las rutas POST/PUT/DELETE
 * antes de despliegue público. El cierre bloquea a TODOS, pero no identifica
 * a la persona que pulsa Finalizar si no se configura autenticación.
 */
const crypto = require('node:crypto');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { _internals: reglas } = require('./conteofast.controller');

const MAX_FOTO_BYTES = 30 * 1024 * 1024;
const TIPOS_MIME = new Set(['image/png']);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const idValido = v => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
const respuestaError = (res, error, origen) => {
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ ok: false, message: error.message });
  }
  console.error(`[CONTEOFAST ${origen}]`, error);
  return res.status(500).json({ ok: false, message: 'No se pudo completar la operación. Revise logs.' });
};

function detectarMime(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Orden fijo: recintos -> juntas -> registro. Evita carreras con guardar. */
async function bloquearJunta(juntaId, transaction) {
  const select = { transaction, type: QueryTypes.SELECT };
  const juntas = await sequelize.query(`
    SELECT j.id, j.recinto_id, j.padron, j.numeracion_verificada, r.codigo_recinto
    FROM juntas j JOIN recintos r ON r.id = j.recinto_id
    WHERE j.id = :juntaId AND j.activo = 1 AND r.activo = 1 LIMIT 1
  `, { ...select, replacements: { juntaId } });
  if (!juntas.length) throw new HttpError(404, 'La junta no existe o está inactiva.');
  const junta = juntas[0];
  await sequelize.query('SELECT id FROM recintos WHERE id = :id FOR UPDATE', {
    ...select, replacements: { id: junta.recinto_id }
  });
  await sequelize.query('SELECT id FROM juntas WHERE id = :juntaId FOR UPDATE', {
    ...select, replacements: { juntaId }
  });
  const eleccionId = Number(process.env.CF_ELECCION_ID || 1);
  if (!idValido(eleccionId)) throw new HttpError(503, 'Elección activa inválida.');
  const regs = await sequelize.query(`
    SELECT id, estado FROM cf_registros
    WHERE junta_id = :juntaId AND eleccion_id = :eleccionId
    LIMIT 1 FOR UPDATE
  `, { ...select, replacements: { juntaId, eleccionId } });
  if (!regs.length) throw new HttpError(409, 'Guarde primero los votos de esta junta.');
  const registro = regs[0];
  const cierres = await sequelize.query(`
    SELECT registro_id, fecha_cierre FROM cf_registro_cierres
    WHERE registro_id = :registroId LIMIT 1 FOR UPDATE
  `, { ...select, replacements: { registroId: registro.id } });
  return { junta, registro, cerrado: cierres.length > 0, select, eleccionId };
}

async function subirFoto(req, res) {
  try {
    const juntaId = idValido(req.params.juntaId);
    if (!juntaId) throw new HttpError(400, 'ID de junta inválido.');
    if (!Buffer.isBuffer(req.body) || req.body.length < 512 || req.body.length > MAX_FOTO_BYTES) {
      throw new HttpError(400, 'Envíe una fotografía PNG válida de máximo 30 MB.');
    }
    const mime = detectarMime(req.body);
    const tipoDeclarado = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!mime || !TIPOS_MIME.has(tipoDeclarado) || mime !== tipoDeclarado) {
      throw new HttpError(415, 'Solo se admite PNG sin pérdida. Selecciona la foto desde ConteoFast para convertirla.');
    }
    const huella = sha256(req.body);
    const bytes = req.body.length;
    await sequelize.transaction(async transaction => {
      const { registro, cerrado } = await bloquearJunta(juntaId, transaction);
      if (cerrado) throw new HttpError(409, 'Junta finalizada: la fotografía está bloqueada.');
      await sequelize.query(`
        INSERT INTO cf_registro_evidencias
          (registro_id, nombre_archivo, mime, tamano_bytes, sha256, imagen)
        VALUES ($registroId, 'acta.png', $mime, $bytes, $huella, $foto)
        ON DUPLICATE KEY UPDATE
          nombre_archivo = VALUES(nombre_archivo),
          mime = VALUES(mime), tamano_bytes = VALUES(tamano_bytes),
          sha256 = VALUES(sha256), imagen = VALUES(imagen),
          actualizado_en = CURRENT_TIMESTAMP
      `, { transaction, bind: { registroId: registro.id, mime, bytes, huella, foto: req.body } });
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, message: 'Fotografía del acta guardada.', data: { mime, bytes, sha256: huella } });
  } catch (e) { return respuestaError(res, e, 'subirFoto'); }
}

async function responderFoto(req, res, descarga = false) {
  try {
    const juntaId = idValido(req.params.juntaId);
    if (!juntaId) throw new HttpError(400, 'ID de junta inválido.');
    const eleccionId = Number(process.env.CF_ELECCION_ID || 1);
    const filas = await sequelize.query(`
      SELECT f.mime, f.imagen, f.tamano_bytes, f.nombre_archivo
      FROM cf_registro_evidencias f
      JOIN cf_registros r ON r.id = f.registro_id
      JOIN juntas j ON j.id = r.junta_id
      WHERE r.junta_id = :juntaId AND r.eleccion_id = :eleccionId
        AND j.activo = 1 LIMIT 1
    `, { type: QueryTypes.SELECT, replacements: { juntaId, eleccionId } });
    if (!filas.length) throw new HttpError(404, 'Esta junta no tiene fotografía.');
    // El archivo en MySQL es binario, pero al servirlo se entrega como PNG
    // con un nombre real. phpMyAdmin, en cambio, descarga los BLOB como .bin.
    const contenido = Buffer.isBuffer(filas[0].imagen)
      ? filas[0].imagen : Buffer.from(filas[0].imagen);
    const esPng = detectarMime(contenido) === 'image/png';
    const extension = esPng ? 'png' : 'jpg';
    const mimeRespuesta = esPng ? 'image/png' : 'image/jpeg';
    if (detectarMime(contenido) !== mimeRespuesta) {
      throw new HttpError(422, 'La fotografía almacenada no es un PNG/JPG válido.');
    }
    const nombre = `acta_junta_${juntaId}.${extension}`;
    res.set({
      'Content-Type': mimeRespuesta,
      'Content-Length': String(contenido.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${descarga ? 'attachment' : 'inline'}; filename="${nombre}"`
    });
    return res.end(contenido);
  } catch (e) { return respuestaError(res, e, 'obtenerFoto'); }
}

function obtenerFoto(req, res) { return responderFoto(req, res, false); }
function descargarFoto(req, res) { return responderFoto(req, res, true); }

async function finalizarJunta(req, res) {
  try {
    const juntaId = idValido(req.params.juntaId);
    if (!juntaId) throw new HttpError(400, 'ID de junta inválido.');
    const resultado = await sequelize.transaction(async transaction => {
      const { junta, registro, cerrado, select, eleccionId } = await bloquearJunta(juntaId, transaction);
      if (cerrado) throw new HttpError(409, 'Esta junta ya está finalizada. No se admiten modificaciones.');
      if (String(registro.estado) !== 'CONFIRMADO') {
        throw new HttpError(409, 'Primero guarde los votos de la junta.');
      }
      const recinto = reglas.obtenerRecinto(junta.codigo_recinto);
      const limite = reglas.resolverPadron(junta.padron, recinto);
      // Simulación: SOLO se autoriza de manera explícita en el backend de desarrollo.
      // Esto NO configura ni falsifica juntas.padron o numeracion_verificada.
      const permisoSolicitado = process.env.CF_PERMITIR_CIERRE_PRUEBAS === '1';
      const entornoDesarrollo = ['development', 'test'].includes(
        String(process.env.NODE_ENV || '').toLowerCase()
      );
      const permisoPruebas = permisoSolicitado && entornoDesarrollo;
      if (permisoSolicitado && !entornoDesarrollo) {
        throw new HttpError(409,
          'El cierre de simulación solo está autorizado con NODE_ENV=development o test.');
      }
      if (!Number.isSafeInteger(limite.padron) || limite.padron <= 0) {
        throw new HttpError(409,
          'Esta junta no tiene límite válido. Para simular configure CF_PADRON_PRUEBAS=1 y CF_PADRON_PRUEBAS_MAX.');
      }
      if (limite.padron_fuente !== 'BASE_DATOS' && !permisoPruebas) {
        throw new HttpError(409,
          'El cierre requiere padrón oficial; en desarrollo configure CF_PERMITIR_CIERRE_PRUEBAS=1.');
      }
      if (Number(junta.numeracion_verificada) !== 1 && !permisoPruebas) {
        throw new HttpError(409, 'Debe verificarse la numeración de la junta antes del cierre.');
      }
      const esSimulacion = permisoPruebas && (
        limite.padron_fuente !== 'BASE_DATOS' ||
        Number(junta.numeracion_verificada) !== 1
      );
      const fotos = await sequelize.query(`
        SELECT sha256 FROM cf_registro_evidencias WHERE registro_id = :registroId LIMIT 1
      `, { ...select, replacements: { registroId: registro.id } });
      if (!fotos.length) throw new HttpError(409, 'Adjunte una fotografía del acta antes de finalizar.');
      const candidatos = await sequelize.query(`
        SELECT id, nombre, tipo, numero_lista, ambito FROM cf_candidatos
        WHERE eleccion_id = :eleccionId AND activo = 1
      `, { ...select, replacements: { eleccionId } });
      const votos = await sequelize.query(`
        SELECT v.candidato_id, v.votos FROM cf_registro_votos v
        WHERE v.registro_id = :registroId ORDER BY v.candidato_id
      `, { ...select, replacements: { registroId: registro.id } });
      const extras = await sequelize.query(`
        SELECT tipo, nulos, blancos FROM cf_registro_especiales
        WHERE registro_id = :registroId ORDER BY tipo
      `, { ...select, replacements: { registroId: registro.id } });
      const detalle = new Map(votos.map(v => [Number(v.candidato_id), Number(v.votos)]));
      const especiales = reglas.validarEspeciales({
        especiales: Object.fromEntries(
          extras.map(e => [e.tipo, { nulos: Number(e.nulos), blancos: Number(e.blancos) }])
        )
      }, recinto.ambito);
      const dignidades = recinto.ambito === 'RURAL' ? ['ALCALDE', 'CONCEJAL', 'VOCAL'] : ['ALCALDE', 'CONCEJAL'];
      if (!dignidades.every(tipo => extras.some(e => e.tipo === tipo))) {
        throw new HttpError(409, 'Guarde los votos nulos y blancos de todas las dignidades antes de finalizar.');
      }
      const otrasCandidaturas = await sequelize.query(`
        SELECT c.tipo, COALESCE(SUM(v.votos), 0) AS total
        FROM juntas j JOIN recintos r ON r.id = j.recinto_id
        JOIN cf_registros cr ON cr.junta_id = j.id AND cr.eleccion_id = :eleccionId
          AND cr.estado = 'CONFIRMADO'
        JOIN cf_registro_votos v ON v.registro_id = cr.id
        JOIN cf_candidatos c ON c.id = v.candidato_id
        WHERE r.codigo_recinto = :codigo AND j.id <> :juntaId
        GROUP BY c.tipo
      `, { ...select, replacements: { eleccionId, codigo: recinto.codigo, juntaId } });
      const otrasEspeciales = await sequelize.query(`
        SELECT e.tipo, COALESCE(SUM(e.nulos + e.blancos),0) AS total
        FROM juntas j JOIN recintos r ON r.id = j.recinto_id
        JOIN cf_registros cr ON cr.junta_id = j.id AND cr.eleccion_id = :eleccionId
          AND cr.estado = 'CONFIRMADO'
        JOIN cf_registro_especiales e ON e.registro_id = cr.id
        WHERE r.codigo_recinto = :codigo AND j.id <> :juntaId
        GROUP BY e.tipo
      `, { ...select, replacements: { eleccionId, codigo: recinto.codigo, juntaId } });
      const anteriores = {};
      for (const f of [...otrasCandidaturas, ...otrasEspeciales]) {
        anteriores[f.tipo] = Number(anteriores[f.tipo] || 0) + Number(f.total);
      }
      reglas.validarCandidatosYTotales(detalle, candidatos, recinto, limite.padron, anteriores, especiales);
      const hashVotos = sha256(JSON.stringify({ votos, especiales }));
      await sequelize.query(`
        INSERT INTO cf_registro_cierres (registro_id, sha256_votos, sha256_acta)
        VALUES (:registroId, :hashVotos, :hashFoto)
      `, { transaction, replacements: { registroId: registro.id, hashVotos, hashFoto: fotos[0].sha256 } });
      return {
        junta_id: juntaId,
        registro_id: registro.id,
        estado: 'FINALIZADO',
        bloqueado: true,
        modo_cierre: esSimulacion ? 'SIMULACION' : 'VALIDADO',
        padron_fuente: limite.padron_fuente
      };
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, message: 'Junta finalizada y bloqueada. No podrá editar ni eliminar sus votos.', data: resultado });
  } catch (e) { return respuestaError(res, e, 'finalizarJunta'); }
}

module.exports = { subirFoto, obtenerFoto, descargarFoto, finalizarJunta, _internals: { detectarMime } };
