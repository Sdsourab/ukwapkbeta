# 12 — Security, Privacy & Data Protection

## 12.1 Security goals

- Protect private notes and research data.
- Prevent cross-account data access.
- Limit extension permissions.
- Treat webpage content as untrusted.
- Protect authentication tokens.
- Make export and deletion predictable.

## 12.2 Threat model

| Threat | Example | Mitigation |
|---|---|---|
| Cross-user data exposure | Guessing another record ID | RLS and ownership checks |
| Malicious webpage | Page sends forged extension message | Validate sender and schema |
| Script injection | Note content contains HTML/script | Escape/sanitize rendered content |
| Secret leakage | Service key bundled in extension | Never ship privileged secrets |
| Token theft | Unsafe storage or logging | Use provider-recommended auth storage |
| Sync replay | Duplicate operation delivered | Idempotency operation IDs |
| Data loss | Conflict overwrites newer edit | Revision tracking and conflict copies |
| Malicious import | Crafted JSON payload | Schema validation and size limits |

## 12.3 Extension permissions

Request the minimum permissions necessary. Prefer optional host permissions or user-triggered access where practical. Explain why each permission is needed.

Do not request broad access to all websites unless the product genuinely requires it and the user understands the scope.

## 12.4 Content security

- Treat source webpage text as untrusted.
- Never execute source text.
- Avoid `innerHTML` for user or page content.
- Sanitize Markdown/HTML output.
- Validate URL schemes before opening links.
- Do not allow `javascript:` URLs.
- Keep extension UI isolated where possible.
- Do not expose internal message handlers to arbitrary page scripts.

## 12.5 Authentication and authorization

- Use a supported authentication provider.
- Enable RLS on all user-owned cloud tables.
- Policies must use the authenticated identity.
- Check ownership on reads, inserts, updates, and deletes.
- Never trust a client-supplied `owner_id`.
- Do not place service-role credentials in frontend code.

## 12.6 Local data protection

Browser local storage is not automatically equivalent to encrypted vault storage. Do not claim end-to-end encryption unless it is actually implemented and independently reviewed.

Provide:
- Clear local data controls.
- Account sign-out explanation.
- Export before destructive reset.
- Optional application lock only if secure implementation is available.

## 12.7 Privacy defaults

- Save only what the user chooses to annotate or capture.
- Do not silently archive full pages.
- Do not send page content to a third party for analysis.
- No AI API calls in this release.
- Make cloud sync opt-in or clearly explained.
- Provide account data export and deletion.

## 12.8 Incident response

If a security issue is found:
1. Stop the affected release.
2. Reproduce and assess impact.
3. Disable the risky capability if needed.
4. Patch and test.
5. Review logs without exposing private content.
6. Document the incident and mitigation.
