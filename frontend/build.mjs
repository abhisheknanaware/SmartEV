import { build } from 'vite';

console.log('Starting programmatic Vite build...');
try {
  const result = await build({
    root: '.',
    logLevel: 'info',
    build: {
      outDir: 'dist',
      emptyOutDir: false,
    }
  });
  console.log('VITE BUILD SUCCESSFUL!');
} catch (e) {
  console.error('VITE BUILD ERROR:', e);
}
