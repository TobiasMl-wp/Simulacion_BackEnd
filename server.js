const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Configurar la conexión a PostgreSQL
const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Pay_Scan_DB',
  password: 'toto30280102',
  port: 5432,
});

client.connect();

// Inicializa el índice para la simulación de zonas
let zonaActualIndex = 0;

// Endpoint para obtener todas las zonas disponibles (incluye Descripcion)
app.get('/api/zonas', async (req, res) => {
  try {
    const result = await client.query('SELECT id_zona, nombre_zona, descripcion FROM Zonas');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error al obtener las zonas:', error);
    res.status(500).json({ mensaje: 'Error al obtener las zonas' });
  }
});

// Iniciar el viaje
app.post('/api/iniciar-viaje', async (req, res) => {
  const { numeroTarjeta } = req.body;
  try {
    const tarjetaQuery = 'SELECT id, saldo FROM tarjetas WHERE numero_tarjeta = $1';
    const tarjetaResult = await client.query(tarjetaQuery, [numeroTarjeta]);

    if (tarjetaResult.rows.length === 0) {
      return res.status(400).json({ mensaje: 'Tarjeta no encontrada' });
    }

    const tarjeta = tarjetaResult.rows[0];

    if (tarjeta.saldo < 1000) {
      return res.status(400).json({ mensaje: 'Saldo insuficiente. Se requiere al menos $1000 para iniciar el viaje.' });
    }

    const nuevoSaldo = tarjeta.saldo - 1000;
    const actualizarSaldoQuery = 'UPDATE tarjetas SET saldo = $1 WHERE id = $2';
    await client.query(actualizarSaldoQuery, [nuevoSaldo, tarjeta.id]);

    const query = `
      INSERT INTO Viajes (Id_Tarjeta, Zona_Origen, Tarifa, numero_tarjeta)
      VALUES ($1, $2, 1000, $3)
      RETURNING Id_Viaje;
    `;
    const result = await client.query(query, [tarjeta.id, 1, numeroTarjeta]); // Siempre inicia en zona 1
    const idViaje = result.rows[0].id_viaje;

    res.status(200).json({ mensaje: 'Viaje iniciado exitosamente', idViaje, nuevoSaldo });
  } catch (error) {
    console.error('Error al iniciar el viaje:', error.message);
    res.status(500).json({ mensaje: `Error al iniciar el viaje: ${error.message}` });
  }
});

// Finalizar el viaje y ajustar tarifa dinámica
app.post('/api/finalizar-viaje', async (req, res) => {
  const { idViaje, zonaDestino } = req.body;
  try {
    const viajeQuery = `
      SELECT V.Zona_Origen, T.id, T.saldo
      FROM Viajes V
      JOIN tarjetas T ON V.Id_Tarjeta = T.id
      WHERE V.Id_Viaje = $1;
    `;
    const viajeResult = await client.query(viajeQuery, [idViaje]);
    const { zona_origen, id, saldo } = viajeResult.rows[0];

    const tarifaQuery = `
      SELECT tarifa 
      FROM Tarifas_Zonas 
      WHERE Zona_Origen = $1 AND Zona_Destino = $2 
      LIMIT 1;
    `;
    const tarifaResult = await client.query(tarifaQuery, [zona_origen, zonaDestino]);

    let tarifaFinal = 1000;
    if (tarifaResult.rows.length > 0) {
      tarifaFinal = tarifaResult.rows[0].tarifa;
    }

    const tarifaInicial = 1000;
    let ajusteSaldo = 0;

    if (tarifaFinal < tarifaInicial) {
      ajusteSaldo = tarifaInicial - tarifaFinal;
    } else if (tarifaFinal > tarifaInicial) {
      ajusteSaldo = -(tarifaFinal - tarifaInicial);
    }

    const nuevoSaldo = parseFloat(saldo) + ajusteSaldo;

    if (nuevoSaldo < 0) {
      return res.status(400).json({ mensaje: 'El saldo no puede ser negativo.' });
    }

    const actualizarSaldoQuery = 'UPDATE tarjetas SET saldo = $1 WHERE id = $2';
    await client.query(actualizarSaldoQuery, [nuevoSaldo, id]);

    const updateViajeQuery = 'UPDATE Viajes SET Zona_Destino = $1, Tarifa = $2 WHERE Id_Viaje = $3';
    await client.query(updateViajeQuery, [zonaDestino, tarifaFinal, idViaje]);

    // Reiniciar el índice de la zona
    zonaActualIndex = 0;

    res.status(200).json({ mensaje: 'Viaje finalizado exitosamente', tarifaFinal, nuevoSaldo });
  } catch (error) {
    console.error('Error al finalizar el viaje:', error.message);
    res.status(500).json({ mensaje: `Error al finalizar el viaje: ${error.message}` });
  }
});

// Obtener la siguiente zona (incluyendo la descripción)
app.get('/api/siguiente-zona', async (req, res) => {
  try {
    const zonasQuery = 'SELECT id_zona, nombre_zona, descripcion FROM Zonas ORDER BY id_zona ASC';
    const zonasResult = await client.query(zonasQuery);
    const zonas = zonasResult.rows;

    if (zonaActualIndex >= zonas.length) {
      zonaActualIndex = 0;
    }
    const zonaActual = zonas[zonaActualIndex];
    zonaActualIndex++;

    res.status(200).json(zonaActual);
  } catch (error) {
    console.error('Error al obtener la siguiente zona:', error);
    res.status(500).json({ mensaje: 'Error al obtener la siguiente zona' });
  }
});

// Iniciar el servidor
app.listen(4000, () => {
  console.log('Servidor corriendo en el puerto 4000');
});
