import { spawn } from 'node:child_process';

export function runStack(env: NodeJS.ProcessEnv) {
  const children = ['control', 'runner'].map((name) =>
    spawn(process.execPath, [`apps/${name}/dist/main.js`], { env, stdio: 'inherit' }),
  );
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const child of children) child.kill('SIGTERM');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  for (const child of children)
    child.once('exit', (code) => {
      if (!stopped) {
        process.exitCode = code ?? 1;
        stop();
      }
    });
}
