## 2025-05-18 - Improper CORS Origin Validation via String Matching
**Vulnerability:** Naive string comparison using `.endsWith(".space-z.ai")` allowed origin spoofing via URLs like `https://attacker.com#.space-z.ai` or `https://attacker.com?.space-z.ai`, because string matching checks the entire string rather than parsing the hostname.
**Learning:** Checking origins with `.endsWith()` or string inclusion without WHATWG URL parsing is unsafe as attackers can manipulate fragment identifier (`#`), query parameters (`?`), or path components.
**Prevention:** Always parse the Origin header with `new URL(origin)` and validate `parsed.hostname` explicitly against allowed domain(s) or exact subdomain patterns.

## 2026-09-10 - Open Redirect via Unvalidated Host / X-Forwarded-Host Headers
**Vulnerability:** Constructing redirect target origins from raw `X-Forwarded-Host` or `Host` headers allowed attackers to bypass relative path open-redirect guards (`safeRedirectPath`) and redirect users to malicious domains.
**Learning:** `safeRedirectPath` ensures `redirectPath` is a relative path (e.g. `/dashboard`), but `new URL(redirectPath, origin)` will resolve to an attacker's external domain if `origin` is built from unvalidated request headers.
**Prevention:** Always validate candidate origins built from `X-Forwarded-Host` or `Host` headers against `ALLOWED_ORIGINS` and `request.nextUrl.origin` before using them as redirect bases.
