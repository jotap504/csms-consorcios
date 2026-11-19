// Rasteriza paginas de un PDF a imagenes PNG via poppler-utils (pdftoppm),
// para los casos en que el PDF es un escaneo/foto sin texto seleccionable y
// pdf-parse no devuelve nada util. Se usa como fallback en las rutas de
// importar-preview (contactos y catalogo-items) antes de mandar el
// contenido a la IA.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_PAGINAS_DEFAULT = 5;

function pdfPaginasAImagenes(buffer, { maxPaginas = MAX_PAGINAS_DEFAULT, dpi = 150 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfimg-'));
  const pdfPath = path.join(dir, 'in.pdf');
  const prefix = path.join(dir, 'pagina');
  try {
    fs.writeFileSync(pdfPath, buffer);
    execFileSync('pdftoppm', ['-png', '-r', String(dpi), '-l', String(maxPaginas), pdfPath, prefix], { stdio: 'ignore' });
    const archivos = fs.readdirSync(dir).filter((f) => f.startsWith('pagina')).sort();
    return archivos.map((f) => ({
      mimeType: 'image/png',
      base64: fs.readFileSync(path.join(dir, f)).toString('base64'),
    }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { pdfPaginasAImagenes };
