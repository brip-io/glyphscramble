# [DIST-OPERATIONS] Release, recovery, and rollback operations

> **Parent:** [DIST-RELEASE](DIST-RELEASE-package-release-delivery.md) · **Size:** S · **Priority:** P0 · **Status:** Proposed · **GitHub issue:** [#70](https://github.com/brip-io/glyphscramble/issues/70)
> **Blocked by:** DIST-REGISTRY-E2E and one complete beta rehearsal · **Blocks:** stable promotion

## Objective

Give BRIP maintainers a concise, tested operating procedure for routine releases, delayed approvals, partial publication, bad versions, dist-tag rollback, maintainer changes, and credential or workflow compromise.

## Background

Package publication is an external, partially irreversible operation across GitHub, npm, and CDNs. Automation reduces mistakes but does not answer who approves a release, how a second maintainer resumes it, or what to do after only some coordinated packages publish. npm package versions are immutable in normal operation, so rollback means controlling dist-tags and deprecations and publishing a corrected version rather than altering bytes.

## Design

Create one operator runbook with role separation and evidence checkpoints:

1. **Prepare:** confirm R12/R13/R14/counsel gates, Changesets state, signed tag, expected channel, package inventory, protected environments, and npm trusted-publisher configuration.
2. **Stage:** inspect the candidate set, approve GitHub deployment, stage with OIDC, and preserve the release-state report.
3. **Finalize:** use strong npm authentication to approve staged publications, then wait for automated registry and CDN verification.
4. **Announce:** publish the GitHub Release only after evidence is complete; update no mutable channel outside the approved decision.
5. **Recover:** resume an interrupted phase from recorded state; refuse conflicting digests; never repack the tag.
6. **Correct:** deprecate a bad version with an actionable message, move an affected dist-tag to the last known-good compatible version when approved, and publish a new corrected version.
7. **Respond:** disable workflows, revoke tokens or trusted-publisher identities, remove stale maintainers, preserve logs, assess affected versions, and rotate GitHub/npm access after compromise.

The runbook includes copyable read-only preflight and verification commands, but destructive or public mutations remain explicit human-reviewed steps. It records which controls cannot be queried automatically and require screenshots or two-person attestation.

## Scope

- Routine beta and eventual stable release checklist.
- Responsibility matrix for tag author, GitHub environment reviewer, npm staged approver, and verifier.
- Partial-stage/publication decision tree and resumable commands.
- Deprecation, dist-tag rollback, corrected-release, and communication procedure.
- Maintainer offboarding and suspected credential/workflow compromise playbook.
- Evidence-retention locations and minimum incident record.

## Non-goals

- Automatically unpublishing npm packages.
- Treating dist-tag rollback as removal of already-installed bytes.
- Replacing BRIP's broader security incident-response process.
- Promoting stable until release-readiness and support criteria are separately approved.

## Testing and rehearsal

- A maintainer who did not author the automation executes a complete beta rehearsal from the runbook.
- Tabletop interruption after artifact preparation, partial staging, partial public availability, failed CDN verification, and before GitHub Release publication.
- Tabletop a compromised bootstrap token, compromised trusted-publisher workflow, departed npm owner, and mistaken `latest` movement.
- Validate all read-only commands against the live packages and archive the resulting evidence.
- File every ambiguity or undocumented privilege encountered during rehearsal as a blocking correction.

## Risks

- A runbook can drift from workflow names and registry controls. Link commands to stable script interfaces and contract-test referenced workflow/environment names.
- Rollback language may imply published content disappears. State clearly that deprecation and dist-tags guide future resolution but do not revoke downloaded copies.
- One person controlling tag, approval, and verification weakens the protected path. Require at least two maintainers across mutation and verification.

## Exit criteria

A maintainer other than the automation author can release a beta and recover every rehearsed partial state using the runbook; package ownership and protected environments have current named owners; bad-version, channel rollback, maintainer departure, and compromise procedures are verified without relying on unpublish or an undocumented credential.
