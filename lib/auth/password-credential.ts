type PasswordCredentialInput = {
  email: string;
  password: string;
};

type PasswordCredentialConstructor = new (data: {
  id: string;
  name?: string;
  password: string;
}) => Credential;

export async function storePasswordCredential({ email, password }: PasswordCredentialInput): Promise<void> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail || !password) return;
  if (typeof window === "undefined") return;
  if (!("credentials" in navigator) || typeof navigator.credentials?.store !== "function") return;

  const candidate = (window as Window & { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential;
  if (typeof candidate !== "function") return;

  try {
    const credential = new candidate({
      id: normalizedEmail,
      name: normalizedEmail,
      password,
    });
    await navigator.credentials.store(credential);
  } catch {
    // Password-manager support varies by browser; ignore failures.
  }
}
