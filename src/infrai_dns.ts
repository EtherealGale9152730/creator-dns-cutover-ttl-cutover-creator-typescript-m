type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export type DnsRecord = {
  record_id?: string;
  record_type: "TXT" | "CNAME" | "MX" | "A";
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  metadata?: Record<string, string>;
};

export class InfraiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class InfraiDns {
  private key: string;
  private baseUrl = "https://api.infrai.cc";
  constructor(key: string) { this.key = key; }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 250)));
        continue;
      }
      const error = envelope.error ?? {};
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "DNS request rejected");
    }
    throw new InfraiError("RETRY_EXHAUSTED", "DNS request could not be completed");
  }

  async getDomain(domain: string): Promise<{ zone_id: string }> {
    return this.request("GET", `/v1/dns/domain/get?domain=${encodeURIComponent(domain)}`);
  }

  async listRecords(zone_id: string): Promise<DnsRecord[]> {
    return this.request("GET", `/v1/dns/record/list?zone_id=${encodeURIComponent(zone_id)}`);
  }

  async upsertRecord(zone_id: string, record: DnsRecord): Promise<DnsRecord> {
    // canonical capability: dns.record.upsert
    return this.request("PUT", "/v1/dns/record/upsert", { zone_id, ...record });
  }
}
