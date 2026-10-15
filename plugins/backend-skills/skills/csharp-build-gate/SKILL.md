---
name: csharp-build-gate
description: Fixes style build errors (IDE*) in this repo - IDE0008 var vs explicit type, using placement, braces, accessibility modifiers, expression bodies, file-scoped namespaces. Use when the build fails on a style rule, or before writing many C# files. Logic/runtime bugs → debugger agent.
allowed-tools: Read, Grep, Glob, Edit, Bash(dotnet build:*)
---

# The style rules that fail this build

**Announce once, before any other tool call:** 🛠 skill: csharp-build-gate — checklist: `.claude/skills/csharp-build-gate/EVAL.md`

`Directory.Build.props` sets `EnforceCodeStyleInBuild=true`, and `.editorconfig` sets about 50 `IDE` rules to
`:error`. A style slip is therefore a **build failure with nothing wrong logically**. Write the compliant form the
first time instead of finding out at the end of a build.

The `PostToolUse` hook `.claude/hooks/csharp-style-lint.sh` catches the most common one (IDE0008) in about a second
on every `.cs` edit. It is a deliberately narrow safety net, not a substitute for knowing the rules below.

## What is an error here, and what is not

From `Directory.Build.props` and `.editorconfig`:

| Family | Status | Why |
|---|---|---|
| `IDE####` set to `:error` | **Build error** | `EnforceCodeStyleInBuild=true` plus the severities in `.editorconfig` |
| `CS####` | **Build error** | ordinary compiler diagnostics |
| `CA####` | **Warning** | `AnalysisMode=All` surfaces them, but `CodeAnalysisTreatWarningsAsErrors=false` |
| `S####` (SonarAnalyzer) | **Warning** | `TreatWarningsAsErrors=false`, none set to error |

So a wall of `CA`/`S` output is noise with respect to the build. Do not "fix all warnings" as a side effect of an
unrelated task. That is a separate, deliberate cleanup. (This differs from the Pesticide repo, where `CA` is an error.)

## IDE0008 — the one that breaks builds most often

```
csharp_style_var_elsewhere = false:error
csharp_style_var_for_built_in_types = false:error
csharp_style_var_when_type_is_apparent = true:error
```

`var` is legal **only** when Roslyn considers the type apparent from the right-hand side.

### `var` is fine — the type is apparent

```csharp
var provider = new ProviderInfo();                  // object creation
var rows = new[] { 1, 2, 3 };                       // array creation
var info = (ApplicationInfo)obj;                    // cast
var id = default(Guid);                             // default
var items = query.ToList();                         // To*  -> conversion-named call
var parsed = int.Parse(raw);                        // Parse
var result = Result.Success();                      // Create*/From* style factory names
```

Rule of thumb: **object creation, a cast, `default`, or a call whose name begins with
`To` / `As` / `From` / `Parse` / `Create`.**

### `var` is a BUILD ERROR — the type is not apparent

```csharp
var provider = await serviceProvider.GetServiceProvider(cancellationToken);  // await + arbitrary name
var application = items.FirstOrDefault();
var exists = items.Any(x => x.Id == id);
var mapped = items.Select(x => new Response(x));        // `new` is INSIDE the lambda, not the RHS
var host = provider.Host;                               // bare property
```

Write the explicit type:

```csharp
SmsOptions.ProviderInfo provider = await serviceProvider.GetServiceProvider(cancellationToken);
ApplicationInfo? application = items.FirstOrDefault();
bool exists = items.Any(x => x.Id == id);
```

Two traps:

- **`.Select(x => new T(...))` does not count.** The `new` is inside the lambda; the right-hand side is an
  invocation named `Select`. It looks compliant and is not.
- **A multi-line chain is judged by its last call.** A chain ending in `.ToList()` is fine; the same chain ending at
  `.Select(...)` is an error. The lint hook only examines single-line statements for this reason.

Existing code in this repo does use `var` in a few places (for example `var extensions = new Dictionary<...>`,
which is legal because of `new`). Copy the rule, not a random line.

## The other rules that bite

- **`using` directives outside the namespace** (`csharp_using_directive_placement = outside_namespace:error`),
  and **file-scoped namespaces** (`namespace X;`), never the braced form.
- **Braces on every block**, including single-statement `if`s (`csharp_prefer_braces = true:error`).
- **Explicit accessibility modifiers** on every non-interface member
  (`dotnet_style_require_accessibility_modifiers = for_non_interface_members:error`).
- **Expression bodies are required** for single-expression properties, accessors, indexers, operators and local
  functions (`:error`). For methods and constructors they are `silent`, so either form passes.
- **Predefined types**: `string`/`int`/`bool`, never `String`/`Int32`/`Boolean`.
- **No `this.` qualification** on fields, properties, methods or events.
- **Null propagation, object/collection initializers, compound assignment, inferred tuple names, `is null`
  checks, simple `using` statements, switch expressions, pattern matching over `as`/`is`+cast, `readonly`
  fields** are all `:error`. If the compiler suggests a simpler form, take it.
- **Parentheses**: no unnecessary parentheses in arithmetic and relational expressions.

`sealed` is **not** enforced (`CA1852` is off), but the house style is `internal sealed class` for concrete types.
Keep doing it. See `docs/claude/03-conventions.md`.

## Working method

1. Write the explicit type by default. Reach for `var` only in the apparent cases above. The codebase is mostly
   explicit, so explicit is also the house style.
2. Let the `PostToolUse` lint hook catch what slips through.
3. Build once at the end with `/build`, which deduplicates MSBuild's repeated errors.
4. Fixing a reported IDE0008 means writing the *real* type. Do not silence it with a `#pragma`, a `.editorconfig`
   suppression, or by restructuring into a `.ToList()` you did not want.

## Reference files

- `Directory.Build.props`: `EnforceCodeStyleInBuild`, `AnalysisMode`, the two `...TreatWarningsAsErrors` switches.
- `.editorconfig` lines 24-145: the `:error` severities.
- `.claude/hooks/csharp-style-lint.sh`: the fast check and the exact pattern list it uses.
- `.claude/commands/build.md` (`/build`): deduplicated build output.

**Done = `EVAL.md` (same folder) passes.**
