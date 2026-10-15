# Commit messages — examples

Read when you need the literal shape. The rules live in `SKILL.md`; this file is only examples.

## Good

```
feat(inquiry): add Barnameh Bodjeh company complete information

Tazamin is routed to sr-ix.mporg.ir; Payesh and Haman keep the Jahad
Keshavarzi gateway. The fake service returns the same shape.
```

```
fix(sms): encrypt Magfa and Barnameh Bodjeh credentials

Sms:Providers:Username/Password were committed in plaintext. Both are
now in FieldsToEncrypt and stored as #KamaEncryption# values.
```

```
feat(automation): add replay protection to InsertLetter

Needs ConnectionStrings:Database and Idempotency:Enabled=true. Run
AutomationLetterIdempotency.sql first if the app account has no DDL
rights.
```

```
feat(shahkar): add mobile owner matching for the haman tenant
```

```
refactor(sms): move provider services under Shared
```

```
chore(fake-data): update ceo for national code 14014805143
```

```
build(deps): update EF Core packages to 10.0.12
```

```
ci(api): publish with the Stage configuration on release branches
```

```
docs(common): describe the tenant resolution flow
```

```
feat(inquiry)!: return the company status as an enum

BREAKING CHANGE: status in the company response changes from a Persian
string to a numeric code. Consumers must map it.
```

## Bad → better

| Bad (from this repo's history or common habit) | Better |
|---|---|
| `.` | name the change: `fix(inquiry): return not found for an unknown national id` |
| `sms module - update` | `feat(sms): add bulk message sending` |
| `fake data update` | `chore(fake-data): add sample person for national code 1234567890` |
| `fakeData - ceo updated for 14014805143` | `chore(fake-data): update ceo for national code 14014805143` |
| `SabteAhval-Responses - updated` | `fix(inquiry): align the fake response with the real gateway` |
| `remove test allowAnonymous` | `fix(api): require authentication on all endpoints` |
| `fix: fixed the bug in handler by adding null check` | `fix(shahkar): return a validation error for an empty mobile number` |
| `update files` | name the change and its module |
