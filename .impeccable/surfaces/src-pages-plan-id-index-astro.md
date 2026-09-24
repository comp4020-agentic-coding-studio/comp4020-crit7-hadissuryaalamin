---
version: 1
slug: "src-pages-plan-id-index-astro"
primary_target: "src/pages/plan/[id]/index.astro"
related_targets: ["src/pages/index.astro","src/pages/plan/[id]/catch-up.astro","src/pages/404.astro","src/pages/readme.astro"]
---

# Surface brief: Degree Plan Checker (all pages; plan page is primary)

Scope: full visual redesign of `/`, `/plan/<id>`, `/plan/<id>/catch-up`, `/readme/`, 404. Behaviour, routes, forms, copy and checker output stay as they are.
Visitor mode: Operate. Laptop planning session with Programs & Courses open in another tab; phone must still work.
Audience/job: ANU Computing and MLCV master's students (many international, visa-bound) checking that every planned course counts. Advisors open shared plan links.
Must avoid: generic dashboard (cards, stat tiles, rings, gradients); dense or hard-to-read text; anything that looks like ANU's site.
Asked for: each requirement group gets its own colour; course search shows names (separate task).

## Direction contract

THESIS: The degree is a planting plan. Semesters are season columns, requirement groups are colour-coded beds, every course is a labelled stake. Refuses the dashboard of cards, stat tiles and progress rings.

OWN-WORLD: Drafting-sheet ground #EEF1EA with a faint 8px grid; ink #1E2A22. Beds are flat unmodulated colour fields from one fixed set (moss, marigold, brick, iris, plum, sage, ochre, slate), assigned by group position, same colour everywhere a group appears. Stakes are white labels with a bed-colour band and the bed's name in words. State is a mark: red-ink WON'T COUNT stamp, grey CAN'T CHECK stamp, amber timing tag, pin for permission. One reserved action colour (deep teal #0F5E63) used by no bed. One workhorse grotesk (Atkinson Hyperlegible Next, chosen for legibility for second-language readers), no shadows, no gradients.

STORY: The student sees their seasons, sees which bed each stake fills, spots any stamped stake instantly, adds or removes stakes, and leaves knowing what still needs planting.

FIRST VIEWPORT: Plan title line; beneath it a pinned level legend of beds, each swatch with name and units filled (e.g. 12/18). Below, the season columns side by side at laptop width, current season darker-headed and marked NOW, past seasons receded. Each column lists its stakes, with the add-a-course slot at its foot as the primary action in teal. Phone: columns stack, legend wraps.

FORM: Planting Plan, position 7 on the ordered list, seed key 0b376d1d.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Admin page (epic section 17) is not part of this build.
