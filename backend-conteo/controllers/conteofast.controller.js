'use strict';



const { QueryTypes } = require('sequelize');

const { sequelize } = require('../models');

const { recintos: RECINTOS, listas: LISTAS, vocalesPorRecinto: VOCALES_POR_RECINTO } = require('../config/recintos-electorales');
const { consultarEspecialesConfirmados } = require('./reporte-especiales-confirmados');




class HttpError extends Error {

  constructor(status, message) {

    super(message);

    this.status = status;

  }

}



function eleccionId() {

  const id = Number(process.env.CF_ELECCION_ID || 1);

  if (!Number.isSafeInteger(id) || id <= 0) {

    throw new HttpError(503, 'CF_ELECCION_ID no es válido.');

  }

  return id;

}



function idPositivo(valor) {

  const n = Number(valor);

  return Number.isSafeInteger(n) && n > 0 ? n : null;

}



function responderError(res, error, origen) {

  if (error instanceof HttpError) {

    return res.status(error.status).json({ ok: false, message: error.message });

  }

  if (error?.original?.errno === 1062 || error?.parent?.errno === 1062) {

    return res.status(409).json({ ok: false, message: 'La junta ya tiene un registro. Recargue y reintente.' });

  }

  console.error(`[CONTEOFAST ${origen}]`, error);

  return res.status(500).json({ ok: false, message: 'Error interno del servidor. Revise el log de la API.' });

}



/** No se utilizan los nombres para identificar recintos: solamente r.codigo_recinto. */

function obtenerRecinto(codigo) {

  const id = idPositivo(codigo);

  const recinto = id ? RECINTOS[String(id)] : null;

  if (!recinto) throw new HttpError(409, `Código oficial de recinto inválido o sin configurar: ${codigo ?? 'NULO'}.`);

  return { codigo: id, ...recinto };

}



/**
 * Determina el padrón sin alterar los datos de MySQL.
 * - En producción: solamente permite el padrón oficial válido.
 * - En desarrollo/test: permite un límite referencial si falta el padrón.
 * - Para un dato oficial INVÁLIDO se exige una autorización adicional,
 *   exclusivamente de simulación; nunca se corrige ni sobrescribe en BD.
 */
function resolverPadron(padronBD, recinto, env = process.env) {
  const electores = Number(recinto?.electores);
  if (!Number.isSafeInteger(electores) || electores <= 0) {
    return { padron: null, padron_fuente: 'RECINTO_SIN_ELECTORES' };
  }

  const sinDato = padronBD === null || padronBD === undefined ||
    String(padronBD).trim() === '' || Number(padronBD) === 0;
  const valorBD = Number(padronBD);
  const padronValido = !sinDato && Number.isSafeInteger(valorBD) &&
    valorBD > 0 && valorBD <= electores;

  if (padronValido) {
    return { padron: valorBD, padron_fuente: 'BASE_DATOS' };
  }

  // Fuera de development/test NUNCA se utiliza un padrón simulado.
  const modoDesarrollo = ['development', 'test'].includes(
    String(env.NODE_ENV || '').toLowerCase()
  );
  const pruebasActivas = modoDesarrollo && env.CF_PADRON_PRUEBAS === '1';
  const puedeSustituirInvalido = pruebasActivas &&
    env.CF_PERMITIR_CIERRE_PRUEBAS === '1' &&
    env.CF_PADRON_PRUEBAS_REEMPLAZAR_INVALIDO === '1';

  if (!pruebasActivas || (!sinDato && !puedeSustituirInvalido)) {
    return {
      padron: null,
      padron_fuente: sinDato ? 'SIN_CONFIGURAR' : 'INVALIDO'
    };
  }

  const maximo = Number(env.CF_PADRON_PRUEBAS_MAX || '350');
  if (!Number.isSafeInteger(maximo) || maximo <= 0) {
    throw new HttpError(503, 'CF_PADRON_PRUEBAS_MAX debe ser un entero positivo.');
  }

  // SOLO LÍMITE DE SIMULACIÓN. No cambia juntas.padron.
  return {
    padron: Math.min(maximo, electores),
    padron_fuente: 'REFERENCIAL_PRUEBAS' // Contrato compatible con el frontend
  };
}


function normalizarLista(valor) {

  return String(valor ?? '').trim().replace(/\s*[–—/]\s*/g, '-').replace(/\s+/g, '');

}



/** La asignación de VOCAL se decide por código de recinto, nunca por nombre. */

function candidatosPermitidos(candidatos, recinto) {

  const ambito = recinto.ambito;

  const listasConcejales = new Set((LISTAS[ambito] || []).map(normalizarLista));

  const listasVocales = new Set(

    ambito === 'RURAL' ? (VOCALES_POR_RECINTO[String(recinto.codigo)] || []).map(normalizarLista) : []

  );

  return candidatos.filter(c => {

    const lista = normalizarLista(c.numero_lista);

    const tipo = String(c.tipo ?? '').trim().toUpperCase();

    const ambitoC = String(c.ambito ?? '').trim().toUpperCase();

    if (tipo === 'VOCAL') {

      return ambito === 'RURAL' && listasVocales.has(lista) &&

        (ambitoC === 'RURAL' || ambitoC === '');

    }

    if (!listasConcejales.has(lista)) return false;

    if (tipo === 'ALCALDE') return true;

    if (tipo !== 'CONCEJAL') return false;

    if (ambitoC === ambito) return true;

    return ambito === 'RURAL' && !ambitoC && Number(c.id) === 29 && lista === '1' &&

      String(c.nombre ?? '').trim().toUpperCase() === 'LISTA 1';

  });

}



/** Nulos y blancos son tipos de votos; NO se crean como candidatos. */

function validarEspeciales(body, ambito) {

  const salida = {};

  const entrada = body?.especiales || {};

  for (const tipo of ['ALCALDE', 'CONCEJAL', 'VOCAL']) {

    const fila = entrada[tipo] || {};

    const nulos = fila.nulos === undefined ? 0 : fila.nulos;

    const blancos = fila.blancos === undefined ? 0 : fila.blancos;

    if (![nulos, blancos].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) {

      throw new HttpError(400, `${tipo}: votos nulos y blancos deben ser enteros no negativos.`);

    }

    if (tipo === 'VOCAL' && ambito !== 'RURAL' && (nulos !== 0 || blancos !== 0)) {

      throw new HttpError(400, 'No se registran votos de Vocales en recintos urbanos.');

    }

    salida[tipo] = { nulos, blancos };

  }

  return salida;

}



function validarDetalle(body) {

  const juntaId = idPositivo(body?.junta_id);

  const filas = body?.votos;

  if (!juntaId || !Array.isArray(filas) || filas.length < 1 || filas.length > 250) {

    throw new HttpError(400, 'Envíe junta_id y votos: [{ candidato_id, votos }].');

  }

  const detalle = new Map();

  for (const fila of filas) {

    const candidatoId = idPositivo(fila?.candidato_id);

    const cantidad = fila?.votos;

    if (!candidatoId || typeof cantidad !== 'number' || !Number.isSafeInteger(cantidad) || cantidad < 0) {

      throw new HttpError(400, 'Los votos deben ser enteros no negativos (no decimales).');

    }

    if (detalle.has(candidatoId)) throw new HttpError(400, 'Existen candidatos duplicados en el detalle.');

    detalle.set(candidatoId, cantidad);

  }

  return { juntaId, detalle };

}



function validarCandidatosYTotales(detalle, candidatos, recinto, padron, anteriores, especiales) {

  if (!Number.isSafeInteger(padron) || padron <= 0 || padron > recinto.electores) {

    throw new HttpError(409, 'No existe un padrón válido para esta junta.');

  }

  const permitidos = candidatosPermitidos(candidatos, recinto);

  if (!permitidos.some(c => c.tipo === 'ALCALDE') || !permitidos.some(c => c.tipo === 'CONCEJAL')) {

    throw new HttpError(409, 'Faltan candidaturas activas de Alcaldía o Concejalía para este recinto.');

  }

  const listaVocal = VOCALES_POR_RECINTO[String(recinto.codigo)] || [];

  if (recinto.ambito === 'RURAL') {

    const vocalesEncontrados = new Set(permitidos.filter(c => c.tipo === 'VOCAL')

      .map(c => normalizarLista(c.numero_lista)));

    const faltantes = listaVocal.filter(lista => !vocalesEncontrados.has(normalizarLista(lista)));

    if (faltantes.length) {

      throw new HttpError(409, `Faltan registros VOCAL en cf_candidatos para las listas: ${faltantes.join(', ')}. Ejecute la migración SQL.`);

    }

  }

  const ids = new Set(permitidos.map(c => Number(c.id)));

  if (ids.size !== detalle.size || [...ids].some(id => !detalle.has(id))) {

    throw new HttpError(400, 'Envíe exactamente los candidatos válidos para este recinto. Use 0 donde corresponda.');

  }

  const totales = { ALCALDE: 0, CONCEJAL: 0, VOCAL: 0 };

  for (const c of permitidos) {

    const n = detalle.get(Number(c.id));

    if (n > padron) throw new HttpError(400, `${c.nombre}: ${n} supera el máximo ${padron}.`);

    totales[c.tipo] += n;

  }

  for (const tipo of ['ALCALDE', 'CONCEJAL', 'VOCAL']) {

    const especial = especiales[tipo];

    const total = totales[tipo] + especial.nulos + especial.blancos;

    if (total > padron) {

      throw new HttpError(400, `${tipo}: candidaturas + nulos + blancos (${total}) superan el máximo ${padron}.`);

    }

    if (Number(anteriores[tipo] || 0) + total > recinto.electores) {

      throw new HttpError(409, `Recinto ${recinto.codigo}: el total de ${tipo} supera ${recinto.electores} electores.`);

    }

    totales[tipo] = total;

  }

  return totales;

}



async function catalogos(_req, res) {

  res.set('Cache-Control', 'no-store');

  try {

    const eleccionIdActual = eleccionId();

    const [juntas, candidatos] = await Promise.all([

      sequelize.query(`

        SELECT j.id, j.recinto_id, r.codigo_recinto, j.numero, j.tipo,

               j.padron, j.numeracion_verificada,

               r.nombre AS recinto, r.parroquia, r.direccion,

               CONCAT(r.nombre, ' · ', IF(j.tipo='F','Femenina','Masculina'),

                      ' ', LPAD(j.numero,3,'0')) AS etiqueta

          FROM juntas j

          JOIN recintos r ON r.id = j.recinto_id

         WHERE j.activo = 1 AND r.activo = 1

         ORDER BY r.codigo_recinto, j.tipo, j.numero, j.id

      `, { type: QueryTypes.SELECT }),

      sequelize.query(`

        SELECT id, nombre, tipo, modalidad, numero_lista, circunscripcion_id, ambito

          FROM cf_candidatos

         WHERE eleccion_id = :eleccionId AND activo = 1

         ORDER BY FIELD(tipo, 'ALCALDE', 'CONCEJAL', 'VOCAL'), numero_lista, id

      `, { type: QueryTypes.SELECT, replacements: { eleccionId: eleccionIdActual } })

    ]);

    const juntasConPadron = juntas.map(j => {

      // Si falta el código CNE, se envía la junta para el diagnóstico del frontend.*

      const codigo = idPositivo(j.codigo_recinto);

      const recinto = codigo ? RECINTOS[String(codigo)] : null;

      const limite = recinto

        ? resolverPadron(j.padron, { codigo, ...recinto })

        : { padron: null, padron_fuente: 'CODIGO_RECINTO_INVALIDO' };

      return { ...j, padron: limite.padron, padron_fuente: limite.padron_fuente };

    });

    return res.json({

      ok: true, data: {

        eleccion_id: eleccionIdActual, juntas: juntasConPadron, candidatos

      }

    });

  } catch (error) { return responderError(res, error, 'catalogos'); }

}



async function registroPorJunta(req, res) {

  res.set('Cache-Control', 'no-store');

  try {

    const juntaId = idPositivo(req.params.juntaId);

    if (!juntaId) throw new HttpError(400, 'El ID de la junta no es válido.');

    const eleccionIdActual = eleccionId();

    const registros = await sequelize.query(`

      SELECT id, junta_id, eleccion_id, estado, observaciones,

             fecha_registro, fecha_actualizacion

        FROM cf_registros

       WHERE junta_id = :juntaId AND eleccion_id = :eleccionId

       LIMIT 1

    `, { type: QueryTypes.SELECT, replacements: { juntaId, eleccionId: eleccionIdActual } });

    if (!registros.length) return res.json({ ok: true, data: null });

    const registro = registros[0];

    const votos = await sequelize.query(`

      SELECT v.candidato_id, v.votos, c.nombre, c.tipo

        FROM cf_registro_votos v

        JOIN cf_candidatos c ON c.id = v.candidato_id

       WHERE v.registro_id = :registroId

       ORDER BY FIELD(c.tipo, 'ALCALDE', 'CONCEJAL', 'VOCAL'), c.id

    `, { type: QueryTypes.SELECT, replacements: { registroId: registro.id } });

    const especialesRows = await sequelize.query(`

      SELECT tipo, nulos, blancos FROM cf_registro_especiales

      WHERE registro_id = :registroId

    `, { type: QueryTypes.SELECT, replacements: { registroId: registro.id } });

    const especiales = Object.fromEntries(especialesRows.map(f => [f.tipo, {

      nulos: Number(f.nulos), blancos: Number(f.blancos)

    }]));

    const [cierre] = await sequelize.query(`

      SELECT fecha_cierre FROM cf_registro_cierres

      WHERE registro_id = :registroId LIMIT 1

    `, { type: QueryTypes.SELECT, replacements: { registroId: registro.id } });

    const [foto] = await sequelize.query(`

      SELECT mime, tamano_bytes, sha256, actualizado_en

      FROM cf_registro_evidencias WHERE registro_id = :registroId LIMIT 1

    `, { type: QueryTypes.SELECT, replacements: { registroId: registro.id } });

    return res.json({

      ok: true, data: {

        ...registro, votos, especiales,

        estado: cierre ? 'FINALIZADO' : registro.estado,

        bloqueado: !!cierre,

        fecha_cierre: cierre?.fecha_cierre || null,

        evidencia: foto ? {

          disponible: true, mime: foto.mime,

          bytes: Number(foto.tamano_bytes), sha256: foto.sha256,

          actualizado_en: foto.actualizado_en

        } : null

      }

    });

  } catch (error) { return responderError(res, error, 'registroPorJunta'); }

}



async function persistir(req, res, requiereExistente) {

  try {

    const { juntaId, detalle } = validarDetalle(req.body);

    const eleccionIdActual = eleccionId();

    if (requiereExistente && idPositivo(req.params.juntaId) !== juntaId) {

      throw new HttpError(400, 'El ID de la ruta y del cuerpo deben coincidir.');

    }

    const resultado = await sequelize.transaction(async transaction => {

      const select = { transaction, type: QueryTypes.SELECT };

      // Bloquea la FILA DEL RECINTO. Todas las escrituras de este controlador*

      // usan el mismo bloqueo: dos juntas del mismo recinto no se validan en paralelo.*

      const juntas = await sequelize.query(`

        SELECT j.id, j.recinto_id, j.padron, j.numeracion_verificada,

               r.codigo_recinto

          FROM juntas j

          JOIN recintos r ON r.id = j.recinto_id

         WHERE j.id = :juntaId AND j.activo = 1 AND r.activo = 1

         LIMIT 1

      `, { ...select, replacements: { juntaId } });

      if (!juntas.length) throw new HttpError(404, 'La junta no existe o está inactiva.');

      const junta = juntas[0];

      const recinto = obtenerRecinto(junta.codigo_recinto);

      // Primero bloquear recinto y después junta para serializar correctamente.*

      await sequelize.query('SELECT id FROM recintos WHERE id = :recintoId FOR UPDATE', {

        ...select, replacements: { recintoId: junta.recinto_id }

      });

      await sequelize.query('SELECT id FROM juntas WHERE id = :juntaId FOR UPDATE', {

        ...select, replacements: { juntaId }

      });

      const limite = resolverPadron(junta.padron, recinto);

      if (limite.padron === null) {

        throw new HttpError(409, limite.padron_fuente === 'INVALIDO'

          ? 'El padrón de la junta es inválido; revise juntas.padron.'

          : 'Falta el padrón oficial de esta junta. Configure juntas.padron o habilite CF_PADRON_PRUEBAS=1 SOLO para simulación.');

      }

      if (process.env.CF_EXIGIR_NUMERACION_VERIFICADA !== '0' &&

        Number(junta.numeracion_verificada) !== 1) {

        throw new HttpError(409, 'La numeración de esta junta no está verificada.');

      }



      const candidatos = await sequelize.query(`

        SELECT id, nombre, tipo, numero_lista, ambito

          FROM cf_candidatos

         WHERE eleccion_id = :eleccionId AND activo = 1

      `, { ...select, replacements: { eleccionId: eleccionIdActual } });



      const anterioresFilas = await sequelize.query(`

        SELECT c.tipo, COALESCE(SUM(v.votos), 0) AS total

          FROM juntas j

          JOIN recintos r ON r.id = j.recinto_id

          JOIN cf_registros cr

            ON cr.junta_id = j.id AND cr.eleccion_id = :eleccionId

           AND cr.estado = 'CONFIRMADO'

          JOIN cf_registro_votos v ON v.registro_id = cr.id

          JOIN cf_candidatos c ON c.id = v.candidato_id

         WHERE r.codigo_recinto = :codigoRecinto AND j.id <> :juntaId

           AND c.tipo IN ('ALCALDE', 'CONCEJAL', 'VOCAL')

         GROUP BY c.tipo

      `, { ...select, replacements: { eleccionId: eleccionIdActual, codigoRecinto: recinto.codigo, juntaId } });

      const anteriores = Object.fromEntries(anterioresFilas.map(f => [f.tipo, Number(f.total)]));

      const extrasPrevias = await sequelize.query(`

        SELECT e.tipo, COALESCE(SUM(e.nulos + e.blancos), 0) AS total

        FROM recintos r

        JOIN juntas j ON j.recinto_id = r.id

        JOIN cf_registros cr ON cr.junta_id = j.id

          AND cr.eleccion_id = :eleccionId AND cr.estado = 'CONFIRMADO'

        JOIN cf_registro_especiales e ON e.registro_id = cr.id

        WHERE r.codigo_recinto = :codigoRecinto AND j.id <> :juntaId

        GROUP BY e.tipo

      `, { ...select, replacements: { eleccionId: eleccionIdActual, codigoRecinto: recinto.codigo, juntaId } });

      for (const f of extrasPrevias) anteriores[f.tipo] = Number(anteriores[f.tipo] || 0) + Number(f.total);

      const especiales = validarEspeciales(req.body, recinto.ambito);

      const totales = validarCandidatosYTotales(detalle, candidatos, recinto, limite.padron, anteriores, especiales);



      const previos = await sequelize.query(`

        SELECT id FROM cf_registros

         WHERE eleccion_id = :eleccionId AND junta_id = :juntaId

         LIMIT 1 FOR UPDATE

      `, { ...select, replacements: { eleccionId: eleccionIdActual, juntaId } });

      let registroId;

      const creado = !previos.length;

      if (!creado) {

        registroId = Number(previos[0].id);

        const cierres = await sequelize.query(`

          SELECT registro_id FROM cf_registro_cierres

          WHERE registro_id = :registroId LIMIT 1 FOR UPDATE

        `, { ...select, replacements: { registroId } });

        if (cierres.length) {

          throw new HttpError(409, 'Junta FINALIZADA: no se pueden modificar los votos.');

        }

        // No borrar silenciosamente votos previos de candidaturas ahora excluidas*

        // (por ejemplo, la antigua lista 4 de concejalía rural).*

        const previosNoPermitidos = await sequelize.query(`

          SELECT v.candidato_id, c.nombre, v.votos

          FROM cf_registro_votos v

          JOIN cf_candidatos c ON c.id = v.candidato_id

          WHERE v.registro_id = :registroId AND v.votos > 0

        `, { ...select, replacements: { registroId } });

        const noPermitidos = previosNoPermitidos.filter(v => !detalle.has(Number(v.candidato_id)));

        if (noPermitidos.length) {

          throw new HttpError(409,

            'La junta tiene votos previos de candidatos que ya no pertenecen al catálogo actual. ' +

            'Revise los registros históricos antes de actualizar: ' +

            noPermitidos.map(v => `${String(v.nombre).trim()} (${v.votos})`).join(', '));

        }

        await sequelize.query(`

          UPDATE cf_registros

             SET estado = 'CONFIRMADO', fecha_actualizacion = CURRENT_TIMESTAMP

           WHERE id = :registroId

        `, { transaction, replacements: { registroId } });

        await sequelize.query('DELETE FROM cf_registro_votos WHERE registro_id = :registroId', {

          transaction, replacements: { registroId }

        });

        await sequelize.query('DELETE FROM cf_registro_especiales WHERE registro_id = :registroId', {

          transaction, replacements: { registroId }

        });

      } else {

        if (requiereExistente) throw new HttpError(404, 'Esta junta aún no tiene registro para actualizar.');

        await sequelize.query(`

          INSERT INTO cf_registros (eleccion_id, junta_id, estado)

          VALUES (:eleccionId, :juntaId, 'CONFIRMADO')

        `, { transaction, replacements: { eleccionId: eleccionIdActual, juntaId } });

        const ids = await sequelize.query('SELECT LAST_INSERT_ID() AS id', select);

        registroId = Number(ids[0].id);

      }



      for (const [candidatoId, votos] of detalle.entries()) {

        await sequelize.query(`

          INSERT INTO cf_registro_votos (registro_id, candidato_id, votos)

          VALUES (:registroId, :candidatoId, :votos)

        `, { transaction, replacements: { registroId, candidatoId, votos } });

      }

      for (const tipo of (recinto.ambito === 'RURAL' ? ['ALCALDE', 'CONCEJAL', 'VOCAL'] : ['ALCALDE', 'CONCEJAL'])) {

        await sequelize.query(`

          INSERT INTO cf_registro_especiales (registro_id, tipo, nulos, blancos)

          VALUES (:registroId, :tipo, :nulos, :blancos)

        `, {

          transaction, replacements: {

            registroId, tipo,

            nulos: especiales[tipo].nulos, blancos: especiales[tipo].blancos

          }

        });

      }

      return {

        registro_id: registroId, junta_id: juntaId, codigo_recinto: recinto.codigo,

        estado: 'CONFIRMADO', creado, padron: limite.padron,

        padron_fuente: limite.padron_fuente, totales, especiales

      };

    });

    return res.status(resultado.creado ? 201 : 200).json({

      ok: true, message: resultado.creado ? 'Registro creado.' : 'Registro actualizado.', data: resultado

    });

  } catch (error) { return responderError(res, error, requiereExistente ? 'actualizar' : 'guardar'); }

}



async function guardar(req, res) { return persistir(req, res, false); }

async function actualizar(req, res) { return persistir(req, res, true); }



async function eliminar(req, res) {

  try {

    const juntaId = idPositivo(req.params.juntaId);

    if (!juntaId) throw new HttpError(400, 'El ID de junta no es válido.');

    const eleccionIdActual = eleccionId();

    const resultado = await sequelize.transaction(async transaction => {

      // Las eliminaciones siguen el MISMO bloqueo del recinto para evitar carreras.*

      const juntas = await sequelize.query(`

        SELECT j.id, j.recinto_id, r.codigo_recinto

          FROM juntas j JOIN recintos r ON r.id = j.recinto_id

         WHERE j.id = :juntaId LIMIT 1

      `, { transaction, type: QueryTypes.SELECT, replacements: { juntaId } });

      if (!juntas.length) throw new HttpError(404, 'Junta no encontrada.');

      await sequelize.query('SELECT id FROM recintos WHERE id = :recintoId FOR UPDATE', {

        transaction, type: QueryTypes.SELECT, replacements: { recintoId: juntas[0].recinto_id }

      });

      await sequelize.query('SELECT id FROM juntas WHERE id = :juntaId FOR UPDATE', {

        transaction, type: QueryTypes.SELECT, replacements: { juntaId }

      });

      const filas = await sequelize.query(`

        SELECT id FROM cf_registros

         WHERE eleccion_id = :eleccionId AND junta_id = :juntaId

         LIMIT 1 FOR UPDATE

      `, { transaction, type: QueryTypes.SELECT, replacements: { eleccionId: eleccionIdActual, juntaId } });

      if (!filas.length) throw new HttpError(404, 'No existe registro en esta junta.');

      const registroId = Number(filas[0].id);

      const cierres = await sequelize.query(`

        SELECT registro_id FROM cf_registro_cierres

        WHERE registro_id = :registroId LIMIT 1 FOR UPDATE

      `, { transaction, type: QueryTypes.SELECT, replacements: { registroId } });

      if (cierres.length) {

        throw new HttpError(409, 'Junta FINALIZADA: no se puede eliminar su registro.');

      }

      await sequelize.query('DELETE FROM cf_registro_evidencias WHERE registro_id = :registroId', {

        transaction, replacements: { registroId }

      });

      await sequelize.query('DELETE FROM cf_registro_votos WHERE registro_id = :registroId', {

        transaction, replacements: { registroId }

      });

      await sequelize.query('DELETE FROM cf_registro_especiales WHERE registro_id = :registroId', {

        transaction, replacements: { registroId }

      });

      await sequelize.query('DELETE FROM cf_registros WHERE id = :registroId', {

        transaction, replacements: { registroId }

      });

      return { registro_id: registroId, junta_id: juntaId };

    });

    return res.json({ ok: true, message: 'Registro eliminado.', data: resultado });

  } catch (error) { return responderError(res, error, 'eliminar'); }

}



async function resumen(_req, res) {

  res.set('Cache-Control', 'no-store');

  try {

    const eleccionIdActual = eleccionId();

    const [candidatos, juntas] = await Promise.all([

      sequelize.query(`

        SELECT c.id AS candidato_id, c.nombre, c.tipo, c.modalidad, c.numero_lista, c.ambito,

               COALESCE(SUM(CASE WHEN r.estado = 'CONFIRMADO'

                 AND r.eleccion_id = :eleccionId THEN v.votos ELSE 0 END), 0) AS total_votos

          FROM cf_candidatos c

          LEFT JOIN cf_registro_votos v ON v.candidato_id = c.id

          LEFT JOIN cf_registros r ON r.id = v.registro_id

         WHERE c.eleccion_id = :eleccionId AND c.activo = 1

         GROUP BY c.id, c.nombre, c.tipo, c.modalidad, c.numero_lista, c.ambito

         ORDER BY FIELD(c.tipo,'ALCALDE','CONCEJAL','VOCAL'), total_votos DESC

      `, { type: QueryTypes.SELECT, replacements: { eleccionId: eleccionIdActual } }),

      sequelize.query(`

        SELECT COUNT(*) AS juntas_confirmadas FROM cf_registros

         WHERE eleccion_id = :eleccionId AND estado = 'CONFIRMADO'

      `, { type: QueryTypes.SELECT, replacements: { eleccionId: eleccionIdActual } })

    ]);

    let especiales = null;
    try {
      especiales = await consultarEspecialesConfirmados({
        sequelize, QueryTypes, eleccionId: eleccionIdActual, recintos: RECINTOS,
      });
    } catch (error) {
      // Conservar las candidaturas si solo falla la consulta de especiales.
      console.error('[ConteoFast resumen especiales]', error);
    }

    return res.json({

      ok: true, data: {

        eleccion_id: eleccionIdActual, juntas_confirmadas: Number(juntas[0]?.juntas_confirmadas || 0),

        candidatos, especiales

      }

    });

  } catch (error) { return responderError(res, error, 'resumen'); }

}



async function recintosEstado(_req, res) {

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  try {

    const eleccionIdActual = eleccionId();

    const filas = await sequelize.query(`

      SELECT r.id AS recinto_id, r.codigo_recinto, r.nombre AS recinto_nombre,

             r.parroquia, r.direccion, j.id AS junta_id,

             j.numero AS junta_numero, j.tipo AS junta_tipo, j.padron,

             cr.estado AS registro_estado, cr.fecha_actualizacion AS actualizado_en,

             cierre.registro_id AS cerrado_id, cierre.fecha_cierre

        FROM juntas j

        JOIN recintos r ON r.id = j.recinto_id

        LEFT JOIN cf_registros cr ON cr.junta_id = j.id AND cr.eleccion_id = :eleccionId

        LEFT JOIN cf_registro_cierres cierre ON cierre.registro_id = cr.id

       WHERE j.activo = 1 AND r.activo = 1

       ORDER BY r.codigo_recinto, CAST(j.numero AS UNSIGNED), j.tipo, j.id

    `, { type: QueryTypes.SELECT, replacements: { eleccionId: eleccionIdActual } });

    const mapa = new Map();

    for (const fila of filas) {

      const id = String(fila.recinto_id);

      if (!mapa.has(id)) {

        mapa.set(id, {

          id, codigo_recinto: fila.codigo_recinto == null ? null : Number(fila.codigo_recinto),

          nombre: String(fila.recinto_nombre || ''), parroquia: String(fila.parroquia || ''),

          direccion: String(fila.direccion || ''), total_juntas: 0,

          confirmadas: 0, finalizadas: 0, en_revision: 0, pendientes: 0, juntas: []

        });

      }

      const recinto = mapa.get(id);

      const raw = String(fila.registro_estado || '').trim().toUpperCase();

      const estado = fila.cerrado_id != null ? 'FINALIZADO' :

        raw === 'CONFIRMADO' ? 'CONFIRMADO' : raw ? 'EN_REVISION' : 'PENDIENTE';

      const codigo = idPositivo(fila.codigo_recinto);

      const meta = codigo ? RECINTOS[String(codigo)] : null;

      const limite = meta ? resolverPadron(fila.padron, { codigo, ...meta }) :

        { padron: null, padron_fuente: 'CODIGO_RECINTO_INVALIDO' };

      recinto.juntas.push({

        id: String(fila.junta_id), numero: String(fila.junta_numero ?? ''),

        tipo: String(fila.junta_tipo || ''), padron: limite.padron,

        padron_fuente: limite.padron_fuente,

        estado, actualizado_en: fila.actualizado_en || null,

        fecha_cierre: fila.fecha_cierre || null

      });

      recinto.total_juntas += 1;

      if (estado === 'FINALIZADO') { recinto.finalizadas++; recinto.confirmadas += 1; }

      else if (estado === 'CONFIRMADO') recinto.confirmadas += 1;

      else { recinto.pendientes += 1; if (estado === 'EN_REVISION') recinto.en_revision += 1; }

    }

    const recintos = [...mapa.values()];

    const totales = recintos.reduce((a, r) => {

      a.juntas += r.total_juntas;

      a.confirmadas += r.confirmadas;

      a.finalizadas += r.finalizadas;

      a.en_revision += r.en_revision;

      a.pendientes += r.pendientes;

      if (r.pendientes > 0) a.recintos_pendientes += 1;

      return a;

    }, {

      recintos: recintos.length, recintos_pendientes: 0,

      juntas: 0, confirmadas: 0, finalizadas: 0, en_revision: 0, pendientes: 0

    });

    return res.json({

      ok: true, data: {

        eleccion_id: eleccionIdActual,

        consultado_en: new Date().toISOString(), totales, recintos

      }

    });

  } catch (error) { return responderError(res, error, 'recintosEstado'); }

}



module.exports = { catalogos, registroPorJunta, guardar, actualizar, eliminar, resumen, recintosEstado };

// Funciones puras exportadas únicamente para pruebas unitarias.*

module.exports._internals = { obtenerRecinto, resolverPadron, candidatosPermitidos, validarDetalle, validarCandidatosYTotales, validarEspeciales };
