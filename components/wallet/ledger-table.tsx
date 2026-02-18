import Link from "next/link";

type LedgerEntryDTO = {
  id: string;
  entryType: string;
  amount: number;
  currency: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type LedgerTableProps = {
  entries: LedgerEntryDTO[];
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedCurrency(value: number): string {
  if (value === 0) return formatCurrency(0);
  const absolute = formatCurrency(Math.abs(value));
  return value > 0 ? `+${absolute}` : `-${absolute}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractMarketId(metadata: Record<string, unknown>): string | null {
  const marketId = clean(metadata.marketId) || clean(metadata.market_id);
  return marketId || null;
}

function renderMeta(metadata: Record<string, unknown>): React.ReactNode {
  const marketId = extractMarketId(metadata);
  const intent = clean(metadata.intent);
  const key = clean(metadata.key);
  const tokensGranted = clean(metadata.tokensGranted) || clean(metadata.tokens_granted);

  if (marketId) {
    return (
      <span>
        market{" "}
        <Link href={`/markets/${marketId}`} style={{ textDecoration: "underline" }}>
          {marketId.slice(0, 8)}…
        </Link>
      </span>
    );
  }

  if (intent && key) {
    return (
      <span>
        {intent}:{key}
        {tokensGranted ? ` (${tokensGranted} tokens)` : ""}
      </span>
    );
  }

  if (key && tokensGranted) {
    return (
      <span>
        {key} ({tokensGranted} tokens)
      </span>
    );
  }

  return <span>—</span>;
}

export function LedgerTable({ entries }: LedgerTableProps) {
  if (!entries.length) {
    return <p className="create-note">No ledger entries yet.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: "860px",
          fontFamily: "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: "0.78rem",
        }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Time</th>
            <th style={{ textAlign: "left", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Type</th>
            <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Amount</th>
            <th style={{ textAlign: "left", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem" }}>{formatDate(entry.createdAt)}</td>
              <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem" }}>{entry.entryType}</td>
              <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                {formatSignedCurrency(entry.amount)}
              </td>
              <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem" }}>
                {isRecord(entry.metadata) ? renderMeta(entry.metadata) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

