# INK Public Release Gate 001 — trusted verifier, not the publisher

**Status:** PREPARED / FAIL-CLOSED. This is the public `thedoorw/INK` side of [INK Private Transition #257](https://github.com/thedoorw/INK-Browser-QA/issues/257). The source SSOT remains `thedoorw/INK-Browser-QA`; the public repository is a Runtime mirror and release-policy host.

**User experience after full cutover:** USER authorizes an exact tested version in CHAT. CHAT prepares the release candidate, opens its protected public PR, waits for the trusted verifier and other required gates, merges using GitHub Plugin under USER authority, and verifies real `https://thedoorw.github.io/INK/` (including Pages, loaded Build ID, real Chrome). No routine manual GitHub release action by USER.

## Trusted verification architecture

1. Private source packs **only allowed runtime bytes** from exact accepted Git objects and provides independently audited native QA/Windows/Chrome evidence. Source/private signing key is **not** public and must never enter the public candidate branch.
2. CHAT creates a public `release-candidate/<id>` branch from pinned public `main`, uploads the immutable runtime bytes plus `BUILD_INFO.json`, `PUBLISH_RECEIPT.json`, `release/CANDIDATE.json` and detached `release/CANDIDATE.sig`, and opens a PR.
3. Public `.github/workflows/ink-public-release-gate-001.yml` runs `pull_request_target`, **checking out the trusted protected BASE** under `trusted/`. Untrusted PR checkout is **data only** under `candidate/`. It does not execute candidate JS, install candidate packages or use publication secrets. It runs only the trusted base verifier and policy.
4. Trusted verifier requires actual source SHA/tree, action publish/rollback, candidate-only intent, signed canonical manifest from an **already pinned** Ed25519 public key, exact prior public main HEAD/tree/receipt SHA256, complete bounded 200+ runtime inventory, every byte SHA256, normal file types, no path/symlink traversal, old-managed-file retirement, BUILD_INFO/source/receipt cross-check, and exact PR diff path restrictions. A change to `.github/`, `engineering/`, `working/`, `research/` or other source-only path is rejected.
5. A **required** `public-release-candidate-verify` status on `INK/main` is a separate **USER GitHub-admin settings checkpoint**, after the trusted workflow is merged. Branch protection must still require PR and no admin bypass. Only then can CHAT merge a successfully verified and USER-authorized release PR. The existing direct-main Publisher remains blocked.
6. Public Pages deploys after merge; CHAT independently runs actual live browser/Storage/SW/first-frame verification and records source→artifact→target→browser identity. Rollback is a new signed and reviewed release candidate, not an unprotected force push.

## Fail-closed initial configuration

`engineering/public-release/policy.json` currently has `signers: []` by design: **every real candidate fails until a source signing public key is deliberately pinned through a trusted policy PR**. Adversarial self-tests use generated ephemeral keys, not a production signer; never claim these tests authorize a real release.

One-time future USER GitHub account tasks, coordinated in CHAT:
- Configure a secure private signing key in an authorized private Actions **repository secret** (not unusable private Environment Secrets under GitHub Free). Do not paste the private key into a chat or commit.
- Publish the corresponding public key in the protected public policy via a carefully reviewed PR.
- Set the public `main` required status check **after this workflow exists on main**, verify direct-push and invalid-PR rejection with the actual future cross-repo credential (or use CHAT's GitHub connector to submit branches without creating a separate cross-repo PAT).
- Test a real allowed candidate, refusal of changed/missing files, protected PR merge, Pages Live, exact receipt, and bounded rollback.

## Current engineering limits / not-yet-proven

- Candidate verifier is a **read-only gate**; it does not itself create packages, issue GitHub tokens, grant public commit rights, deploy, or run real browser QA.
- It validates the runtime SHA256 records, receipt and BUILD_INFO consistency, but **does not duplicate the source packager's full dependency closure or independent native product tests**. Those evidence gates remain at the source and need formal binding to approved source SHA before full cutover.
- Public control-plane files `.github/workflows/ink-public-release-gate-001.yml` and `engineering/public-release/**` must be classified as preserved trusted paths by the source publisher's legacy allowlist before next transition. The old direct-main code may never be used to bypass the now protected `INK/main`.
- A public control-plane bootstrap PR may not contain Runtime changes; this is not a new product release. Its verifier self-tests do not substitute for the trusted post-merge candidate path.
- Signed candidate and previous receipt may be public; no private code, QA research, user data, Actions key or secrets may be attached.
- This preparation alone does not authorize source repo visibility conversion.

Primary authority: [maintenance/WORKFLOW.md](https://github.com/thedoorw/INK-Browser-QA/blob/main/maintenance/WORKFLOW.md) and [Issue #257](https://github.com/thedoorw/INK-Browser-QA/issues/257).
