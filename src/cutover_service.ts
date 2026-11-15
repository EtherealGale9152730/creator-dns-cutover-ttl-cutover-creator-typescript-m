import { z } from "zod";
import { InfraiDns, type DnsRecord } from "./infrai_dns.ts";

export const CutoverRequest = z.object({
  domain: z.string().min(1),
  creator: z.string().min(1),
  deliveryHost: z.string().min(1),
  subscribers: z.array(z.string().email()),
  contentJob: z.object({ assetId: z.string().min(1), state: z.enum(["queued", "processing", "ready"]) })
});
export type CutoverRequest = z.infer<typeof CutoverRequest>;

export type CutoverResult = {
  zone_id: string;
  changed: DnsRecord;
  rollback: DnsRecord | null;
  subscriberCount: number;
  contentState: string;
};

export async function cutOverCreatorSite(input: unknown, dns: InfraiDns): Promise<CutoverResult> {
  const request = CutoverRequest.parse(input);
  const { zone_id } = await dns.getDomain(request.domain);
  const records = await dns.listRecords(zone_id);
  const previous = records.find((record) => record.record_type === "CNAME" && record.name === "www") ?? null;
  const changed = await dns.upsertRecord(zone_id, {
    record_type: "CNAME",
    name: "www",
    content: request.deliveryHost,
    ttl: 60,
    proxied: false,
    metadata: { creator: request.creator, asset_id: request.contentJob.assetId }
  });
  return { zone_id, changed, rollback: previous, subscriberCount: request.subscribers.length, contentState: request.contentJob.state };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the cutover script");
  const input = JSON.parse(process.env.CUTOVER_INPUT ?? "{}");
  const result = await cutOverCreatorSite(input, new InfraiDns(key));
  console.log(JSON.stringify(result, null, 2));
}
