import assert from "node:assert/strict";
import { cutOverCreatorSite } from "./cutover_service.ts";
import type { DnsRecord } from "./infrai_dns.ts";

const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
const fakeDns = {
  async getDomain() { calls.push({ method: "GET", path: "domain" }); return { zone_id: "zone_creator" }; },
  async listRecords() { calls.push({ method: "GET", path: "records" }); return [{ record_type: "CNAME", name: "www", content: "old.cdn.example", ttl: 60 }]; },
  async upsertRecord(zone_id: string, record: DnsRecord) {
    const body = { zone_id, ...record };
    calls.push({ method: "PUT", path: "/v1/dns/record/upsert", body });
    return record;
  }
};

const result = await cutOverCreatorSite({
  domain: "studio.example",
  creator: "Mina",
  deliveryHost: "edge.example",
  subscribers: ["fan@example.com"],
  contentJob: { assetId: "video-17", state: "ready" }
}, fakeDns as never);

assert.equal(result.rollback?.content, "old.cdn.example");
assert.equal(result.changed.content, "edge.example");
assert.equal(result.changed.ttl, 60);
assert.equal(result.subscriberCount, 1);
assert.equal(calls[2].body?.zone_id, "zone_creator");
console.log("cutover decision test passed");
