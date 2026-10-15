# Branch names — examples

Read when you need the literal shape. The rules live in `SKILL.md`; this file is only examples.

## Good

| Work | Branch |
|---|---|
| Company information from the Barnameh Bodjeh gateway | `feature/company-inquiry-v2` |
| Bulk SMS sending | `feature/bulk-sms` |
| SMS credentials committed in plain text | `fix/sms-credentials-encryption` |
| Fake data returns the wrong ceo | `fix/fake-ceo-data` |
| Move the SMS module to feature folders | `refactor/sms-folder-structure` |
| Upgrade EF Core packages | `chore/update-ef-core` |
| New Claude skill | `chore/commit-skill` |
| Document tenant resolution | `docs/tenant-resolution` |
| Tests for InsertLetter replay protection | `test/insert-letter-idempotency` |
| Slow person inquiry | `perf/person-inquiry-cache` |
| Shahkar calls timing out in production | `hotfix/shahkar-timeout` |
| Ticket 123, wrong company status | `fix/123-invalid-company-status` |

## Bad → fixed

| Bad | Problem | Fixed |
|---|---|---|
| `Feature/CompanyInquiry` | uppercase, PascalCase | `feature/company-inquiry` |
| `FEATURE/Company-Inquiry` | uppercase | `feature/company-inquiry` |
| `fix/invalid_company_status` | underscores | `fix/invalid-company-status` |
| `fix/InvalidCompanyStatus` | PascalCase | `fix/invalid-company-status` |
| `feature/update` | too vague | `feature/bulk-sms` |
| `feature/add-new-bulk-sms-sending-functionality-for-all-providers` | too verbose | `feature/bulk-sms` |
| `feature/add-new-controller-and-service` | implementation, not intent | `feature/company-inquiry` |
| `feat/sms` | `feat` is a commit type, not a branch type | `feature/sms` |
| `feature/estelam-sherkat` | transliterated Persian | `feature/company-inquiry` |
| `bugfix/status` | unknown type, vague | `fix/invalid-company-status` |
| `feature/sms/bulk` | more than one `/` | `feature/bulk-sms` |
| `feature-company-inquiry-v2` | old dash style, no type separator | `feature/company-inquiry-v2` |
