import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: {
      __PUPI_CONFIG__: JSON.stringify({
        SUPABASE_URL: env.SUPABASE_URL || '',
        SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY || '',
      }),
    },
    server: { host: '0.0.0.0', port: 3000 },
    preview: { host: '0.0.0.0', port: 3000 },
    build: { target: 'es2022' },
  };
});
