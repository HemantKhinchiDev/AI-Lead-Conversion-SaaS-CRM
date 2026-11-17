export const dynamic = "force-dynamic";

type HealthResult =
  | { kind: "unconfigured" }
  | { kind: "unavailable" }
  | { kind: "unhealthy"; status: number }
  | { kind: "healthy"; status: string };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

function healthEndpoint(): string | null {
  if (!apiBaseUrl) {
    return null;
  }
  return `${apiBaseUrl.replace(/\/+$/, "")}/health`;
}

async function readHealth(): Promise<HealthResult> {
  const endpoint = healthEndpoint();
  if (!endpoint) {
    return { kind: "unconfigured" };
  }

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      return { kind: "unhealthy", status: response.status };
    }

    const body: unknown = await response.json();
    const status =
      typeof body === "object" && body !== null && "status" in body
        ? String((body as { status: unknown }).status)
        : "unknown";

    return { kind: "healthy", status };
  } catch {
    return { kind: "unavailable" };
  }
}

function statusLabel(result: HealthResult): string {
  switch (result.kind) {
    case "unconfigured":
      return "Not configured";
    case "unavailable":
      return "Unavailable";
    case "unhealthy":
      return `Responding with HTTP ${result.status}`;
    case "healthy":
      return result.status === "ok" ? "OK" : `Unexpected payload: ${result.status}`;
  }
}

export default async function Home() {
  const health = await readHealth();
  const endpoint = healthEndpoint();

  return (
    <main>
      <section className="panel">
        <h1>AI Lead Conversion</h1>
        <p className="subtitle">Consent-first lead conversion workspace</p>
        <div className="status" data-state={health.kind}>
          <span className="dot" aria-hidden="true" />
          <div>
            <p className="label">Backend health</p>
            <p className="value">{statusLabel(health)}</p>
          </div>
        </div>
        <p className="hint">
          {endpoint ? (
            <a href={endpoint}>Open backend health endpoint</a>
          ) : (
            "Set NEXT_PUBLIC_API_BASE_URL to check the backend."
          )}
        </p>
      </section>
    </main>
  );
}
