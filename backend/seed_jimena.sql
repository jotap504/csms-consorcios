DELETE FROM usuarios WHERE email = 'jimena@gmail.com';
INSERT INTO usuarios (email, password_hash, rol)
VALUES ('jimena@gmail.com', '$2a$10$tmyx.gXxPOG222niasMmV.dmKP/d9brTmxsJqwm58RWz2ArVru7Du', 'superadmin');
