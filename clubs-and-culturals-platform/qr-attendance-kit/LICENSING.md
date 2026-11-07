# Licensing — read before reusing either source project

The two repositories you pointed at carry **different and incompatible licences**. This determines what you may copy, and it constrains a decision still open in your Decision Log (D-05 / PO-03: MIT throughout vs AGPL backend).

## What each repository actually is

| Repository | Licence | Author |
|---|---|---|
| `ChargingTrex/qr-certificate-verification-system` | **MIT** | © 2026 Arun Balaji S — built for SAIU FOSS 2026 |
| `ChargingTrex/Google-sheet-qr-attendance-` | **GPL-3.0** | ChargingTrex |

## The contradiction in the attendance repo

Its README says:

> This project is open-source. Feel free to modify it for your own events!

But the repository's actual `LICENSE` file is **GPL-3.0**, and GitHub displays it as such.

**The LICENSE file governs, not the README.** A casual sentence in a readme is not a licence grant. Anyone relying on "feel free to modify" and then shipping a closed or MIT-licensed derivative would be in breach.

Worth raising with the author — it is very likely they intended something permissive and picked GPL-3.0 from a dropdown without realising the consequence. A one-line clarification from them would resolve it.

## What this means for you

### The certificate repo (MIT) — safe to build on

MIT permits use, modification and redistribution, including in a closed or differently-licensed product. The only obligation is to preserve the copyright notice and licence text.

**Action:** keep `NOTICE.md` (in this kit) crediting Arun Balaji S, and retain the MIT text. That is the whole requirement.

### The attendance repo (GPL-3.0) — do not copy code from it

GPL-3.0 is strong copyleft. Deriving from it obliges the **entire derivative work** to be GPL-3.0.

Concretely:

- If you copy its `Code.gs` or `Index.html` into your module, your Clubs & Events backend becomes GPL-3.0.
- **MIT-throughout (D-05 option A) would no longer be available to you.**
- AGPL-3.0 backend (D-05 option B) remains available — AGPL-3.0 and GPL-3.0 are compatible in that direction.

**What is always safe:** reading it, understanding how it works, and reimplementing the same *ideas*. Ideas, architectures and APIs are not copyrightable — only the specific expression is. That is what this kit does.

## What this kit did

| Source | Treatment | Why |
|---|---|---|
| Certificate repo (MIT) | **Derived from.** The HMAC-SHA256 signed-token design is carried forward and improved. Credited in `NOTICE.md`. | MIT allows it; the design is sound and worth keeping |
| Attendance repo (GPL-3.0) | **Reference only.** Read for its approach; every line here written from your PRD specification instead. | Avoids imposing GPL-3.0 on your module before you have chosen a licence |

This keeps **both** of your licence options open. If you later decide on AGPL, you could then legitimately pull code from the GPL repo as well.

## Recommendation

1. **Decide D-05 / PO-03 before writing more code.** It is cheap now and expensive after a codebase exists.
2. **Ask ChargingTrex to clarify the licence.** If they intended MIT, a change would remove the constraint entirely — and they are, from the SAIU FOSS connection, likely reachable.
3. **Keep `NOTICE.md` accurate.** Attribution costs nothing and is the entire price of the MIT code you are using.

## NOTICE.md content

```
This project includes work derived from:

  qr-certificate-verification-system
  Copyright (c) 2026 Arun Balaji S
  Licensed under the MIT License
  https://github.com/ChargingTrex/qr-certificate-verification-system

  The HMAC-SHA256 signed certificate token design is derived from this
  project. Reimplemented for Django with versioned signing keys, purpose
  binding, expiry, and constant-time signature comparison.

Architectural reference (no code reused):

  Google-sheet-qr-attendance-  (GPL-3.0)
  https://github.com/ChargingTrex/Google-sheet-qr-attendance-

  Studied for its QR attendance approach. No source from this project is
  included; the scan resolution here is written from our own specification.
```
