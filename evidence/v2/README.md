# V2 evidence index

Do not treat historical or failed runs as final acceptance. All evidence is local; no external publication.

| Location | Purpose |
|---|---|
|baseline/|Original924150f syntax/195Node/source60/dist7/offline3 and six simulated viewports|
|baseline-source.zip|Exact git-archive baseline; unpacked working copy is excluded from delivery|
|first/, second/, third/, fix/, integration-node-*.log|Implementation-stage attempts and failures retained; superseded by final gates|
|pre-final-fix/|Full-browser failure before queued dialog-close fix and a numeric skipped-count report error|
|final-source/|Final full source browser:73pass/0fail/1skip,37screenshots|
|final-dist/|Same final build full browser:73pass/0fail/1skip,37screenshots and final offline3|
|final-visual/|Final production sixviewport, all36 natural mechanisms/crossing and1200 trusted-input samples|
|visual/, visual-final/|Earlier visual attempts; visual-final includes retained310.4ms input-to-RAF outlier|
|headed/|Headed real-tab attempt: page remained visible; actual hide lifecycle skipped|
|visual-review-final.md|Independent review only of HUD/zone-title overlap fix, four initial captures|
|android-attempt.json|Connected Android14 emulator inventory, Maestro timeout and policy-blocked Chrome launch; no native browser acceptance|
|gates-final.json, *-final.log, build-final.json|Final commands/exits/counts plus four artifact hashes and aggregate source identity|
|performance-{before,after}-run-{1,2,3}.json|Seven-scene×three-repeat SwiftShader A/B; paired PNGs include visible moving team pixels|
|performance-{before,after}-native-run-{1,2,3}.json|Same complete A/B using CDP-confirmed AMD/D3D11; separate backend|
|performance-*-summary.json, performance-*comparison.json|Three-repeat means/ranges and full before/after comparison|
|performance-control-*.json/PNG, performance-trace-*|Single-variable probes and32MB rawtrace, including rejected blank desync canvas|
|performance-alpha-*-run-*.json/PNG|SameV2UI alpha true/false three-repeat controlled experiment|
|performance-native-cpu-*-run-*.json/PNG|SameV2UI/600v600 native CPU-hint three-repeat control; no meaningful gain|
|performance-native-*probe*.json/PNG|Actual backend verification and failed startup probe retained, separate from acceptance|
|performance-tick-{before,after}.json/PNG|Seven-scene each-side natural exacttick instrumentation, separate from21-sample matrices|
|performance-longrun.json/PNG|181.408wall/180sim,9completed/8replays, full-result equality, CPU/RAM/heap/pools|
|performance-production-smoke.json/log|Finaldist100v100 native12-second smoke, separate from complete A/B|
|hardware.json|Windows read-only device inventory; not proof of browser backend by itself|

All performance matrices keep natural simulation and actual units. Failed realtime/FPS targets are disclosed in docs/V2-PERFORMANCE-INVESTIGATION.md and V2-QA-REPORT.md. No image proves physical4K or Android device quality. File SHA-256 and exact local commit are in DELIVERY-MANIFEST.json after packaging.

Current follow-up: perf-followup/README.md, comparison.json, gates.json and docs/V2-PERFORMANCE-FOLLOWUP.md. The original entries above remain9f964f3 history; build-final.json now describes the current cropped-sprite source, with prior build copied into perf-followup/build-before.json.
