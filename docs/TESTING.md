# Testing Documentation

## Overview

This project uses Vitest as the testing framework, configured for TypeScript and Next.js compatibility.

## Setup

### Installation

All testing dependencies are included in `package.json`:
- `vitest`: Test framework
- `@vitest/ui`: Interactive test UI
- `@vitest/coverage-v8`: Code coverage
- `@testing-library/react`: React component testing
- `jsdom`: Browser environment simulation

### Configuration

Test configuration is in `vitest.config.ts`:
- React plugin support
- JSdom environment
- Path aliases (@/*)
- Coverage configuration

Global test setup is in `vitest.setup.ts`:
- Next.js module mocks
- Supabase mocks
- Automatic mock cleanup

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Open interactive UI
npm run test:ui
```

## Test Structure

### Unit Tests

Location: `lib/markets/__tests__/trade-engine.test.ts`

**Coverage:**
- `validateTradeQuotePayload` function
  - Valid payloads
  - Invalid side/action values
  - Share validation (zero, negative, exceeding limits)
  - Slippage validation
  - Edge cases (non-objects, arrays, case-insensitivity)
  - Multiple errors accumulation

- `validateTradeExecutePayload` function
  - All quote validation (inherited)
  - Idempotency key validation
  - Key length limits
  - Allowed characters
  - Error accumulation

- `quoteMarketTrade` function
  - Service configuration checks
  - RPC parameter passing
  - Error handling
  - Response normalization

- `executeMarketTrade` function
  - Service configuration checks
  - RPC parameter passing with idempotency
  - Error handling
  - Response normalization

### Integration Tests

**To be implemented:**
- API endpoint tests for `/quote` and `/execute`
- Full request/response cycle
- Authentication checks
- Market status validation
- Error response formats

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect } from "vitest";
import { validateTradeQuotePayload } from "../trade-engine";

describe("Function Name", () => {
  describe("specific behavior", () => {
    it("should do something expected", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.shares).toBe(100);
      }
    });
  });
});
```

### Mocking

```typescript
import { vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
});

it("should call mocked function", async () => {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const mockRpc = vi.fn().mockResolvedValue({
    data: { /* mock data */ },
    error: null,
  });

  vi.mocked(createServiceClient).mockReturnValue({
    rpc: mockRpc,
  } as any);

  // Test code that uses createServiceClient
  
  expect(mockRpc).toHaveBeenCalledWith("function_name", {
    param: "value",
  });
});
```

## Coverage Goals

- **Overall**: > 80%
- **Critical paths** (trade-engine, validation): > 95%
- **API endpoints**: > 90%
- **UI components**: > 70%

## CI Integration

Tests run automatically on:
- Every push to `main` or `trunk`
- Every pull request

CI workflow (`.github/workflows/ci.yml`):
1. Checkout code
2. Install dependencies
3. Run type checking
4. Run tests
5. Generate coverage report
6. Block merge if tests fail

## Best Practices

1. **Test Behavior, Not Implementation**
   - Test what the function does, not how it does it
   - Focus on inputs and outputs

2. **One Assertion Per Test** (when possible)
   - Makes failures easier to diagnose
   - Tests are more focused

3. **Use Descriptive Test Names**
   - `it("should reject negative shares", ...)` ✅
   - `it("test shares", ...)` ❌

4. **Test Edge Cases**
   - Boundary values (0, -1, MAX, MAX+1)
   - Empty inputs
   - Invalid types
   - null/undefined

5. **Keep Tests Independent**
   - Don't rely on test execution order
   - Clean up after each test
   - Use `beforeEach` and `afterEach`

6. **Mock External Dependencies**
   - Database calls
   - External APIs
   - Time-dependent functions

## Troubleshooting

### Tests Fail Locally But Pass in CI
- Check Node version (CI uses Node 20)
- Clear `node_modules` and reinstall
- Check for environment-specific code

### Mock Not Working
- Ensure mock is set up before import
- Use `vi.clearAllMocks()` in `afterEach`
- Check mock path matches actual import

### Coverage Not Generated
- Run `npm run test:coverage` explicitly
- Check `vitest.config.ts` coverage settings
- Ensure all files are in `coverage.exclude`
