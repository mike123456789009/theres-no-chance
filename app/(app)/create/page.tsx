import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateMarketForm } from "@/components/markets/create-market-form";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CreateMarketPage() {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return (
      <main className="create-page">
        <section className="create-card create-card-warning" aria-label="Market creation configuration error">
          <p className="create-kicker">Create market</p>
          <h1 className="create-title">Market Creation Unavailable</h1>
          <p className="create-copy">
            This route requires Supabase auth configuration before market drafts can be submitted.
          </p>
          <p className="create-copy">
            Missing env vars: <code>{missingEnv.join(", ")}</code>
          </p>
          <p className="create-copy">
            Continue to <Link href="/">home</Link>
          </p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="create-page">
      <section className="create-card" aria-label="Market creation wizard">
        <p className="create-kicker">Create market</p>
        <h1 className="create-title">Draft or submit a market for review</h1>
        <p className="create-copy">
          Step 7 introduces creator submission flow with source validation, tags, and draft/review routing before any
          market opens for trading.
        </p>
        <p className="create-copy">
          Need market context first? Browse <Link href="/markets">public markets</Link>.
        </p>

        <CreateMarketForm />

        <p className="create-copy">
          Need to check criteria first? Return to <Link href="/">home</Link>.
        </p>
      </section>
    </main>
  );
}
