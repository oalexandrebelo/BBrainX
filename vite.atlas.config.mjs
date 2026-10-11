import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
// Publicação exclusivamente documental: não copia public/, API, SQLite ou arquivos de projeto.
export default defineConfig({publicDir:false,base:'./',build:{outDir:'dist-atlas',emptyOutDir:true,sourcemap:false,rollupOptions:{input:fileURLToPath(new URL('./atlas.html',import.meta.url))}}});
