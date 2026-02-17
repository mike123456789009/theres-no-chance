import { beforeAll, afterEach, afterAll, vi } from "vitest";

// Mock Next.js server-only modules
vi.mock("server-only", () => ({}));

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
  usePathname: () => "",
  notFound: vi.fn(),
}));

// Mock Next.js headers
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    getAll: vi.fn(() => []),
  })),
  headers: vi.fn(() => ({
    get: vi.fn(),
    has: vi.fn(),
    entries: vi.fn(() => []),
  })),
}));

beforeAll(() => {
  // Set up any global test configuration
});

afterEach(() => {
  // Clean up after each test
  vi.clearAllMocks();
});

afterAll(() => {
  // Clean up after all tests
});
