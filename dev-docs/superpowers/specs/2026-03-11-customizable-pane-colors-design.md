# Customizable pane colors with activity fade

## Summary

Evolve the pane activity strip from a fixed green/amber/gray/red indicator into a user-customizable color system. Each pane gets a base color from an 8-color preset palette. Activity state fades the color through 4 brightness steps, ending at neutral gray after 60 seconds of inactivity. Error exits always override to red.

## Color palette

8 preset colors, each with a display name:

| Name | Hex | HSL (approximate) |
|------|-----|-------------------|
| Emerald | #3fb950 | 130, 50%, 48% |
| Cobalt | #58a6ff | 215, 100%, 67% |
| Crimson | #f85149 | 2, 93%, 63% |
| Violet | #bc8cff | 265, 100%, 77% |
| Cyan | #39d2c0 | 170, 58%, 52% |
| Amber | #d29922 | 40, 73%, 48% |
| Rose | #f778ba | 330, 89%, 72% |
| Acid | #ccff00 | 72, 100%, 50% |

Default for all new panes: **Acid (#ccff00)**.

## Activity fade steps

4 discrete brightness steps based on time since last terminal output:

| State | Timing | Color derivation |
|-------|--------|-----------------|
| Active | 0 - 15s | Full base color (100% saturation, original lightness) |
| Fading | 15 - 30s | 75% saturation, lightness reduced by 15 percentage points |
| Dim | 30 - 60s | 50% saturation, lightness reduced by 30 percentage points |
| Inactive | 60s+ | Fixed gray #484f58 (same for all colors) |

Special states (override fade logic):

| State | Trigger | Color |
|-------|---------|-------|
| Done | Process exited with code 0 | Gray #484f58 |
| Error | Process exited with non-zero code | Red #f85149 (always, regardless of pane color) |

### Color derivation algorithm

Given a base color in HSL:
1. **Active**: Use base HSL as-is
2. **Fading**: Set saturation to `baseSat * 0.75`, set lightness to `baseLit - 15`
3. **Dim**: Set saturation to `baseSat * 0.50`, set lightness to `baseLit - 30`
4. **Inactive/Done**: Return `#484f58`
5. **Error**: Return `#f85149`

Clamp lightness to minimum 10% to avoid pure black.

Implementation note: since the palette is fixed at 8 colors, store pre-computed HSL values for each preset rather than parsing hex at runtime. The `paneColors.ts` utility owns the palette definitions and fade derivation.

### Transition

Use `transition-colors duration-200` on the strip div (same as current implementation). State changes happen on the 1-second poll tick, so the 200ms CSS transition smooths between steps.

## ActivityState type change

Replace the current 4-state type:
```typescript
// Before
export type ActivityState = 'active' | 'silent' | 'done' | 'error';

// After
export type ActivityState = 'active' | 'fading' | 'dim' | 'inactive' | 'done' | 'error';
```

Update `deriveState` thresholds:
- `< 15000ms` → `'active'`
- `< 30000ms` → `'fading'`
- `< 60000ms` → `'dim'`
- `>= 60000ms` → `'inactive'`
- `exited && exitCode === 0` → `'done'`
- `exited && exitCode !== 0` → `'error'`

Exit states still take priority over time-based states.

## Picker UI

### Toolbar swatch

A 12x12px colored square in the PaneToolbar, showing the focused pane's current color. Positioned left-aligned with the other toolbar actions — after Zoom, before the `ml-auto` pane counter.

### Popover

Clicking the toolbar swatch opens a small popover with 8 color swatches (16x16px each, in a single row). The currently selected color has an acid (#ccff00) border. Clicking a swatch changes the focused pane's color immediately. Clicking outside the popover closes it.

Popover CSS:
- Background: #1a1a1a
- Border: 1px solid #444
- Border-radius: 4px
- Padding: 6px 8px
- Shadow: 0 4px 12px rgba(0,0,0,0.5)
- Gap between swatches: 5px

### Swatch styling
- 16x16px, border-radius 2px
- Hover: 1px white border
- Selected: 1px acid (#ccff00) border + glow

## Persistence

Pane colors are stored in localStorage under the key `audiobash:pane-colors` as a JSON-serialized object mapping terminal IDs to color names:

```json
{
  "tab-1": "acid",
  "tab-2": "cobalt",
  "tab-3": "crimson"
}
```

On app start, restore saved colors. If a terminal ID has no saved color, use the default (Acid). When a user changes a pane's color, save immediately.

## Data flow

```
User clicks toolbar swatch → Popover opens
User clicks color swatch → setPaneColor(terminalId, colorName) → localStorage save
                                                                → PaneNode re-renders

usePaneActivity hook → activityState per terminal (active/fading/dim/inactive/done/error)
paneColors state → base color per terminal (acid/cobalt/crimson/etc.)

PaneNode receives both → derives strip CSS color:
  getStripColor(baseColor, activityState) → hex string
```

## Files to change

| File | Action | What changes |
|------|--------|-------------|
| `src/types.ts` | Modify | Update `ActivityState` to 6 states |
| `src/hooks/usePaneActivity.ts` | Modify | Update `deriveState` thresholds for 6 states |
| `src/utils/paneColors.ts` | Create | Color palette definitions, HSL fade derivation, localStorage persistence |
| `src/components/PaneToolbar.tsx` | Modify | Add color swatch + popover |
| `src/components/PaneNode.tsx` | Modify | Use `getStripColor(baseColor, activityState)` instead of fixed color map |
| `src/components/PaneManager.tsx` | Modify | Manage pane colors state, pass to PaneNode and PaneToolbar |
| `tests/unit/usePaneActivity.test.ts` | Modify | Update tests for 6 activity states |
| `tests/unit/paneColors.test.ts` | Create | Tests for color derivation and palette |

## Out of scope

- Custom hex colors beyond the 8 presets
- Per-pane fade timing customization
- Color blind accessibility modes (future consideration)
- Keyboard shortcut for color cycling
