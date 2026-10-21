# Security and private reporting

Do not publish passwords, access tokens, device addresses/serials, private captures, challenge-response material, or personal information in public issues.

For a suspected code defect, a public report may contain a minimal synthetic reproduction and affected version without sensitive data. For sensitive reports, use GitHub's private vulnerability reporting if enabled on the repository; otherwise contact the repository owner privately through a channel you already trust. No private contact address is invented here.

Current security boundary: static app, no runtime external requests, no application BLE writes, no credentials, and origin-local IndexedDB. CSP restricts scripts/styles to self and blocks network connections, forms, objects, and base URL changes.

Default reports omit packet payloads. Engineering raw export may contain unknown secrets in binary hex; recognized text redaction cannot remove every secret. Browsers may evict data and do not provide the application with an encrypted credential vault. Never collect legitimate credentials until a separate reviewed authentication design exists.

Dependency audits and a recognized credential-pattern check run in CI. Neither proves complete security. Hardware safety additionally depends on the physical power stop and intended toy operation.
