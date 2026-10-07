-- Adjuntos en mails salientes de la Bandeja comercial. Los archivos se mandan
-- por SMTP y no se guardan en el servidor; solo queda registro de nombre y
-- tamaño para que la Bandeja muestre que el mail salio con adjuntos.
-- Formato: [{"nombre": "cotizacion.pdf", "bytes": 123456}]

ALTER TABLE comercial_mails ADD COLUMN IF NOT EXISTS adjuntos JSONB;
