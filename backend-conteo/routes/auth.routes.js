const express = require('express');
const router = express.Router();

const {obtenerDeudas } = require('../controllers/lecturas.controller');

router.post('/deudas', obtenerDeudas);


module.exports = router;
