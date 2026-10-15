# Eval — csharp-build-gate

Every item is pass/fail; a failed item means the work is unfinished.

1. No new `var` where the right-hand side is an `await`, a `FirstOrDefault`/`Select`/`Where`/`Any` call, or a bare
   property or field. Each uses the explicit type.
2. No `#pragma warning disable`, `[SuppressMessage]` or `.editorconfig` change was added to get past a style error.
3. New and edited files use file-scoped namespaces, `using` outside the namespace, braces on every block and an
   explicit accessibility modifier on every non-interface member.
4. Single-expression properties and accessors are expression-bodied.
5. `dotnet build Kama.ExternalServices.API.slnx` (or the narrowed project via `/build`) reports **0 errors**.
   `CA`/`S` warnings were not "fixed" as a side effect.
6. If the build was not run, the report says so rather than claiming it passes.
