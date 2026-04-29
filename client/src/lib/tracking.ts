// Session ID – persistent across page loads within the same browser
export function getSessionId(): string {
  try {
    let sid = localStorage.getItem("_sid");
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem("_sid", sid);
    }
    return sid;
  } catch {
    return "unknown";
  }
}

// Fire-and-forget event tracking – never throws
export async function trackProductEvent(
  productId: number,
  eventType: "view" | "cart_add",
  userId?: number | null
): Promise<void> {
  try {
    await fetch("/api/events/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        eventType,
        sessionId: getSessionId(),
        userId: userId ?? null,
      }),
    });
  } catch {}
}
