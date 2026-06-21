// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";
import { ResetForm } from "./reset-form";
import { SignupForm } from "./signup-form";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  storePasswordCredential: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      setSession: mocks.setSession,
      verifyOtp: mocks.verifyOtp,
      getSession: mocks.getSession,
      updateUser: mocks.updateUser,
    },
  }),
}));

vi.mock("@/lib/auth/password-credential", () => ({
  storePasswordCredential: mocks.storePasswordCredential,
}));

function mockLocationAssign() {
  const assign = vi.fn();
  const original = window.location;

  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...original,
      assign,
      href: original.href,
    },
  });

  return {
    assign,
    restore: () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    },
  };
}

describe("auth forms", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    mocks.signInWithPassword.mockReset();
    mocks.signUp.mockReset();
    mocks.resetPasswordForEmail.mockReset();
    mocks.exchangeCodeForSession.mockReset();
    mocks.setSession.mockReset();
    mocks.verifyOtp.mockReset();
    mocks.getSession.mockReset();
    mocks.updateUser.mockReset();
    mocks.storePasswordCredential.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("prefills login email, surfaces confirmation copy, stores credentials, and redirects on success", async () => {
    window.history.replaceState(null, "", "/login?email=student%40college.edu&confirmed=1");
    mocks.signInWithPassword.mockResolvedValueOnce({ error: null });
    const locationMock = mockLocationAssign();
    const user = userEvent.setup();

    try {
      render(<LoginForm />);

      expect(screen.getByLabelText("Email")).toHaveValue("student@college.edu");
      expect(screen.getByText("Email confirmed. Log in with your password to continue.")).toBeInTheDocument();

      await user.type(screen.getByLabelText("Password"), "correct-password");
      await user.click(screen.getByRole("button", { name: "LOG IN" }));

      await waitFor(() => {
        expect(mocks.signInWithPassword).toHaveBeenCalledWith({
          email: "student@college.edu",
          password: "correct-password",
        });
      });

      expect(mocks.storePasswordCredential).toHaveBeenCalledWith({
        email: "student@college.edu",
        password: "correct-password",
      });
      expect(screen.getByText("Logged in. Redirecting to markets...")).toBeInTheDocument();
      expect(locationMock.assign).toHaveBeenCalledWith("/markets");
    } finally {
      locationMock.restore();
    }
  });

  it("shows login errors without storing credentials or redirecting", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    const locationMock = mockLocationAssign();
    const user = userEvent.setup();

    try {
      render(<LoginForm />);

      await user.type(screen.getByLabelText("Email"), "student@college.edu");
      await user.type(screen.getByLabelText("Password"), "wrong-password");
      await user.click(screen.getByRole("button", { name: "LOG IN" }));

      expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
      expect(mocks.storePasswordCredential).not.toHaveBeenCalled();
      expect(locationMock.assign).not.toHaveBeenCalled();
    } finally {
      locationMock.restore();
    }
  });

  it("blocks signup when password confirmation does not match", async () => {
    const user = userEvent.setup();

    render(<SignupForm />);

    await user.type(screen.getByLabelText("Email"), "new@student.edu");
    await user.type(screen.getByLabelText("Password"), "password-one");
    await user.type(screen.getByLabelText("Confirm password"), "password-two");
    await user.click(screen.getByRole("button", { name: "SIGN UP" }));

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("shows pending email-confirmation instructions after signup without a session", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    const user = userEvent.setup();

    render(<SignupForm />);

    await user.type(screen.getByLabelText("Email"), "new@student.edu");
    await user.type(screen.getByLabelText("Password"), "password-one");
    await user.type(screen.getByLabelText("Confirm password"), "password-one");
    await user.click(screen.getByRole("button", { name: "SIGN UP" }));

    await waitFor(() => {
      expect(mocks.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "new@student.edu",
          password: "password-one",
          options: {
            emailRedirectTo: "https://theres-no-chance.com/login?email=new%40student.edu&confirmed=1",
          },
        })
      );
    });

    expect(mocks.storePasswordCredential).toHaveBeenCalledWith({
      email: "new@student.edu",
      password: "password-one",
    });
    expect(screen.getByText("Account created. Check your inbox, confirm your email, then log in.")).toBeInTheDocument();
    expect(screen.getByText("new@student.edu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "log in here" })).toHaveAttribute(
      "href",
      "/login?email=new%40student.edu&confirmed=1"
    );
  });

  it("sends reset links to the configured reset URL", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    mocks.resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();

    render(<ResetForm />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "UPDATE PASSWORD" })).toBeDisabled();
    });

    await user.type(screen.getByLabelText("Email"), "reset@student.edu");
    await user.click(screen.getByRole("button", { name: "SEND RESET LINK" }));

    await waitFor(() => {
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("reset@student.edu", {
        redirectTo: "https://theres-no-chance.com/reset",
      });
    });
    expect(screen.getByText("Reset link sent. Check your email inbox.")).toBeInTheDocument();
  });

  it("verifies recovery code links, strips one-time params, and updates the password", async () => {
    window.history.replaceState(null, "", "/reset?code=recovery-code&type=recovery");
    mocks.exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    mocks.getSession
      .mockResolvedValueOnce({
        data: { session: { user: { email: "reset@student.edu" } } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { user: { email: "reset@student.edu" } } },
        error: null,
      });
    mocks.updateUser.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();

    render(<ResetForm />);

    expect(await screen.findByText("Reset link verified. Enter your new password below.")).toBeInTheDocument();
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(window.location.search).toBe("");

    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-password");
    await user.click(screen.getByRole("button", { name: "UPDATE PASSWORD" }));

    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    });
    expect(mocks.storePasswordCredential).toHaveBeenCalledWith({
      email: "reset@student.edu",
      password: "new-password",
    });
    expect(screen.getByText("Password updated. You can now log in with the new password.")).toBeInTheDocument();
  });
});
