# ADR 0007: Model choices for the spike and v1

- **Status:** **Proposed** (research only; no experiment has run; nothing is installed or in git)
- **Date:** 2026-10-17
- **Deciders:** pending (owner, CoE, counsel for licensing)

Source: spike research plan (kept off git on the Familiar operator's box). Evidence tags: **[V]** read from the project's own LICENSE/README on 2026-10-17; **[U]** unverified, must be checked before any use.

## Context
v1 needs voice conversion, face replacement/reenactment and lip-sync, on a private GPU, with licenses compatible with a private commercial service, using the owner's own voice and face only for the spike (no kids, no other people).

## Decision (proposed stack)
| Stage | Primary | Fallback / compare | Notes |
| --- | --- | --- | --- |
| Voice conversion | **Seed-VC** (GPL-3.0 code **[V]**; **weights license unverified [U]**) | **OpenVoice V2** (MIT code and weights **[V]**) | Seed-VC keeps source timing/prosody (VC not TTS), fits dubbing. GPL-3 is copyleft if distributed; acceptable for a private service. |
| Face | **LivePortrait** reenactment (MIT code **[V]**) | FaceFusion for offline comparison only | **Unverified [U]:** whether LivePortrait's default pipeline depends on InsightFace detector models (non-commercial); verify or swap detector. |
| Lip-sync | **MuseTalk** (MIT code; model usable commercially per README **[V]**; dependencies carry own licenses) | **LatentSync** (Apache-2.0 **[V]**) | MuseTalk works on a 256px face region, needs upscale/blend. |
| ASR / glue | Whisper, ffmpeg | | Whisper/tool licenses to confirm **[U]**. |

### Excluded or blocked
- **InsightFace / inswapper_128 / buffalo_l:** models are non-commercial research only; separate license from the vendor needed **[V]**. **Production licensing blocker** for any swap-model path. FaceFusion defaults to these, so spike-only.
- **SimSwap:** CC-BY-NC 4.0 **[V]**, excluded.
- **F5-TTS:** code MIT but pretrained weights CC-BY-NC **[V]**, excluded.
- CosyVoice (Apache-2.0 code **[V]**, model license **[U]**): optional TTS path, not primary.
- RVC: not verified **[U]**; per-speaker training; skip unless Seed-VC fails.

### Unverified items (must be closed before Accepted)
Seed-VC weights license; LivePortrait/InsightFace dependency; RVC and CosyVoice weights licenses; VRAM figures; cost estimate (~$0.03 to $0.22 per video minute is an assumption of 5 to 15 GPU-min per video-min, not a benchmark); every dependency model (whisper, dwpose, S3FD, VAE) license; metric tool licenses; the proposed pass/fail thresholds (e.g. speaker cosine ≥ 0.75, WER delta ≤ 5 pts, face ID ≥ 0.60, LSE-C ≥ 6.0) are proposals, not literature standards.

## Consequences
- Face swap licensing is the main blocker; alternatives: reenactment with a non-InsightFace detector, a commercial InsightFace license, or a model trained on consented data.
- Spike procedure is own-media-only, outputs outside git ([development.md](../development.md#spike-procedure-own-media-only)).
- GPU hosts for biometric data: dedicated/secure only, not peer-hosted; no third-party inference APIs.
- Convert backend must be swappable (interface proposed in PR #23).

## Alternatives considered
TTS-based dubbing (loses prosody); single end-to-end commercial API (violates private-model and no-third-party rules).
