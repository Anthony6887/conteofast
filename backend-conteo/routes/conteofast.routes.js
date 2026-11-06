'use strict';

const express = require('express');
const controller = require('../controllers/conteofast.controller');

const router = express.Router();

router.get('/catalogos', controller.catalogos);
router.get('/resumen', controller.resumen);
router.get('/registro/:juntaId', controller.registroPorJunta);
router.post('/registro', controller.guardar);
router.put('/registro/:juntaId', controller.actualizar);
router.delete('/registro/:juntaId', controller.eliminar);

module.exports = router;

