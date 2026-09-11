## 2025-05-18 - Improper CORS Origin Validation via String Matching
**Vulnerability:** Naive string comparison using `.endsWith(".space-z.ai")` allowed origin spoofing via URLs like `https://attacker.com#.space-z.ai` or `https://attacker.com?.space-z.ai`, because string matching checks the entire string rather than parsing the hostname.
**Learning:** Checking origins with `.endsWith()` or string inclusion without WHATWG URL parsing is unsafe as attackers can manipulate fragment identifier (`#`), query parameters (`?`), or path components.
**Prevention:** Always parse the Origin header with `new URL(origin)` and validate `parsed.hostname` explicitly against allowed domain(s) or exact subdomain patterns.

## 2026-09-11 - Host Header Injection / Open Redirect in API Redirect Routes
**Vulnerability:** Constructing redirect origin URLs from untrusted `X-Forwarded-Host` or `Host` request headers allowed Host Header Injection and Open Redirect attacks (e.g. `X-Forwarded-Host: evil.example` causing redirects to `https://evil.example/dashboard`).
**Learning:** Request headers like `Host` or `X-Forwarded-Host` can be spoofed by clients unless validated against an origin allowlist or trusted server origin.
**Prevention:** Always validate host-derived candidate origins against `ALLOWED_ORIGINS` or `request.nextUrl.origin` before passing them to `NextResponse.redirect` or `new URL()`.
