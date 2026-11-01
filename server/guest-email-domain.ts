import { Resolver } from "node:dns/promises";

/** DNS can reject a nonexistent mail domain, but cannot prove a mailbox exists. */
export async function guestEmailDomainAcceptsMail(email: string, resolver = new Resolver({ timeout: 2500, tries: 1 })): Promise<boolean> {
  const domain = email.split("@")[1];
  try {
    const records = await resolver.resolveMx(domain);
    if (records.length) return records.some(record => record.exchange && record.exchange !== ".");
  } catch (error: any) {
    if (error.code === "ENOTFOUND") return false;
    if (error.code !== "ENODATA") throw error;
  }
  // Domains without MX may legitimately accept mail at their A/AAAA address.
  const addresses = await Promise.allSettled([resolver.resolve4(domain), resolver.resolve6(domain)]);
  if (addresses.some(result => result.status === "fulfilled" && result.value.length > 0)) return true;
  for (const result of addresses) {
    if (result.status === "rejected" && !["ENODATA", "ENOTFOUND"].includes(result.reason?.code)) throw result.reason;
  }
  return false;
}
