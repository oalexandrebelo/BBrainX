import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
// Página adicional; o runtime e a página principal continuam inalterados.
export default defineConfig({build:{rollupOptions:{input:{main:fileURLToPath(new URL('./index.html',import.meta.url)),atlas:fileURLToPath(new URL('./atlas.html',import.meta.url))}}}});
