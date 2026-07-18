# Security policy

Causal Lab processes untrusted scenario JSON but does not execute supplied code or contact remote hosts. The optional Hono server binds to loopback by default and has no authentication layer.

Report suspected vulnerabilities through GitHub security advisories.

The release gate is:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm audit --prod --audit-level high
```

A passing run only states that the pinned tools found no current issue. It is not an absolute security guarantee.

