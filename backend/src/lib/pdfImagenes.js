// Rasteriza paginas de un PDF a imagenes JPEG via poppler-utils (pdftoppm),
// para los casos en que el PDF es un escaneo/foto sin texto seleccionable y
// pdf-parse no devuelve nada util. Se usa como fallback en las rutas de
// importar-preview (contactos y catalogo-items) y en /campanias/imagen-subir.
//
// -scale-to (en vez de -r/dpi fijo) limita el lado mas largo a ese tamaño en
// pixeles sea cual sea el tamaño fisico de pagina del PDF - un PDF con una
// pagina grande (ej. un afiche A3 escaneado) con DPI fijo puede dar un
// archivo de >10MB, lo que tranca la carga de la imagen en el navegador.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_PAGINAS_DEFAULT = 5;
const SCALE_TO_DEFAULT = 1600;

function pdfPaginasAImagenes(buffer, { maxPaginas = MAX_PAGINAS_DEFAULT, scaleTo = SCALE_TO_DEFAULT } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfimg-'));
  const pdfPath = path.join(dir, 'in.pdf');
  const prefix = path.join(dir, 'pagina');
  try {
    fs.writeFileSync(pdfPath, buffer);
    execFileSync('pdftoppm', ['-jpeg', '-scale-to', String(scaleTo), '-l', String(maxPaginas), pdfPath, prefix], { stdio: 'ignore' });
    const archivos = fs.readdirSync(dir).filter((f) => f.startsWith('pagina')).sort();
    return archivos.map((f) => ({
      mimeType: 'image/jpeg',
      base64: fs.readFileSync(path.join(dir, f)).toString('base64'),
    }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { pdfPaginasAImagenes };
