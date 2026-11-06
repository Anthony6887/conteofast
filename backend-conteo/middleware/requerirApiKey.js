'use strict';
const crypto = require('node:crypto');

module.exports = function requerirApiKey(req, res, next) {
  const esperado = process.env.API_ADMIN_TOKEN || '';
  if (esperado.length < 32) {
    return res.status(503).json({ ok: false, message: 'API_ADMIN_TOKEN no configurado o demasiado corto (mínimo 32 caracteres).' });
  }
  const auth = req.get('authorization') || '';
  const recibido = auth.startsWith('Bearer ') ? auth.slice(7) : (req.get('x-api-key') || '');
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, message: 'Credenciales de escritura inválidas.' });
  }
  next();
};
