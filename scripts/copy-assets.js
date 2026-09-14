// scripts/copy-assets.js
// Copia os arquivos estáticos do frontend (HTML, CSS, JS) para o diretório de build dist/
const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'src', 'dashboard');
const destDir = path.resolve(__dirname, '..', 'dist', 'dashboard');

console.log('[BUILD] Copiando assets do dashboard...');
console.log(`[BUILD] Origem:  ${srcDir}`);
console.log(`[BUILD] Destino: ${destDir}`);

if (!fs.existsSync(srcDir)) {
  console.error(`[BUILD ERROR] Diretório de origem não encontrado: ${srcDir}`);
  process.exit(1);
}

try {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Copia recursiva cross-platform compatível com Node.js
  fs.cpSync(srcDir, destDir, { recursive: true });

  const files = fs.readdirSync(destDir);
  console.log(`[BUILD SUCCESS] ${files.length} arquivos copiados para dist/dashboard:`, files.join(', '));
} catch (err) {
  console.error('[BUILD ERROR] Falha ao copiar assets:', err);
  process.exit(1);
}
