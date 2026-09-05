# [DIST-NPM-BOOTSTRAP] Bootstrap the `@brip` npm packages

> **Parent:** [DIST-RELEASE](DIST-RELEASE-package-release-delivery.md) · **Size:** S · **Priority:** P0 · **Status:** Proposed · **GitHub issue:** [#66](https://github.com/brip-io/glyphscramble/issues/66)
> **Blocked by:** DIST-INSTALL-DX and the R12/R13/R14/counsel public-release gate · **Blocks:** DIST-TRUSTED-RELEASE and DIST-REGISTRY-E2E

## Objective

Create the nine public `@brip/glyphscramble*` package records through a one-time, tightly controlled bootstrap release, then remove the bootstrap credential and path.

## Background

As of 2026-09-05, npm returns `404 Not Found` for all nine intended package names. npm staged publishing requires a package to exist already, and trusted-publisher settings are configured per existing package. The permanent tokenless path therefore cannot create the initial registry objects by itself. [npm staged-publishing prerequisite](https://docs.npmjs.com/cli/v11/commands/npm-stage/)

## Design

### Ownership preflight

Before any tag or publish operation, two BRIP maintainers verify:

- the `@brip` npm organization and package namespace are controlled by BRIP;
- the releasing account uses phishing-resistant two-factor authentication where supported;
- package access is public and ownership is limited to current maintainers;
- all nine names are absent or, if any exists, its ownership and contents match this repository;
- the protected GitHub `npm-bootstrap` environment requires approval and prevents self-review.

### One-time publication

A dedicated bootstrap workflow accepts only an exact signed beta tag on the protected default branch. It downloads the already-qualified artifact bundle, verifies its inventory and qualification digest, and publishes each absent package with public access, provenance, and the `beta` dist-tag using a short-lived granular token stored only in `npm-bootstrap`.

Before each publish, the workflow queries the registry:

- absent package/version: publish the inventory artifact;
- present package/version with matching integrity: record success and continue;
- present package/version with different integrity or metadata: stop without mutating another package.

The workflow never repacks, changes `latest`, unpublishes, overwrites, or accepts an arbitrary branch dispatch.

### Immediate retirement

After all nine package records and exact beta versions verify, maintainers configure the permanent trusted publisher from DIST-TRUSTED-RELEASE, revoke the granular token, delete its environment secret, and disable or remove the bootstrap workflow. The closing evidence records who verified token revocation and when.

## Scope

- Bootstrap preflight command and human approval checklist.
- One-time GitHub workflow and idempotent registry-state helper.
- Coordinated public-access/provenance/beta-tag publication for all nine packages.
- Post-bootstrap ownership, digest, dist-tag, and token-revocation report.
- Removal or permanent disablement of the exceptional workflow after success.

## Non-goals

- Reusing the bootstrap token for routine releases.
- Creating placeholder packages before release artifacts qualify.
- Reserving additional names outside the nine-package inventory.
- Promoting the bootstrap beta to `latest`.

## Testing

- Unit-test absent, matching, conflicting, partially published, and retry states.
- Dry-run the workflow against a local/mock registry API without creating public names.
- Assert workflow permissions, tag/ref validation, protected environment, public access, provenance, and `beta` tag.
- Assert the prepared artifact digest is unchanged through publication.
- Record a manual two-maintainer rehearsal of the preflight and revocation checklist.

## Risks

- A bootstrap token is a temporary high-value secret. Restrict it by scope and lifetime, expose it only after environment approval, prohibit caching/debug logging, and revoke it immediately.
- Another owner may control a package name. Stop and resolve ownership; never publish a substitute name silently.
- A network failure may leave a partial coordinated version. Resume only after matching already-published digests; otherwise deprecate the affected version and prepare a new one under the operations policy.

## Exit criteria

All nine packages exist publicly at one coordinated beta version, `beta` resolves to that version without modifying `latest`, published digests match the signed artifact inventory, provenance is present, and the bootstrap token and workflow are demonstrably retired.
