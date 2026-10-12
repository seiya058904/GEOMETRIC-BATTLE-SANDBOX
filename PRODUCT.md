# GEOBATTLE product truth

GEOBATTLE is an offline, two-dimensional geometry battle sandbox. Players build two armies on one open field, start an automatic simulation, and watch the result. Its defining interaction is direct: choose a unit, then place it on the red or blue half of the battlefield; the position determines its team.

The main audience is a player experimenting with formations in a Windows desktop browser. Android browsers are the second target. A first-time player should be able to add the same unit to both sides, start the battle, and understand the result without reading a manual.

## Product facts

- The catalog contains 36 fixed unit types. A type has one identity, appearance, name, and behavior; team color belongs to the battlefield placement and simulation.
- The world is a flat, open 2D field. There are no terrain obstacles, economy, unlocks, online service, or manual combat commands.
- Initial deployment is team-bound by location: the left half creates red units, the right half creates blue units, and the middle safety band is unavailable. The battlefield remains open during combat, so units can cross the center while fighting.
- Combat runs autonomously with deterministic seeded simulation behavior. Friendly fire is disabled. Initial units and summons share the 1,200 active-unit protection limit.
- A player can make a formation, edit it, save or export it, start combat, pause or change speed, inspect units, review the report, replay, or return to the original setup.
- The application must work without external assets or network services, including as a single offline HTML file.

## Product priorities

Make the battlefield the primary work surface. Let the player select one neutral unit identity, add it to either side by position, correct mistakes directly, and begin combat with little setup. Keep detailed formation editing available as a deliberate advanced step. On phones, make deployment, erasing, and camera movement distinct, visible modes with touch sized controls.

Preserve simulation rules, unit identities, saves, deterministic replay, and readable state feedback. UI decoration must never imply a gameplay rule the simulation does not enforce.
