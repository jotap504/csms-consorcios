CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('superadmin', 'consorcio_admin', 'residente')),
    consorcio_id INT REFERENCES consorcios(id) ON DELETE CASCADE,
    uf_id INT REFERENCES unidades_funcionales(id) ON DELETE CASCADE,
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
