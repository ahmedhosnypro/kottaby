"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const SENSITIVE_QUERY_PARAMS = ["token", "secret", "code", "forceComplete"] as const;

function redactUrl(url: string): string {
  const parsed = new URL(url);
  for (const key of SENSITIVE_QUERY_PARAMS) {
    parsed.searchParams.delete(key);
  }
  return parsed.toString();
}

function beforeSend<T extends { url: string }>(data: T): T {
  return { ...data, url: redactUrl(data.url) };
}

export function VercelObservability() {
  return (
    <>
      <Analytics beforeSend={beforeSend} />
      <SpeedInsights beforeSend={beforeSend} />
    </>
  );
}
