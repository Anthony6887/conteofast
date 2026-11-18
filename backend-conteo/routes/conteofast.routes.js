'use strict';
const express = require('express');
const controller = require('../controllers/conteofast.controller');
const actas = require('../controllers/conteofast.evidencias.controller');
const router = express.Router();
router.get('/catalogos', controller.catalogos);
router.get('/resumen', controller.resumen);
router.get('/recintos-estado', controller.recintosEstado);
// PNG sin pérdida, cuerpo binario. Máximo 30 MiB.
router.post('/registro/:juntaId/foto',
  express.raw({ type: 'image/png', limit: '30mb' }),
  actas.subirFoto);
router.get('/registro/:juntaId/foto', actas.obtenerFoto);
// Descarga con Content-Disposition: attachment, filename=acta_junta_ID.png
router.get('/registro/:juntaId/foto/descargar', actas.descargarFoto);
router.post('/registro/:juntaId/finalizar', actas.finalizarJunta);
router.get('/registro/:juntaId', controller.registroPorJunta);
router.post('/registro', controller.guardar);
router.put('/registro/:juntaId', controller.actualizar);
router.delete('/registro/:juntaId', controller.eliminar);

const dignidades = require('../controllers/conteofast.dignidades.controller');
router.get('/registro/:juntaId/dignidades', dignidades.estado);
router.put('/registro/:juntaId/dignidad/:tipo', express.json(), dignidades.guardar);
router.post('/registro/:juntaId/dignidad/:tipo/foto',
  express.raw({ type: 'image/png', limit: '30mb' }), dignidades.subirFoto);
router.get('/registro/:juntaId/dignidad/:tipo/foto', dignidades.obtenerFoto);
router.post('/registro/:juntaId/dignidad/:tipo/finalizar', dignidades.finalizar);

const revision = require('../controllers/conteofast.revision.controller');
router.get('/revision-actas', revision.recintosConActas);


module.exports = router;
