"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DepositStatusBannerProps = {
  kind: "pending" | "credited" | "canceled" | "unknown";
  title: string;
  detail: string;
  showRefresh?: boolean;
};

export function DepositStatusBanner({ kind, title, detail, showRefresh }: DepositStatusBannerProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const background =
    kind === "credited" ? "#e9f8f0" : kind === "pending" ? "#fff6df" : kind === "canceled" ? "#f9ecec" : "#f2f2f2";
  const border =
    kind === "credited" ? "#1a7f37" : kind === "pending" ? "#b7791f" : kind === "canceled" ? "#b42318" : "#777777";

  return (
    <section
      aria-label="Deposit status"
      style={{
        border: `1px solid ${border}`,
        background,
        padding: "0.8rem 0.9rem",
        marginBottom: "1rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "0.9rem" }}>
        <div>
          <p className="create-note" style={{ margin: 0 }}>
            <strong>{title}</strong>
          </p>
          <p className="create-note" style={{ margin: "0.35rem 0 0" }}>
            {detail}
          </p>
        </div>

        {showRefresh ? (
          <button
            type="button"
            className="create-submit"
            disabled={isRefreshing}
            onClick={() => {
              setIsRefreshing(true);
              router.refresh();
              setTimeout(() => setIsRefreshing(false), 800);
            }}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

