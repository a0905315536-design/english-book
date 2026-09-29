# Design QA — Curious Notebook

- Source visual truth: `C:\Users\jiahu\.codex\generated_images\01a0e61e-da30-7c80-a5cb-d1efddb8f8e5\exec-d447c85b-76ba-4832-bf9c-c6d2c0d86882.png`
- Browser-rendered desktop evidence: `C:\Users\jiahu\OneDrive\文件\英文\word-garden\qa-desktop-final.png`
- Browser-rendered mobile evidence: `C:\Users\jiahu\OneDrive\文件\英文\word-garden\qa-mobile-final.png`
- Combined source/implementation comparison: `C:\Users\jiahu\OneDrive\文件\英文\word-garden\qa-comparison.jpg`
- Source pixels: 1487 × 1058.
- Desktop viewport and capture: 1440 × 1024 CSS pixels and 1440 × 1024 output pixels, device scale 1.
- Mobile viewport: 390 × 844 CSS pixels; browser output was normalized by the in-app browser to 297 × 642 pixels.
- State: authenticated home screen with an empty new account. Additional states checked: login, desktop home, mobile home, wordbook empty state, and full-article reading.

**Full-view comparison evidence**

The implementation preserves the selected direction's core hierarchy: compact left navigation, large editorial review hero, cream stationery surface, forest/blue/coral/yellow palette, plant-and-book hero asset, integrated progress strip, and lightweight action rows. The implementation intentionally removes decorative sticky-note copy that would reduce readability at smaller sizes.

**Focused region comparison evidence**

- Hero: serif display hierarchy, review button placement, generated plant/books/pen asset, and cream paper field match the selected art direction.
- Navigation: icon weight, green selected state, blue secondary icons, coral reading indicator, and compact spacing match the target.
- Progress/actions: one mint progress surface and divided action rows retain the target's low-card layout.
- Authentication: the same palette, display type, hero asset, and stationery composition continue through login, registration, and recovery.

**Required fidelity surfaces**

- Fonts and typography: Chinese display text uses an available serif stack with a system sans-serif for controls; hierarchy and wrapping match the reference without loading third-party fonts.
- Spacing and layout rhythm: desktop proportions follow the reference. The responsive layout changes the hero to one column below 1000 px and keeps controls usable at 390 px.
- Colors and visual tokens: forest green, cobalt, coral, marigold, mint, cream, and ink tokens are consistently reused across screens with readable contrast.
- Image quality and asset fidelity: the hero uses a purpose-generated transparent raster asset based on the selected concept. Icons come from the local Phosphor icon library. No placeholder imagery is present.
- Copy and content: Traditional Chinese labels remain concise and task-focused; daily reading now says and displays complete NASA articles.

**Comparison history**

- Initial P2: at the mobile breakpoint, programmatic heading focus produced a black focus rectangle and the horizontal navigation showed a persistent scrollbar. Fixed by suppressing focus outline only on the programmatically focused page heading and visually hiding the navigation scrollbar while preserving keyboard and touch scrolling.
- Initial P2: the hero illustration became too small between 701 and 1000 px. Fixed by switching the medium layout to a one-column hero with a 280 px illustration area.
- Post-fix evidence: `qa-desktop-final.png` and `qa-mobile-final.png` show the revised layouts. No actionable P0/P1/P2 issues remain.

**Primary interactions tested**

- Login and authenticated redirect.
- New-account registration, isolated storage, recovery-code password reset, old-session invalidation, and login with the new password.
- Navigation among home, wordbook, and daily reading.
- Full NASA article loading and click-ready word controls.
- Console checked with no captured errors or warnings.

**Follow-up polish**

- P3: a future iteration could add another purpose-generated paper texture asset, but the current solid paper surfaces are clearer and load faster.

final result: passed

