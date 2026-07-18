/**
 * Copy sitemap-index.xml → sitemap.xml for backward compatibility.
 * Many tools/users try /sitemap.xml by default.
 */
import { copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist', 'client');
const sourceFile = join(distDir, 'sitemap-index.xml');
const destFile = join(distDir, 'sitemap.xml');

if (existsSync(sourceFile)) {
  copyFileSync(sourceFile, destFile);
  console.log('✓ Copied sitemap-index.xml → sitemap.xml (backward compatibility)');
} else {
  console.warn('⚠ sitemap-index.xml not found in dist/client/');
}
