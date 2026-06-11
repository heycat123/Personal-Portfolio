import { spawn } from 'node:child_process';
import { defaultTokenFile, localSmokeEnv, readLocalBearerToken } from './evidence-local-prod-auth.mjs';

const env = localSmokeEnv();
const { token, source } = readLocalBearerToken(env);
const port = env.EVIDENCE_LOCAL_FRONTEND_PORT || '5181';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log('Starting Evidence local production-data smoke server.');
console.log(`Local URL: http://127.0.0.1:${port}/evidence/cases/case_e5f3b7b645821788/query`);
console.log(`Production API origin: ${env.EVIDENCE_LOCAL_PROD_API_ORIGIN}`);
console.log(`Token source: ${token ? source : `missing (${source || defaultTokenFile})`}`);
if (!token) {
  console.log('Protected API calls will return 401 until a temporary bearer token is provided.');
}
console.log('Token values are not printed and are not exposed through VITE_* variables.');

const child = spawn(
  npmCommand,
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port],
  {
    env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
