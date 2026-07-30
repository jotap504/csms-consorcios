ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('superadmin', 'consorcio_admin', 'residente', 'instalador'));
