# Dev Plan Generator

This repository is the source-owned standalone Dev Plan Generator. The maintained and deployed
source is the root `index.html`, together with the local `assets/` directory. Open `index.html`
directly for the no-build local experience, or serve this directory with any static HTTP server.

There is no supported source file at `../../proto-devplan.html`; the platform-side copy is
historical evidence only and is not an implementation dependency. Do not regenerate this file
from the platform checkout.

## Source provenance

- Baseline: `deb0612d270678c3a31f391f03dd45ac813403b0f`
- Packet: `DEVPLAN-FB1` (print and setup feedback, 2026-09-16)
- Canonical source/deploy file: repository-root `index.html`
- GitHub Pages: `main` branch, repository root

The app uses synthetic/local fixtures only and has no network or persistence requirement.
