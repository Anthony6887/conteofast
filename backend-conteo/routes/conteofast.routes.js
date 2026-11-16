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
module.exports = router;
