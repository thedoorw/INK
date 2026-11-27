# #765 Real release-only verification

The Public **design-only** branch intentionally does not modify Private
`dist/startup/` bundles or `service-worker-runtime.js`. Therefore the
Real bundle/SW closure gate is `NOT_RUN` for the design POC; it has **not passed**.

At an authorized integrated release candidate, run:

```bash
node --test qa/ui-shared-preview/release-only/*.release.mjs
```

All assertions are strict, never skipped. They are excluded from the Mock +
catalog source profile (`node --test qa/ui-shared-preview/*.test.mjs`), and
`--scope full` continues to require independent paired Browser evidence.
