-- Resumen con IA guardado por mail entrante (antes solo se generaba para
-- contactos ya conocidos, dentro de comercial_seguimientos; ahora se guarda
-- siempre en comercial_mails para poder mostrarlo en la bandeja).
ALTER TABLE comercial_mails ADD COLUMN IF NOT EXISTS resumen_ia TEXT;
