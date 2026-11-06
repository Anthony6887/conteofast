'use strict';
module.exports = (...roles) => (req,res,next) => {
  const r = req.operador?.rol;
  if(!r || !(r==='ADMIN'||roles.includes(r)))return res.status(403).json({ok:false,message:'No tiene permisos para esta operación.'});
  next();
};
