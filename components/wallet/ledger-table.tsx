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
        <Link href={`/markets/${marketId}`} className="ledger-market-link">
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
    <div className="tnc-table-wrap">
      <table className="tnc-data-table tnc-data-table--ledger">
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th className="is-right">Amount</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{formatDate(entry.createdAt)}</td>
              <td>{entry.entryType}</td>
              <td className="is-right">{formatSignedCurrency(entry.amount)}</td>
              <td>{isRecord(entry.metadata) ? renderMeta(entry.metadata) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
