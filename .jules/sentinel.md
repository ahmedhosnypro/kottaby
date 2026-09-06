## 2025-05-18 - Improper CORS Origin Validation via String Matching
**Vulnerability:** Naive string comparison using `.endsWith(".space-z.ai")` allowed origin spoofing via URLs like `https://attacker.com#.space-z.ai` or `https://attacker.com?.space-z.ai`, because string matching checks the entire string rather than parsing the hostname.
**Learning:** Checking origins with `.endsWith()` or string inclusion without WHATWG URL parsing is unsafe as attackers can manipulate fragment identifier (`#`), query parameters (`?`), or path components.
**Prevention:** Always parse the Origin header with `new URL(origin)` and validate `parsed.hostname` explicitly against allowed domain(s) or exact subdomain patterns.
