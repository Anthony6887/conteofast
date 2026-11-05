'use strict';

const db = require('../models');

exports.obtenerDeudas = async (req, res) => {
    try {
        const { identificacion } = req.body;

        /* ===============================
           VALIDACIONES
        =============================== */
        if (!identificacion) {
            return res.status(400).json({
                ok: false,
                message: 'Debe enviar la identificación',
            });
        }

        if (!/^[0-9]+$/.test(identificacion)) {
            return res.status(400).json({
                ok: false,
                message: 'La identificación debe contener solo números',
            });
        }

        /* ===============================
           PERSONA
        =============================== */
        const personaResult = await db.sequelize.query(
            `
      SELECT DISTINCT
             CEDULA_RUC,
             CIU,
             NOMBRES
      FROM WEB_DEUDAS
      WHERE CEDULA_RUC = :identificacion
         OR CIU = :identificacion
      `,
            {
                replacements: { identificacion },
                type: db.Sequelize.QueryTypes.SELECT,
            }
        );

        if (!personaResult.length) {
            return res.status(404).json({
                ok: false,
                message: 'No se encontraron registros',
            });
        }

        const persona = personaResult[0];

        /* ===============================
           POR IMPUESTO
        =============================== */
        const porImpuesto = await db.sequelize.query(
            `
      SELECT 
        COUNT(NROEMISION) AS CANTIDAD,
        IMPUESTO,
        ROUND(
          SUM(NVL(EMISION,0)) +
          SUM(NVL(INTERES,0)) +
          SUM(NVL(COACTIVA,0)) +
          SUM(NVL(RECARGO,0)) -
          SUM(NVL(DESCUENTO,0)) +
          SUM(NVL(IVA,0)),
        2) AS TOTAL
      FROM WEB_DEUDAS
      WHERE CEDULA_RUC = :identificacion
         OR CIU = :identificacion
      GROUP BY IMPUESTO
      `,
            {
                replacements: { identificacion },
                type: db.Sequelize.QueryTypes.SELECT,
            }
        );

        /* ===============================
           POR AÑO
        =============================== */
        const porAnio = await db.sequelize.query(
            `
      SELECT
        ANIO,
        ROUND(
          SUM(NVL(EMISION,0)) +
          SUM(NVL(INTERES,0)) +
          SUM(NVL(COACTIVA,0)) +
          SUM(NVL(RECARGO,0)) -
          SUM(NVL(DESCUENTO,0)) +
          SUM(NVL(IVA,0)),
        2) AS TOTAL
      FROM WEB_DEUDAS
      WHERE CEDULA_RUC = :identificacion
         OR CIU = :identificacion
      GROUP BY ANIO
      ORDER BY ANIO DESC
      `,
            {
                replacements: { identificacion },
                type: db.Sequelize.QueryTypes.SELECT,
            }
        );

        /* ===============================
           RESÚMENES
        =============================== */
        const totalGeneral = porImpuesto
            .reduce((sum, i) => sum + Number(i.TOTAL), 0);

        /* ===============================
           RESPUESTA FINAL
        =============================== */
        return res.status(200).json({
            ok: true,
            message: 'Consulta realizada correctamente',
            persona: {
                nombres: persona.NOMBRES,
                cedula_ruc: persona.CEDULA_RUC,
                ciu: persona.CIU,
            },
            resumen: {
                totalGeneral: Number(totalGeneral.toFixed(2)),
                totalAnios: porAnio.length,
            },
            porImpuesto: porImpuesto.map(i => ({
                impuesto: i.IMPUESTO,
                cantidad: i.CANTIDAD,
                total: Number(i.TOTAL),
            })),
            porAnio: porAnio.map(a => ({
                anio: a.ANIO,
                total: Number(a.TOTAL),
            })),
        });

    } catch (error) {
        console.error('Error obtenerDeudas:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno del servidor',
        });
    }
};
