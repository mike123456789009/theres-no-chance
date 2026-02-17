# Trade Engine Test Suite

## Overview

Comprehensive test suite for the trade engine validation functions and API endpoints using Vitest.

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Test Coverage

### Unit Tests (`trade-engine.test.ts`)

**validateTradeQuotePayload:**
- ✅ Valid payloads with all combinations of side/action
- ✅ Default maxSlippageBps handling
- ✅ Case normalization (YES → yes, BUY → buy)
- ✅ String number parsing for maxSlippageBps
- ✅ Boundary value testing (0 shares, max shares, slippage limits)
- ✅ Invalid structure rejection (null, arrays, strings)
- ✅ Invalid side values
- ✅ Invalid action values
- ✅ Share validation (zero, negative, exceeding max, non-numeric, NaN, Infinity)
- ✅ Slippage validation (negative, exceeding max, invalid types)
- ✅ Multiple simultaneous validation errors
- ✅ Decimal flooring for slippage values

**validateTradeExecutePayload:**
- ✅ Complete valid payload validation
- ✅ Idempotency key character validation (letters, numbers, :, _, -)
- ✅ Length validation (8-120 characters)
- ✅ Missing idempotency key rejection
- ✅ Empty idempotency key rejection
- ✅ Too short/long key rejection
- ✅ Invalid character rejection (spaces, special chars)
- ✅ Inheritance of quote validation errors
- ✅ Whitespace trimming

### Integration Tests

**Quote Endpoint (`app/api/markets/[marketId]/trade/quote/route.test.ts`):**
- ✅ Successful quote generation for authenticated users
- ✅ Invalid JSON handling
- ✅ Validation error responses
- ✅ Unauthenticated user rejection
- ✅ Login required market handling
- ✅ Market not found (404)
- ✅ Closed market rejection (409)
- ✅ Quote service error propagation

**Execute Endpoint (`app/api/markets/[marketId]/trade/execute/route.test.ts`):**
- ✅ New trade execution (201 status)
- ✅ Duplicate/reused trade execution (200 status)
- ✅ Idempotency key from header
- ✅ Idempotency key from body
- ✅ Header preference over body
- ✅ Invalid JSON handling
- ✅ Missing idempotency key validation
- ✅ Unauthenticated user rejection
- ✅ Execution service error handling

## Test Conventions

### Mocking
- External dependencies (Supabase, market readers) are mocked using Vitest's `vi.mock()`
- Each test file has `beforeEach` to clear mocks
- Mock implementations verify expected behavior

### Test Structure
- **Arrange:** Set up test data and mocks
- **Act:** Call the function under test
- **Assert:** Verify outcomes using expect()

### Naming
- Test suites use `describe()` blocks organized by functionality
- Test cases use `it()` with descriptive "should" statements
- Edge cases and error conditions clearly labeled

## Coverage Goals

- **Line Coverage:** 90%+ for trade-engine.ts
- **Branch Coverage:** 85%+ for all validation paths
- **Function Coverage:** 100% for exported functions

## CI Integration

Tests run automatically on:
- Push to `main` or `trunk` branches
- All pull requests
- CI fails if any test fails or type checking fails

## Adding New Tests

When adding new validation rules or API endpoints:

1. Add unit tests for the validation function
2. Add integration tests for the API endpoint
3. Test both success and failure cases
4. Include edge cases and boundary values
5. Update this README with new coverage areas
