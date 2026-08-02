const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'apiperu_cache',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '-05:00', // Lima, Perú
});

// Verificar conexión al arrancar
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL conectado correctamente');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Error al conectar MySQL:', err.message);
    process.exit(1);
  });

module.exports = pool;
