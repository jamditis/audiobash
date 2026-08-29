import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

export class FakeChildProcess extends EventEmitter {
  readonly pid: number;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly targetStatus = new PassThrough();
  readonly stdio = [null, this.stdout, this.stderr, new PassThrough(), this.targetStatus];
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  closed = false;

  constructor(pid: number, { reportOwner = true }: { reportOwner?: boolean } = {}) {
    super();
    this.pid = pid;
    if (reportOwner) {
      this.reportOwner();
    }
  }

  reportOwner(ownerPid = this.pid + 1000): void {
    this.targetStatus.write(`${JSON.stringify({ type: 'owner-ready', ownerPid })}\n`);
  }

  finish(
    code: number | null = 0,
    signal: NodeJS.Signals | null = null,
    { closeStreams = true }: { closeStreams?: boolean } = {},
  ): void {
    this.closed = true;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
    this.emit('close', code, signal);
    if (closeStreams) this.closeStreams();
  }

  closeStreams(): void {
    if (!this.stdout.readableEnded) this.stdout.end();
    if (!this.stderr.readableEnded) this.stderr.end();
    if (!this.targetStatus.readableEnded) this.targetStatus.end();
  }

  finishTarget(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
    this.targetStatus.end(`${JSON.stringify({ type: 'target-result', code, signal })}\n`);
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (this.closed) return false;
    this.finish(null, signal);
    return true;
  }
}
