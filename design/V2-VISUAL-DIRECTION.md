# V2 visual direction

## Direction

**A geometric tabletop instrument, with the battlefield as its main readout.** Keep the established flat, open-field identity and make the canvas dominate the workspace. A compact neutral catalog teaches unit identity; red and blue are reserved for the actual opposing armies and live side counts. Controls follow familiar game conventions and stay close to the action they affect.

The first screen should be remembered as two clear armies facing across an open field, a single shared unit library, and one obvious way to begin. Detail and advanced controls move to a contextual overlay so players can work on the field without leaving the main scene.

## Reference review

The three generated images in this folder are concept references, not runtime assets:

- [`v2-composition-reference.png`](v2-composition-reference.png) suggests a compact header, prominent red/blue counts, and a large central stage. Its opaque ground textures, trees, rocks, heavy shadows, and saturated deployment floor imply terrain and are excluded.
- [`v2-catalog-reference.png`](v2-catalog-reference.png) suggests a single neutral unit library and three simple mobile actions for Deploy, Erase, and Pan. Its promotional framing, duplicate desktop/mobile presentations, invented tagline, and rendered pseudo-unit artwork are excluded. The product keeps its actual code-drawn silhouettes and real Chinese roster.
- [`v2-battle-reference.png`](v2-battle-reference.png) suggests that projectile direction, impact, and area effects can make a battle readable. Its perspective, terrain, oversized cinematic glow, and new-looking green/purple teams are excluded. Combat remains a flat 2D simulation using existing unit and effect colors.

The accepted design decisions come from the requested player workflow and existing in-game geometry. The references helped compare hierarchy and control grouping; they do not replace the visual rules or mechanics of GEOBATTLE.

## Interface rules

- Use the deep charcoal canvas and panel surfaces as a quiet frame around live geometry.
- Reserve coral and sky blue for true team identity, and keep the catalog icon treatment neutral.
- Use lime for the primary action, valid selection, and restrained focus emphasis.
- Keep the canvas visually open; no scenery, fake ground, or UI wallpaper.
- Use opaque panels with fine separators and small corners. Avoid blur and decorative gradients.
- Put a short unit description and readable key stats in the contextual overlay. Put seed, spacing, copying, rotation, mirroring, clearing, and selection tools behind an explicit disclosure.
- Keep the battle report ordered from outcome, to team totals, to standout contributions, to the per-unit ledger.

## Tokens

| Role | Value |
| --- | --- |
| App ground | `#10191d` |
| Battlefield | `#111c20` |
| Panel | `#172328` |
| Raised surface | `#223238` |
| Separator | `#314249` |
| Main ink | `#f0f2ed` |
| Supporting ink | `#a6b5b6` |
| Red | `#ff705d` |
| Blue | `#59b7fa` |
| Action | `#d3ee89` |

Typography stays in the existing system sans stack. Desktop body text is 13–15px; supporting text is at least 11px. Touch actions are at least 44px tall. Counts and measurements use tabular numerals. Reduced-motion preferences suppress transition motion.

## Runtime boundary

The references do not enter the offline game bundle. Unit icons remain generated from the real roster; team colors appear on actual battlefield placement and battle entities. Any new illustration, terrain, unit, or behavior would need a separate product decision and is outside this direction.
