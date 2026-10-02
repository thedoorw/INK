# INK

INK live test and deployment mirror.

## Role

This repository is the public/live-test deployment surface for INK.

Authoritative development remains in:

`thedoorw/INK-Browser-QA`

Rules:

- do not develop product features in this repository;
- deploy only a selected exact source SHA from `INK-Browser-QA`;
- test findings return to `INK-Browser-QA`;
- this repository may remain fixed while development continues independently;
- `BUILD_INFO.json` records the deployed source identity.

Current state: deployment mirror initialized; first INK build pending.
