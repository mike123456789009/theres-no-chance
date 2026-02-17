import { vi } from "vitest";

/**
 * Mock Next.js Request object for testing API routes
 */
export function createMockRequest(options: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string>;
}): Request {
  const { method = "POST", body, headers = {}, params = {} } = options;

  const url = new URL("http://localhost:3000/api/test");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const request = {
    method,
    url: url.toString(),
    headers: new Headers(headers),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Request;

  return request;
}

/**
 * Mock Next.js context with params
 */
export function createMockContext(params: Record<string, string>) {
  return {
    params: Promise.resolve(params),
  };
}

/**
 * Extract JSON from Next.js Response
 */
export async function extractJsonFromResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  return JSON.parse(text);
}

/**
 * Mock Supabase client for testing
 */
export function createMockSupabaseClient() {
  return {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
    rpc: vi.fn(),
  };
}

/**
 * Mock authenticated user context
 */
export function mockAuthenticatedUser(userId: string = "test-user-123") {
  return {
    data: {
      user: {
        id: userId,
        email: "test@example.com",
      },
    },
    error: null,
  };
}

/**
 * Mock unauthenticated user context
 */
export function mockUnauthenticatedUser() {
  return {
    data: {
      user: null,
    },
    error: null,
  };
}

/**
 * Mock market data
 */
export function createMockMarket(overrides?: Partial<any>) {
  return {
    id: "market-123",
    status: "open",
    question: "Test market question?",
    feeBps: 200,
    priceYes: 0.5,
    priceNo: 0.5,
    createdAt: new Date().toISOString(),
    closeTime: new Date(Date.now() + 86400000).toISOString(),
    ...overrides,
  };
}

/**
 * Mock quote RPC result
 */
export function createMockQuoteResult(overrides?: Partial<any>) {
  return {
    marketId: "market-123",
    side: "yes",
    action: "buy",
    shares: 100,
    feeBps: 200,
    priceBeforeYes: 0.5,
    priceAfterYes: 0.52,
    priceBeforeSide: 0.5,
    priceAfterSide: 0.52,
    averagePrice: 0.51,
    notional: 51,
    feeAmount: 1.02,
    netCashChange: 52.02,
    slippageBps: 200,
    ...overrides,
  };
}

/**
 * Mock execute RPC result
 */
export function createMockExecuteResult(overrides?: Partial<any>) {
  const quoteData = createMockQuoteResult();
  return {
    ...quoteData,
    reused: false,
    tradeFillId: "fill-123",
    userId: "user-123",
    walletAvailableBalance: 1000,
    positionYesShares: 100,
    positionNoShares: 0,
    positionRealizedPnl: 0,
    executedAt: new Date().toISOString(),
    ...overrides,
  };
}
