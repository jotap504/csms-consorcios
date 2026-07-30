const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Without this handler, a network blip on an idle client (ECONNRESET, etc.)
// throws an unhandled 'error' event and crashes the whole process.
pool.on('error', (err) => {
  console.error('Error inesperado en el pool de Postgres:', err.message);
});

module.exports = { pool };
