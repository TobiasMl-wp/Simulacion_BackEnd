// Archivo: routes/zonas.js

const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Importa la configuración de la base de datos

// Ruta para obtener las zonas desde la base de datos
router.get('/zonas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM zonas');
        res.json(result.rows); // Devuelve las zonas en formato JSON
    } catch (error) {
        console.error('Error al obtener las zonas:', error);
        res.status(500).json({ error: 'Error al obtener las zonas' });
    }
});

module.exports = router;
