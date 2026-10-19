import { Capacitor, CapacitorHttp } from "@capacitor/core";

/**
 * On Android the request goes through the native HTTP stack (CapacitorHttp), so it is not
 * subject to WebView CORS - this is what lets the APK scrape Cambridge without a server.
 * In a desktop browser we fall back to fetch(), which only works against a CORS-enabled backend.
 */
export async function httpRequest(
  url: string,
  opts: { method?: "GET" | "POST"; headers?: Record<string, string>; json?: unknown } = {},
): Promise<{ status: number; data: string }> {
  const method = opts.method ?? "GET";
  const headers = { ...(opts.headers ?? {}), ...(opts.json ? { "Content-Type": "application/json" } : {}) };
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: opts.json,
      responseType: "text",
      connectTimeout: 10000,
      readTimeout: 10000,
    });
    return { status: res.status, data: typeof res.data === "string" ? res.data : JSON.stringify(res.data) };
  }
  const res = await fetch(url, { method, headers, body: opts.json ? JSON.stringify(opts.json) : undefined });
  return { status: res.status, data: await res.text() };
}
