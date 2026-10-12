# GEOBATTLE interface design

## Surface

This is an **Operate** surface: players arrange a battle, then observe an autonomous simulation. The battlefield is the working content, not a decorative background. Desktop prioritizes a wide canvas beside a compact unit catalog. The unit detail and advanced editing panel is a contextual overlay, hidden until requested. Phone layouts replace the catalog with a drawer and keep three explicit touch modes visible.

## Visual world

Use the established geometric language and team palette, with a calmer, more legible neutral interface around it. The charcoal field belongs to the 2D battle stage; coral and sky blue identify teams only where team identity is meaningful. Lime marks the primary action and valid selection. Catalog and selected-unit icons use neutral ink so choosing a type does not imply a team before it is placed.

The interface should feel like a precise tabletop instrument: clear alignment, compact structural rules, familiar controls, and space reserved for the live battle. Keep surfaces opaque and restrained, with fine borders and small corners. The visual signatures are the geometric unit silhouettes, the red/blue halves of the field, a clearly readable center safety band, and the large active battlefield.

## Palette and typography

- Field and application ground: `#10191d` and `#111c20`.
- Panels: `#172328`; raised controls: `#223238`; separators: `#314249`.
- Main ink: `#f0f2ed`; supporting ink: `#a6b5b6`.
- Red team: `#ff705d`; blue team: `#59b7fa`; primary action/selection: `#d3ee89`.
- Use the installed system sans stack already present in the app: Inter, Segoe UI, Microsoft YaHei, PingFang SC, sans-serif.
- Body and controls are 13–15px on desktop. Dense secondary labels stay at or above 11px; mobile controls remain readable and at least 44px tall.
- Tabular numerals serve counts, simulation time, and unit statistics. Monospace is reserved for measurements and shortcuts.

## Composition and behavior

- Keep the header short: identity, red/blue counts, settings/help, and one primary battle action.
- Give the catalog one neutral entry per unit type, searchable by name, role, or skill. Do not add team switches or duplicate red/blue rows.
- Keep the catalog compact and let the canvas take the remaining viewport. Contextual unit detail floats over the canvas only when opened.
- The default controls are Deploy, Erase, and Pan. Desktop also supports left-click/drag to deploy and right-click to erase. Mobile has explicit mode controls; two fingers are reserved for camera movement and zoom.
- Advanced formation editing, seed, copy, rotation, mirror, and clear operations live under a collapsed disclosure.
- During combat, preserve visible team counts, elapsed time, speed, pause/resume, selection details, and a layered result report.
- Motion is brief and functional: selection, panel open/close, and action feedback. Respect reduced motion.

## Exclusions

Do not copy generated reference details that conflict with the product: no trees, rocks, ground texture, terrain, grid walls, shadows suggesting 3D, altered unit silhouettes, or new game rules. Do not use glass blur, heavy glow, gradients, giant card grids, or tiny label text. AI generated images are design references only; runtime units and effects remain code-drawn and offline.
