## 2025-05-18 - Improper CORS Origin Validation via String Matching
**Vulnerability:** Naive string comparison using `.endsWith(".space-z.ai")` allowed origin spoofing via URLs like `https://attacker.com#.space-z.ai` or `https://attacker.com?.space-z.ai`, because string matching checks the entire string rather than parsing the hostname.
**Learning:** Checking origins with `.endsWith()` or string inclusion without WHATWG URL parsing is unsafe as attackers can manipulate fragment identifier (`#`), query parameters (`?`), or path components.
**Prevention:** Always parse the Origin header with `new URL(origin)` and validate `parsed.hostname` explicitly against allowed domain(s) or exact subdomain patterns.

## 2025-05-19 - Open Redirect Bypass via WHATWG URL Control Character Stripping
**Vulnerability:** In `safeRedirectPath()`, checking `raw.startsWith("/")` and `!raw.startsWith("//")` without filtering control characters allowed open redirects using inputs like `/\t/evil.example` or `/\n/evil.example`, because WHATWG URL parsing strips whitespace and control characters before resolving the host.
**Learning:** Naive relative path string checks can be bypassed if control characters (e.g., `\t`, `\n`, `\r`) are present, as `new URL(path, origin)` strips them and interprets `/\t/evil.example` as protocol-relative `//evil.example`.
**Prevention:** Explicitly reject whitespace/control characters (`/[\t\n\r\\]/`) and validate that `new URL(raw, dummyOrigin).origin === dummyOrigin`.
