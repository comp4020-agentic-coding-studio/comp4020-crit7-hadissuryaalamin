---
name: Degree Plan Checker
description: A degree laid out as a planting plan — season columns, colour-coded beds, labelled stakes, stamped marks.
colors:
  ground: "#eef1ea"
  grid-line: "rgba(30, 42, 34, 0.07)"
  surface: "#fafaf4"
  surface-sunk: "#e6e9e0"
  field: "#ffffff"
  ink: "#1e2a22"
  ink-soft: "#4b5a4c"
  line: "#c7cdbd"
  action: "#0f5e63"
  action-ink: "#ffffff"
  action-hover: "#0c4a4e"
  mark-zero: "#a3271c"
  mark-unknown: "#52605a"
  mark-warn-ink: "#7a4c0a"
  mark-warn-bg: "#f3dfab"
  mark-counts: "#2f6a4a"
  alert-error-bg: "#f5e2dd"
  alert-error-ink: "#6c2015"
  bed-moss: "#4F6B3A"
  bed-marigold: "#D98A22"
  bed-brick: "#6E4A36"
  bed-iris: "#4C5A9E"
  bed-plum: "#7A4569"
  bed-rose: "#B84A73"
  bed-slate: "#45606B"
  bed-sky: "#7FB3D9"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "clamp(1.7rem, 1.35rem + 1.3vw, 2.35rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "0.01em"
  body:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 700
    lineHeight: 1.3
  season-head:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 700
    letterSpacing: "0.03em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "0.92em"
rounded:
  mark: "2px"
  sm: "3px"
  tag: "2px 8px 8px 2px"
spacing:
  xs: "0.35rem"
  sm: "0.75rem"
  md: "1.25rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.6rem 1.15rem"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.6rem 1.15rem"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunk}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    padding: "0.4rem 0.75rem"
  input-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 0.6rem"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "1.25rem"
  stake:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0.9rem 1rem"
  stake-band:
    typography: "{typography.label}"
    padding: "0.35rem 0.95rem"
  season-head:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.season-head}"
    padding: "0.5rem 0.7rem"
  season-head-current:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
  mark-counts:
    textColor: "{colors.mark-counts}"
    typography: "{typography.label}"
    rounded: "{rounded.mark}"
    padding: "0.22rem 0.55rem"
  mark-zero-credit:
    textColor: "{colors.mark-zero}"
    typography: "{typography.label}"
    rounded: "{rounded.mark}"
    padding: "0.24rem 0.6rem"
  mark-unknown:
    textColor: "{colors.mark-unknown}"
    typography: "{typography.label}"
    rounded: "{rounded.mark}"
    padding: "0.22rem 0.55rem"
  mark-warn:
    backgroundColor: "{colors.mark-warn-bg}"
    textColor: "{colors.mark-warn-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "0.22rem 0.55rem"
  nav:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    padding: "0.9rem 1.25rem"
---

# Design System: Degree Plan Checker

## Overview

**Creative North Star: "The Planting Plan"**

The degree is a garden drawn on a drafting sheet. Semesters are season columns, requirement groups are colour-coded beds, and every course is a labelled stake planted in one of them. A student reads the plan the way a gardener reads a bed layout: which beds are full, which stakes sit in the wrong place, what still needs planting. The system refuses the analytics dashboard: no stat tiles, no progress rings, no bars. Progress is always a count in words ("6/12 units").

The ground is a pale sage drafting sheet with a faint 8px grid; everything sits flat on it, separated by hairline borders and tonal steps, never shadows. Colour carries two jobs and keeps them apart: eight flat bed hues say *which group*, and a small set of marks (red stamp, grey stamp, amber tag, green outline, pin) say *what happened*. Every mark carries its own words; colour is always the second cue. One deep teal is reserved for primary actions and belongs to no bed.

One workhorse sans, Atkinson Hyperlegible Next, does everything, chosen because many readers use English as a second language. Density is moderate: readable line lengths, generous card padding, columns side by side at laptop width and stacked on a phone with no horizontal scroll.

**Key Characteristics:**
- Drafting-sheet ground with an 8px hairline grid; flat surfaces, hairline borders, no shadows.
- Eight fixed bed hues, assigned by requirement-group position, identical everywhere a bed appears.
- Status as a mark with text: stamps for verdicts, a tag for a timing problem, an outline for "Counts".
- One reserved action teal, used by no bed and no mark.
- A single legible sans for every role; no display face.

## Colors

A muted sage-and-ink paper world carrying eight saturated but earthy bed hues and a separate, text-bound mark vocabulary.

### Primary
- **Reserved Deep Teal** (action): primary buttons only (Start planning, Add, Done), links, text selection and every focus ring. Never used as a bed, a mark or a decorative fill. **Deeper Teal** (action-hover) is its hover state.

### Secondary (the beds)
Flat, unmodulated fields from a fixed set of eight, in assignment order. The first group in the catalogue's list gets moss, the second marigold, and so on; groups past the eighth wrap around. Project-pathway options share one hue per option, and a specialisation's sub-groups share one hue.
- **Moss** (bed-moss), **Brick** (bed-brick), **Iris** (bed-iris), **Plum** (bed-plum), **Rose** (bed-rose), **Slate** (bed-slate): carry white band text.
- **Marigold** (bed-marigold), **Sky** (bed-sky): carry ink band text. Text colour is chosen per hue for 4.5:1 contrast.

A bed hue appears in exactly three places: the legend swatch, the stake band, and the bed hairline on a completed-season stake.

### Tertiary (the marks)
- **Stamp Red** (mark-zero): the Zero credit stamp, error alert border.
- **Shrug Grey** (mark-unknown): the Can't check stamp.
- **Amber Ink on Amber Tag** (mark-warn-ink on mark-warn-bg): the Timing warning tag, the warn alert and the "unverified" tag.
- **Counts Green** (mark-counts): the Counts outline.
- **Error Wash / Error Ink** (alert-error-bg / alert-error-ink): the error alert's fill and text.

### Neutral
- **Drafting Sage** (ground): page ground and completed-season stakes; the grid line (grid-line) is ink at 7%.
- **Label Paper** (surface): stakes, cards, secondary buttons, add-a-course slot.
- **Sunk Sage** (surface-sunk): season heads, inline code, disabled and hover fills.
- **Field White** (field): select and input backgrounds only.
- **Garden Ink** (ink): text, the site nav bar, the current season head, the total dot.
- **Soft Ink** (ink-soft): secondary text, counts, hints, footer.
- **Hairline** (line): every border and divider.

### Named Rules
**The Reserved Teal Rule.** Teal means "do this". It is never a bed, never a mark, never a fill for state. The NOW pill on the dark current-season head is an outline in paper colour, not teal, for this reason.

**The Two Vocabularies Rule.** Bed hues say which group; mark colours say what happened. A bed hue never signals status and a mark colour never names a group. Brick is kept well clear of Stamp Red.

**The Words First Rule.** No colour stands alone. Every swatch has a name and a units count beside it, every mark has its label, and the unchosen pathway option says "not chosen" as well as going hollow.

## Typography

**Display Font:** Atkinson Hyperlegible Next (with Atkinson Hyperlegible, system-ui)
**Body Font:** Atkinson Hyperlegible Next (same stack)
**Label/Mono Font:** ui-monospace stack, only for inline course codes in prose.

**Character:** One humanist grotesk tuned for letter distinction (slashed zeros, open forms) carries headings, body, labels and marks. Hierarchy comes from weight (400 / 500 / 700) and size, not from a second face.

### Hierarchy
- **Display** (700, clamp 1.7–2.35rem, 1.15): the one page title per page (program name, product name). A 400-weight soft-ink subline may follow on its own line ("started 2026 S1").
- **Headline** (700, 1.05rem, 1.15): section headings such as "Start a plan".
- **Title** (700, 1rem): course codes on stakes.
- **Body** (400, 16px, 1.55): prose and course titles, capped at 46rem (the pitch at 38rem).
- **Label** (700, 0.8rem, 1.3): stake bands, marks, buttons (0.9rem), field labels (0.9rem). Sentence case.
- **Season head** (700, 0.85rem, +0.03em, uppercase): semester column heads only, since they are the column headers of the plan's grid.

### Named Rules
**The One Voice Rule.** Every role uses Atkinson Hyperlegible Next. Don't add a display face for flair.

**The Sentence Case Rule.** Bands, marks and buttons are sentence case. Uppercase is reserved for season heads and the NOW pill.

## Layout

A centred single column (max 46rem) for reading pages (home, readme, 404), and a wide 76rem container for the plan and catch-up pages. The plan page stacks: title and subline, bookmark note, an inline wrapping legend strip, alerts, then the season grid. From 860px up, seasons sit side by side as equal columns (one per semester); below that they stack. The home form grid goes two-up from 600px. Below 480px, main padding tightens to 1.25rem 1rem and stake units drop beside the code.

The legend is a wrapping inline strip that reads like a caption, not a boxed panel, and it is not sticky. The direction contract called it "pinned"; the build chose a flowing key, and the build wins.

Spacing rhythm: 0.35rem inside rows, 0.75rem between stakes, 1.25rem card padding and gutters, 1.5rem between seasons and before the grid, 2rem above section headings. The body grid is 8px.

## Elevation & Depth

Fully flat. There are no box-shadows anywhere. Depth comes from tone and line: paper surfaces on the sage ground, 1px hairline borders, a sunk tone for season heads, and full ink for the current season head and the nav. Past seasons recede by tone rather than opacity: stake fills drop to the ground colour, the bed band collapses to a 3px hairline in the bed's hue, and band text goes soft ink. Focus rings and live controls stay full-strength.

### Named Rules
**The Flat Sheet Rule.** Nothing lifts off the page. A surface is distinguished by fill and hairline, never by shadow.

**The No Fills Gradient Rule.** No gradient fills or colour ramps on any surface, band or swatch. The only gradient in the system is the drafting grid itself: two 1px hairline line-gradients tiled at 8px, which draw the ground's grid lines. That grid is part of the world, not an exception to remove.

## Shapes

Nearly square corners. Surfaces, buttons and fields use 3px (sm); marks, swatches and the NOW pill use 2px (mark). The timing tag alone takes an asymmetric tag silhouette (2px 8px 8px 2px), a luggage-tag shape that sets it apart from the stamps. The only circle is the legend's total dot. Stamps are the only rotated forms: the Zero credit stamp settles at -2.5deg with a double 2px rule, the Can't check stamp at +1.5deg with a dashed 2px rule. Borders are 1px for surfaces and 1.5px for buttons, alerts and outline marks. The add-a-course slot uses a dashed border because it is an empty place waiting for a stake.

## Components

### Buttons
Plain, weighty, drafting-table buttons.
- **Shape:** gently squared (3px), 1.5px border.
- **Primary:** Reserved Deep Teal fill and border, white 700 label, 0.6rem 1.15rem. Hover deepens to Deeper Teal.
- **Secondary:** paper fill, 1.5px ink border, ink label. Hover goes to Sunk Sage. Disabled: hairline border, soft-ink text, sunk fill, not-allowed cursor.
- **Ghost:** small (0.8rem, 500), hairline border, soft-ink text, 0.4rem 0.75rem. Used for per-stake actions (Remove, I have permission to enrol, Undo permission). Hover turns the border and text to ink.
- **Focus:** a 3px teal outline, 2px offset, on every focusable element.

### Cards / Containers
- **Corner Style:** 3px.
- **Background:** Label Paper on the sage ground.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px hairline.
- **Internal Padding:** 1.25rem. Used sparingly: the home start form, the example-warning strip, the catch-up "Done" row. The plan itself is not built from cards.

### Inputs / Fields
- **Style:** Field White fill, 1px hairline, 3px corners, 0.55rem 0.6rem, 0.95rem text. Labels above in 700 0.9rem; hints below in 0.8rem soft ink.
- **Focus:** 3px teal outline, 1px offset.
- **Error:** shown as an alert above the form (Error Wash fill, 1.5px Stamp Red border, Error Ink text), never by recolouring the field.

### Navigation
A full-width Garden Ink bar, 0.9rem 1.25rem padding, holding text-only links in paper colour (700, 0.95rem, no underline). Hover and focus underline them. It wraps on narrow screens. No logo, as a brand commitment.

### Stake (signature)
A course card. It has a solid band in its bed's hue across the top naming the bed in words (label type, sentence case), then the body (0.9rem 1rem): course code (title type) with units pushed right in tabular numerals, the course title, one status mark, dash-led reason lines in 0.82rem soft ink, then ghost actions. A stake with no group gets no band. A granted permission shows a small inline-SVG pin (0.9rem, ink) beside "Undo permission".

### Marks (signature)
Inline labels in 0.8rem 700 with the exact checker text. Colour is secondary.
- **Counts:** a transparent box with a 1.5px Counts Green outline, "Counts — {group}".
- **Zero credit:** a transparent red-ink rubber stamp with a 2px double rule, rotated -2.5deg. It lands once with a 260ms scale-and-rotate settle.
- **Can't check:** a grey stamp with a 2px dashed rule, rotated +1.5deg, with its own settle keyframe. An honest shrug, not an alarm.
- **Timing warning:** an amber tag (not a stamp) with the tag silhouette, "Timing warning — {group}".
- **Unverified:** a tiny amber-ink outline tag beside the code.
- **Motion:** stamp settles are one-shot entrances. Under reduced motion they appear at their resting angle with no animation.

### Season column
The head is a Sunk Sage strip, 3px top corners, with a 2px ink bottom rule and an uppercase soft-ink name. **Current:** full ink head with paper text and a NOW pill outlined in paper. **Completed:** transparent head with a hairline rule, stakes on the ground tone, bands collapsed to hairlines. Each open column ends with the dashed add-a-course slot holding a teal Add button.

### Legend (level key)
One wrapping inline strip: a 0.8rem square swatch with a 35% ink border, the bed name, and "earned/required units" in soft ink, with " — complete" appended when full. The total leads with an ink dot in bold. Pathway options cluster inline. The unchosen option gets hollow 1.5px swatches in its hue, 500-weight soft-ink names, and the words "not chosen".

## Do's and Don'ts

### Do:
- **Do** assign bed hues only through the fixed eight-hue order, by requirement-group position, and use the same hue for that bed everywhere on the page.
- **Do** put words next to every colour: a name and "n/m units" beside each swatch, the checker's exact label inside each mark.
- **Do** keep Reserved Deep Teal for primary actions, links, selection and focus rings.
- **Do** show state as a mark: red double-rule stamp for Zero credit, grey dashed stamp for Can't check, amber tag for Timing warning, green outline for Counts.
- **Do** make past seasons recede by tone and hairline, never by opacity.
- **Do** keep every surface flat: paper on sage, 1px hairlines, 3px corners.
- **Do** keep the 8px hairline grid on the ground.

### Don't:
- **Don't** build the plan from dashboard parts: no stat tiles, progress rings, progress bars or big-number summaries. Progress is a count in words.
- **Don't** use box-shadows or gradient fills on surfaces, bands or swatches.
- **Don't** use teal for a bed, a mark, or a decorative fill.
- **Don't** use a bed hue to signal status, or a mark colour (Stamp Red, Shrug Grey, amber, Counts Green) to name a group or decorate an interaction.
- **Don't** add a second typeface or uppercase bands, marks or buttons.
- **Don't** add ambient or looping animation. The only motion is the one-shot stamp settle.
- **Don't** imitate ANU branding or show a logo.
