import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { createHash } from 'node:crypto';
import { record, text } from './protocol.js';
type Id = string | number;
type Pending = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
export class JsonRpcProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly ready: Promise<void>;
  private readonly pending = new Map<Id, Pending>();
  private readonly serverRequests = new Map<Id, { hash: string; response: Promise<unknown> }>();
  private sequence = 0;
  private buffer = '';
  private readonly decoder = new StringDecoder('utf8');
  private stopped = false;
  private stderr = '';
  onNotification: (method: string, params: unknown) => void = () => {};
  onRequest: (method: string, params: unknown, id: Id) => Promise<unknown> = async () => {
    throw new Error('UNSUPPORTED_SERVER_REQUEST');
  };
  onClose: (error: Error) => void = () => {};
  onResponseSent: (id: Id) => Promise<void> = async () => {};
  constructor(binary: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
    this.child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    this.ready = new Promise((resolve, reject) => {
      this.child.once('spawn', resolve);
      this.child.once('error', reject);
    });
    // Consumers may install handlers before awaiting ready. Avoid an unhandled early spawn failure.
    void this.ready.catch((error) =>
      this.fail(error instanceof Error ? error : new Error('SPAWN_FAILED')),
    );
    this.child.stdout.on('data', (bytes: Buffer) => {
      this.buffer += this.decoder.write(bytes);
      if (Buffer.byteLength(this.buffer) > 1024 * 1024) {
        this.fail(new Error('PROVIDER_LINE_LIMIT'));
        this.close();
        return;
      }
      let position: number;
      while ((position = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, position);
        this.buffer = this.buffer.slice(position + 1);
        if (!line.trim()) continue;
        try {
          this.receive(JSON.parse(line));
        } catch {
          this.fail(new Error('PROVIDER_PROTOCOL_ERROR'));
          this.close();
          return;
        }
      }
    });
    this.child.stdin.on('error', () => this.fail(new Error('PROVIDER_STDIN_ERROR')));
    this.child.stderr.on('data', (bytes: Buffer) => {
      this.stderr = (this.stderr + bytes.toString('utf8')).slice(-8000);
    });
    this.child.on('error', () => this.fail(new Error('PROVIDER_PROCESS_ERROR')));
    this.child.once('close', (code) => {
      this.stopped = true;
      this.fail(new Error(`PROVIDER_EXIT_${code}`));
    });
  }
  private write(message: unknown): void {
    if (this.stopped || this.child.stdin.destroyed) throw new Error('PROVIDER_CLOSED');
    const line = JSON.stringify(message) + '\n';
    if (Buffer.byteLength(line) > 1024 * 1024 || this.child.stdin.writableLength > 1024 * 1024)
      throw new Error('PROVIDER_BACKPRESSURE');
    this.child.stdin.write(line);
  }
  async request<T = unknown>(method: string, params: unknown, timeoutMs = 15000): Promise<T> {
    await this.ready;
    if (this.pending.size >= 128) throw new Error('RPC_PENDING_LIMIT');
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('RPC_TIMEOUT'));
      }, timeoutMs);
      timer.unref();
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  notify(method: string, params?: unknown): void {
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }
  private receive(input: unknown): void {
    const message = record(input);
    const id = message['id'];
    if (typeof message['method'] === 'string') {
      if (typeof id === 'string' || typeof id === 'number') {
        const hash = createHash('sha256')
          .update(JSON.stringify({ method: message['method'], params: message['params'] }))
          .digest('hex');
        const existing = this.serverRequests.get(id);
        if (existing && existing.hash !== hash) throw new Error('SERVER_REQUEST_ID_REUSED');
        if (!existing && this.serverRequests.size >= 256) throw new Error('SERVER_REQUEST_LIMIT');
        const response =
          existing?.response ?? this.onRequest(message['method'], message['params'], id);
        this.serverRequests.set(id, { hash, response });
        // Do not block the read loop while the operator decides. The response to our
        // own turn/start can arrive after this independent server-side request.
        void response
          .then(
            async (result) => {
              this.write({ id, result });
              await this.onResponseSent(id);
            },
            () =>
              this.write({
                id,
                error: { code: -32603, message: 'Permission or request could not be resolved' },
              }),
          )
          .catch(() => this.fail(new Error('SERVER_RESPONSE_WRITE_FAILED')));
      } else this.onNotification(message['method'], message['params']);
      return;
    }
    if (typeof id !== 'string' && typeof id !== 'number') throw new Error('RPC_ID_REQUIRED');
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (message['error'])
      pending.reject(
        new Error(`RPC_ERROR:${text(record(message['error'])['code'], 80) || 'remote error'}`),
      );
    else pending.resolve(message['result']);
  }
  private fail(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.onClose(error);
  }
  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.fail(new Error('PROVIDER_CLOSED'));
    const pid = this.child.pid;
    if (pid) {
      try {
        if (process.platform === 'win32') this.child.kill('SIGTERM');
        else process.kill(-pid, 'SIGTERM');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
      const timer = setTimeout(() => {
        if (this.child.exitCode === null && this.child.signalCode === null) {
          try {
            if (process.platform === 'win32') this.child.kill('SIGKILL');
            else process.kill(-pid, 'SIGKILL');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
              this.onClose(new Error('PROCESS_TERMINATION_FAILED'));
          }
        }
      }, 1500);
      timer.unref();
    }
  }
}
