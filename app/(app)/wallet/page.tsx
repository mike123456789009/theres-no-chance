import { redirect } from "next/navigation";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

function toUrlSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      const first = value.find((entry) => typeof entry === "string" && entry.trim().length > 0);
      if (first) params.set(key, first);
      continue;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      params.set(key, value);
    }
  }

  return params;
}

export default async function LegacyWalletPage({ searchParams }: Readonly<{ searchParams?: SearchParamsInput }>) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const params = toUrlSearchParams(resolvedSearchParams);
  const queryString = params.toString();

  redirect(queryString ? `/account/wallet?${queryString}` : "/account/wallet");
}
