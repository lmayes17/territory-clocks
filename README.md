# Territory Clocks (Enabled+)

Tampermonkey script for Enabled+. Two pieces:

1. **Homeowner time badge** on every lead, right under the city/state/zip. Shows the homeowner's local time, the time zone, and how far ahead or behind the rep they are. Turns red outside 9am to 9pm homeowner time.
2. **Territory clock bar**, floating on every Enabled+ page. Eastern, Central, Pacific. The zone that matches the lead on screen lights up green. Drag to move. Double-click the clock icon to collapse.

Nothing leaves the browser. The script reads the zip that's already on the page and does the math locally.

## Install (reps)

1. Tampermonkey must already be installed in Chrome.
2. Open this link: `https://raw.githubusercontent.com/lmayes17/territory-clocks/main/territory-clocks.user.js`
3. Tampermonkey opens an install screen. Click **Install**.
4. Refresh Enabled+.

Updates arrive on their own. Tampermonkey checks the link daily.

## Publish (one time)

1. Create a public repo named `territory-clocks`.
2. Update URLs point to lmayes17. If the repo moves, update `@updateURL` and `@downloadURL` in the script header and the install link above.
3. Push. Send reps the install link above.

The repo needs to be public, or reps need read access, for the raw link to work.

## Ship a change

1. Edit the script.
2. Bump `@version` (2.0.0 to 2.0.1, etc.). **Tampermonkey only updates when the version goes up.**
3. Commit and push.

## Config

At the top of the script:

- `TERRITORIES`: the bar's zones. Rename or remove as needed.
- `CALL_WINDOW`: the hours that count as OK to call, in homeowner time.

## Build notes

- **Where it hooks in.** The address lives in `#leadinformation .city-state-zip` (for example, `Indianapolis, IN 46226`). The badge inserts right after it. The lead panel loads after the page, so a MutationObserver re-renders when it changes. The observer ignores the script's own elements so it doesn't loop.
- **Why zip, not phone.** Cell area codes follow the person, not the house. The test lead had a Maryland 410 number on an Indianapolis address.
- **How the zone is picked.** State sets the default zone. For states split by a time zone line (IN, TN, KY, FL, TX, ID, NE, SD, ND), the first 3 digits of the zip override it. Some zip areas straddle a county line. Those show a yellow **verify** tag so the rep confirms with the homeowner.
- **Known gaps.** The zip-area map is close, not perfect, at the edges. Starke County, IN and a few Michigan Upper Peninsula and western Kansas counties are examples. If reps flag a wrong time, add the zip area to `ZIP3_TZ` or `ZIP3_MIXED`.
- **DST.** Handled by the browser's time zone database. Arizona stays on MST year-round. Indiana follows Eastern with DST.
- **The rep's own zone** comes from the PC clock. Remote staff in Indiana or Tennessee get the correct "hrs behind/ahead" automatically.
- **Frames.** It skips iframes (Enabled+ has two), so the bar shows up only once.

## IT deployment (tm.json)

- `tm.json` is the setup file IT's Chrome policy points at: `https://raw.githubusercontent.com/lmayes17/territory-clocks/main/tm.json`
- Format: Tampermonkey JSON export (`version`, `scripts[]` with `name`, `enabled`, `position`, `uuid`, base64 `source`). Built from the dashboard's per-script zip export, because the Utilities export has no way to pick scripts. No `settings` block, so reps keep their own Tampermonkey settings. No script storage.
- The `uuid` matches the installed script, so re-imports update the same script instead of adding a copy.
- The script inside `tm.json` is a snapshot. Installed copies should self-update from `@updateURL`. The pilot needs to confirm that, and that a restart doesn't roll a script back to the tm.json copy. If either fails, rebuild `tm.json` on every release and IT updates the hash.
- Tampermonkey stable ID: `dhdgffkkebhmkfjojejmpbldmpobfkfo`. The docs' example ID is the Beta build.
