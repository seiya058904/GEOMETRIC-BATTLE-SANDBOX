# Performance follow-up evidence

Baseline product is exact9f964f3; original550ms and sub30FPS samples remain unchanged in evidence/v2. Preserved prior ZIP/manifest copies have9f964f3 suffix and remain local/ignored.

- before-software/native-1..3: isolated cold-start12s target scenes, not the seven-scene baseline.
- ../performance-followup-before-software/native-full-run-1..3: original seven-scene order, cold browser for each repetition, same flags/viewport/DPR/armies/speed; paired PNG pixel probes.
- profile-software/native: instrumented single target scene, raw GPUtrace and CPUprofile; distinct from acceptance repeats.
- probe-*: diagnostic render overrides explicitly labelled in JSON, never accepted as final product performance.
- baseline-source.zip: minimal exact HEAD source/index/server snapshot; expanded working copy excluded.

No concurrent browser tests, builds or compression during measurement. Current isolated/full baselines do not reproduce the historical550ms failure; this is not a code fix claim. Reports will retain this limitation and every failed probe.

Final product source changes onlyrenderer.js. comparison.json indexes complete84 A/B samples (parent-directory performance-followup-* names). gates.json covers final source/dist/offline/visual and source/dist8-case raster comparisons. longrun-software300.json is actual target300v300, not old100v100.

Trace originals are retained locally but ignored; delivered *.json.gz files round-trip exactly to the originals, with SHA in trace-manifest.json. This avoids committing the123/219MB raw Git blobs. The old550ms sample is NOT confirmed fixed, despite no recurrence in current baseline/after/longrun. See docs/V2-PERFORMANCE-FOLLOWUP.md.
