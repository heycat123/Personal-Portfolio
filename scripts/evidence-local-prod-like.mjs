import { spawn } from 'node:child_process';
import { localProductionLikeEnv } from './evidence-local-prod-auth.mjs';

const env = localProductionLikeEnv();
const port = env.EVIDENCE_LOCAL_FRONTEND_PORT || '5181';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log('Starting Evidence local production-like server.');
console.log(`Local URL: http://127.0.0.1:${port}/evidence/cases/case_e5f3b7b645821788/dashboard`);
console.log(`Production API origin: ${env.EVIDENCE_LOCAL_PROD_API_ORIGIN}`);
console.log(`Auth mode: ${env.VITE_EVIDENCE_AUTH_MODE}`);
console.log(`Cognito region: ${env.VITE_AWS_REGION}`);
console.log(`Cognito user pool id: ${env.VITE_COGNITO_USER_POOL_ID}`);
console.log('Sign in through the local app with the normal production Cognito account.');
console.log('No Cognito secret or bearer token is printed or bundled.');

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
