/**
 * Stress Test Utilities for AudioBash
 * Common utilities for running stress tests and measuring performance
 */

export interface StressTestResult {
  name: string;
  passed: boolean;
  duration: number;
  iterations: number;
  errors: string[];
  metrics: {
    avgLatency?: number;
    maxLatency?: number;
    minLatency?: number;
    memoryUsed?: number;
    memoryPeak?: number;
    throughput?: number;
  };
  warnings: string[];
}

export interface StressTestConfig {
  iterations?: number;
  concurrency?: number;
  timeout?: number;
  warmup?: number;
  cooldown?: number;
  verbose?: boolean;
}

const DEFAULT_CONFIG: StressTestConfig = {
  iterations: 100,
  concurrency: 1,
  timeout: 30000,
  warmup: 5,
  cooldown: 100,
  verbose: false,
};

/**
 * Run a stress test with timing and error collection
 */
export async function runStressTest(
  name: string,
  testFn: (iteration: number) => Promise<void> | void,
  config: StressTestConfig = {}
): Promise<StressTestResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const errors: string[] = [];
  const warnings: string[] = [];
  const latencies: number[] = [];

  const startMemory = process.memoryUsage().heapUsed;
  let peakMemory = startMemory;
  const startTime = Date.now();

  // Warmup phase
  if (cfg.warmup && cfg.warmup > 0) {
    for (let i = 0; i < cfg.warmup; i++) {
      try {
        await testFn(-1);
      } catch {
        // Ignore warmup errors
      }
    }
  }

  // Main test phase
  let successCount = 0;
  for (let i = 0; i < cfg.iterations!; i++) {
    const iterStart = Date.now();

    try {
      await Promise.race([
        testFn(i),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Iteration timeout')), cfg.timeout! / cfg.iterations!)
        ),
      ]);
      successCount++;
    } catch (err: any) {
      errors.push(`Iteration ${i}: ${err.message}`);
    }

    const iterEnd = Date.now();
    latencies.push(iterEnd - iterStart);

    // Track memory
    const currentMemory = process.memoryUsage().heapUsed;
    if (currentMemory > peakMemory) {
      peakMemory = currentMemory;
    }

    // Cooldown between iterations
    if (cfg.cooldown && cfg.cooldown > 0) {
      await sleep(cfg.cooldown);
    }

    // Verbose logging
    if (cfg.verbose && (i + 1) % 10 === 0) {
      console.log(`  [${name}] Progress: ${i + 1}/${cfg.iterations}`);
    }
  }

  const endTime = Date.now();
  const duration = endTime - startTime;
  const endMemory = process.memoryUsage().heapUsed;

  // Calculate metrics
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLatency = Math.max(...latencies);
  const minLatency = Math.min(...latencies);
  const throughput = (successCount / duration) * 1000; // ops/sec

  // Memory warnings
  const memoryGrowth = endMemory - startMemory;
  if (memoryGrowth > 50 * 1024 * 1024) {
    warnings.push(`High memory growth: ${formatBytes(memoryGrowth)}`);
  }
  if (peakMemory > 500 * 1024 * 1024) {
    warnings.push(`Peak memory exceeded 500MB: ${formatBytes(peakMemory)}`);
  }

  // Latency warnings
  if (maxLatency > 1000) {
    warnings.push(`High max latency: ${maxLatency}ms`);
  }
  if (avgLatency > 100) {
    warnings.push(`High average latency: ${avgLatency.toFixed(2)}ms`);
  }

  return {
    name,
    passed: errors.length === 0,
    duration,
    iterations: cfg.iterations!,
    errors: errors.slice(0, 10), // Limit error count
    metrics: {
      avgLatency,
      maxLatency,
      minLatency,
      memoryUsed: endMemory - startMemory,
      memoryPeak: peakMemory,
      throughput,
    },
    warnings,
  };
}

/**
 * Run multiple stress tests concurrently
 */
export async function runConcurrentStressTest(
  name: string,
  testFn: (iteration: number, workerId: number) => Promise<void> | void,
  config: StressTestConfig = {}
): Promise<StressTestResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const errors: string[] = [];
  const warnings: string[] = [];

  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  // Create worker promises
  const workers: Promise<void>[] = [];
  const iterationsPerWorker = Math.ceil(cfg.iterations! / cfg.concurrency!);

  for (let w = 0; w < cfg.concurrency!; w++) {
    workers.push(
      (async () => {
        for (let i = 0; i < iterationsPerWorker; i++) {
          const globalIteration = w * iterationsPerWorker + i;
          if (globalIteration >= cfg.iterations!) break;

          try {
            await testFn(globalIteration, w);
          } catch (err: any) {
            errors.push(`Worker ${w}, Iteration ${i}: ${err.message}`);
          }

          if (cfg.cooldown) {
            await sleep(cfg.cooldown);
          }
        }
      })()
    );
  }

  await Promise.all(workers);

  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  return {
    name,
    passed: errors.length === 0,
    duration: endTime - startTime,
    iterations: cfg.iterations!,
    errors: errors.slice(0, 10),
    metrics: {
      memoryUsed: endMemory - startMemory,
      throughput: (cfg.iterations! / (endTime - startTime)) * 1000,
    },
    warnings,
  };
}

/**
 * Generate random data for testing
 */
export function generateRandomData(size: number): Buffer {
  return Buffer.alloc(size, Math.floor(Math.random() * 256));
}

/**
 * Generate random string with special characters
 */
export function generateRandomString(length: number, includeSpecial = false): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?/`~\\\'"';
  const pool = includeSpecial ? chars + special : chars;

  let result = '';
  for (let i = 0; i < length; i++) {
    result += pool[Math.floor(Math.random() * pool.length)];
  }
  return result;
}

/**
 * Generate ANSI escape sequences for terminal testing
 */
export function generateAnsiSequences(): string[] {
  return [
    '\x1b[31mRed text\x1b[0m',
    '\x1b[1;32mBold green\x1b[0m',
    '\x1b[4;34mUnderlined blue\x1b[0m',
    '\x1b[7mInverted\x1b[0m',
    '\x1b[2J\x1b[H', // Clear screen and home
    '\x1b[?25l', // Hide cursor
    '\x1b[?25h', // Show cursor
    '\x1b[10;20H', // Move to position
    '\x1b[K', // Clear to end of line
    '\x1b]0;Window Title\x07', // Set window title
    '\x1b[38;5;196m256-color red\x1b[0m',
    '\x1b[48;2;255;128;0mTrue color bg\x1b[0m',
  ];
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Print stress test report
 */
export function printStressTestReport(results: StressTestResult[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('STRESS TEST REPORT');
  console.log('='.repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`\n${status} ${result.name}`);
    console.log(`  Duration: ${result.duration}ms (${result.iterations} iterations)`);

    if (result.metrics.avgLatency !== undefined) {
      console.log(`  Latency: avg=${result.metrics.avgLatency.toFixed(2)}ms, max=${result.metrics.maxLatency}ms, min=${result.metrics.minLatency}ms`);
    }
    if (result.metrics.throughput !== undefined) {
      console.log(`  Throughput: ${result.metrics.throughput.toFixed(2)} ops/sec`);
    }
    if (result.metrics.memoryUsed !== undefined) {
      console.log(`  Memory: used=${formatBytes(result.metrics.memoryUsed)}, peak=${formatBytes(result.metrics.memoryPeak || 0)}`);
    }

    if (result.warnings.length > 0) {
      console.log('  Warnings:');
      result.warnings.forEach((w) => console.log(`    ⚠ ${w}`));
    }

    if (result.errors.length > 0) {
      console.log('  Errors:');
      result.errors.forEach((e) => console.log(`    ✗ ${e}`));
    }

    if (result.passed) totalPassed++;
    else totalFailed++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`SUMMARY: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Create a mock WebSocket for testing
 */
export class MockWebSocket {
  readyState = 1; // OPEN
  messages: any[] = [];
  onmessage: ((event: { data: any }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: Error) => void) | null = null;
  isAlive = true;

  send(data: string | Buffer): void {
    this.messages.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  ping(): void {
    // Mock ping
  }

  terminate(): void {
    this.readyState = 3;
  }

  simulateMessage(data: any): void {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
}

/**
 * Create a mock PTY process for testing
 */
export class MockPtyProcess {
  private outputBuffer = '';
  private onDataCallback: ((data: string) => void) | null = null;
  private onExitCallback: ((code: number) => void) | null = null;
  cols = 80;
  rows = 24;
  killed = false;

  write(data: string): void {
    if (this.killed) throw new Error('PTY process has been killed');
    // Echo back for testing
    this.outputBuffer += data;
    this.onDataCallback?.(data);
  }

  resize(cols: number, rows: number): void {
    if (this.killed) throw new Error('PTY process has been killed');
    this.cols = cols;
    this.rows = rows;
  }

  onData(callback: (data: string) => void): void {
    this.onDataCallback = callback;
  }

  onExit(callback: (code: number) => void): void {
    this.onExitCallback = callback;
  }

  kill(): void {
    this.killed = true;
    this.onExitCallback?.(0);
  }

  simulateOutput(data: string): void {
    this.outputBuffer += data;
    this.onDataCallback?.(data);
  }

  simulateCrash(code: number): void {
    this.killed = true;
    this.onExitCallback?.(code);
  }
}
