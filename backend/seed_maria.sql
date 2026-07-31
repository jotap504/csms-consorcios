INSERT INTO usuarios (email, password_hash, rol, uf_id)
VALUES ('maria.gonzalez@example.com', '$2a$10$iEt/4T.n.clossYiWj7l0.TvOOq15QOWnGkELplv7ZQjZtTatIGn2', 'residente', 3)
ON CONFLICT (email) DO NOTHING;
