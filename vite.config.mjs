import {defineConfig} from 'vite';
import {cpSync,existsSync} from 'node:fs';
export default defineConfig({
 base:'./',
 build:{outDir:'dist',target:'es2020',assetsInlineLimit:0},
 plugins:[{name:'copy-game-assets',closeBundle(){if(existsSync('assets'))cpSync('assets','dist/assets',{recursive:true,force:true})}}]
});
