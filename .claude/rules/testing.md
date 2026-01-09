# Testing Rules

## Test Coverage Requirements

### Feature Completeness
- **ALL new features MUST have tests** before merging
- Add tests in the `tests/` directory
- Maintain or exceed 70+ test count target
- Aim for meaningful coverage, not just quantity

### Test Organization
```
tests/
├── unit/           # Component and utility tests
├── integration/    # Cross-component tests
├── e2e/            # End-to-end Electron tests (future)
└── fixtures/       # Test data and mocks
```

## Vitest Configuration

### Framework Setup
- Use Vitest as the test runner
- Configure with `vitest.config.ts`
- Enable TypeScript support for test files

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',  // For React components
    globals: true,
    setupFiles: './tests/setup.ts'
  }
});
```

### Test File Naming
- Unit tests: `*.test.ts` or `*.test.tsx`
- Integration tests: `*.integration.test.ts`
- Place test files adjacent to source or in `tests/` directory

## Mocking Electron APIs

### Use vi.mock() Pattern
- Mock Electron modules that aren't available in test environment
- Create reusable mock factories

```typescript
// ✅ CORRECT - Mocking Electron IPC
import { vi } from 'vitest';

vi.mock('electron', () => ({
  ipcRenderer: {
    send: vi.fn(),
    on: vi.fn(),
    invoke: vi.fn()
  }
}));

// In test
it('sends transcription to terminal', () => {
  const { ipcRenderer } = require('electron');
  sendTranscription('ls -la');
  expect(ipcRenderer.send).toHaveBeenCalledWith('send-to-terminal', 'ls -la');
});
```

### Mock PTY Process
- Mock node-pty for unit tests
- Simulate PTY events (data, exit)

```typescript
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    pid: 12345
  }))
}));
```

### Mock External APIs
- Mock Gemini API for transcription tests
- Use fixtures for API responses
- Test both success and error cases

```typescript
// tests/fixtures/gemini-response.ts
export const mockTranscriptionSuccess = {
  candidates: [{
    content: {
      parts: [{ text: 'list all files' }]
    }
  }]
};

export const mockTranscriptionError = {
  error: { message: 'API quota exceeded' }
};
```

## Platform-Specific Testing

### Skip Tests by Platform
- Use `test.skipIf()` for platform-specific tests
- Document why tests are platform-specific

```typescript
import { test } from 'vitest';

test.skipIf(process.platform !== 'win32')(
  'PowerShell-specific command parsing',
  () => {
    // Windows-only test
  }
);

test.skipIf(process.platform !== 'darwin')(
  'zsh-specific shell detection',
  () => {
    // macOS-only test
  }
);
```

### Mock Platform Detection
- Override `process.platform` for cross-platform tests

```typescript
const originalPlatform = process.platform;

beforeEach(() => {
  Object.defineProperty(process, 'platform', {
    value: 'darwin',
    writable: true
  });
});

afterEach(() => {
  Object.defineProperty(process, 'platform', {
    value: originalPlatform
  });
});
```

## Component Testing

### React Component Tests
- Use `@testing-library/react` for component rendering
- Test user interactions, not implementation details
- Verify accessibility (ARIA labels, keyboard navigation)

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { VoicePanel } from '../src/components/VoicePanel';

test('starts recording on Alt+S keypress', () => {
  render(<VoicePanel />);

  fireEvent.keyDown(window, { key: 's', altKey: true });

  expect(screen.getByText(/recording/i)).toBeInTheDocument();
});
```

### Terminal Component Tests
- Mock xterm.js Terminal instance
- Test PTY integration
- Verify data flow

```typescript
vi.mock('xterm', () => ({
  Terminal: vi.fn(() => ({
    open: vi.fn(),
    write: vi.fn(),
    onData: vi.fn(),
    dispose: vi.fn()
  }))
}));
```

## Integration Testing

### IPC Integration
- Test main ↔ renderer communication
- Verify event payloads
- Test error handling across process boundary

```typescript
test('transcription flows through IPC to terminal', async () => {
  const mockPtyWrite = vi.fn();

  // Simulate transcription
  const audioBlob = new Blob(['fake audio'], { type: 'audio/webm' });
  const result = await transcribeAudio(audioBlob);

  // Verify IPC send
  expect(ipcRenderer.send).toHaveBeenCalledWith(
    'send-to-terminal',
    result.text
  );
});
```

### Voice Recording Integration
- Test MediaRecorder lifecycle
- Verify audio blob creation
- Test transcription pipeline

## Test Best Practices

### Test Structure (AAA Pattern)
```typescript
test('description of behavior', () => {
  // Arrange - Set up test data and mocks
  const mockData = createMockData();

  // Act - Execute the behavior being tested
  const result = functionUnderTest(mockData);

  // Assert - Verify the expected outcome
  expect(result).toBe(expectedValue);
});
```

### Descriptive Test Names
```typescript
// ✅ GOOD - Clear behavior description
test('clears terminal when user presses Ctrl+L', () => { });

// ❌ BAD - Vague or implementation-focused
test('test clear function', () => { });
test('handleKeyPress works', () => { });
```

### One Assertion Per Test
- Focus each test on a single behavior
- Use multiple tests for complex scenarios
- Makes failures easier to debug

### Avoid Test Interdependence
- Each test should run independently
- Use `beforeEach` to set up clean state
- Never rely on test execution order

## Continuous Testing

### Watch Mode in Development
```bash
npm run test:watch  # Run tests on file changes
```

### Pre-commit Hook
- Run tests before allowing commits
- Use `husky` for git hooks
- Fast subset of tests for quick feedback

### CI/CD Integration
- Run full test suite on every push
- Test on all target platforms (Windows, macOS, Linux)
- Fail builds on test failures

## Debugging Tests

### Vitest UI
```bash
npm run test:ui  # Visual test interface
```

### Console Logging in Tests
```typescript
test('debug test', () => {
  console.log('Debug info:', someValue);  // Visible in test output
  expect(someValue).toBe(expected);
});
```

### Focused Tests
```typescript
test.only('run only this test', () => {
  // Temporarily isolate a failing test
});

test.skip('skip this broken test', () => {
  // Temporarily disable a test
});
```

## Performance Testing

### Measure Critical Paths
- Time PTY spawn duration
- Measure transcription latency
- Profile component render times

```typescript
test('PTY spawns within 100ms', async () => {
  const start = Date.now();
  await spawnPty();
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(100);
});
```

## Regression Testing

### Add Tests for Bugs
- Every bug fix should include a regression test
- Document the original issue in test comments

```typescript
// Regression test for #42: Voice panel crashes on rapid key presses
test('handles rapid Alt+S keypresses without crashing', () => {
  const { container } = render(<VoicePanel />);

  for (let i = 0; i < 10; i++) {
    fireEvent.keyDown(window, { key: 's', altKey: true });
  }

  expect(container).toBeInTheDocument();
});
```

## Test Maintenance

### Keep Tests Updated
- Update tests when refactoring code
- Remove obsolete tests for removed features
- Maintain test quality with code reviews

### Review Test Failures
- Never ignore failing tests
- Fix or remove broken tests immediately
- Update tests to match new requirements
