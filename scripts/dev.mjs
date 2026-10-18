import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const server = await createServer({ root });
  await server.listen();
  console.log('Starry Wall → http://localhost:4173');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(); });
} catch (error) {
  console.error(error.code === 'EADDRINUSE' || /already in use/.test(error.message) ? '4173 端口已被占用。请关闭旧预览后重试；不会切换端口。' : error);
  process.exitCode = 1;
}
