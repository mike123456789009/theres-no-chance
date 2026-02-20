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

  return (
    <section aria-label="Deposit status" className={`deposit-status-banner kind-${kind}`}>
      <div className="deposit-status-banner-head">
        <div>
          <p className="create-note deposit-status-title">
            <strong>{title}</strong>
          </p>
          <p className="create-note deposit-status-detail">
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
