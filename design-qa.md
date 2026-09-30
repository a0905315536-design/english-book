# Design QA — Growing Path × Curious Notebook

- Functional source: `C:\Users\jiahu\.codex\generated_images\01a0e61e-da30-7c80-a5cb-d1efddb8f8e5\exec-ca3467bc-5705-4277-a897-36522a77ee16.png`
- Visual source: `C:\Users\jiahu\.codex\generated_images\01a0e61e-da30-7c80-a5cb-d1efddb8f8e5\exec-d447c85b-76ba-4832-bf9c-c6d2c0d86882.png`
- Browser evidence: authenticated local app inspected in the Codex in-app browser at desktop 1440 × 1000 and mobile 390 × 844.
- States checked: desktop home with real learning data, mobile home, featured reading card, daily-reading navigation, and empty-account fallbacks.

## Source-to-build comparison

The homepage combines the first source's useful learning overview with the second source's notebook art direction. The Curious Notebook hero, stationery palette, serif display type, handwritten accents, local Phosphor icons, and plant/book illustration remain the visual foundation.

The new functionality follows the Growing Path reference:

- A five-day learning path marks days with completed reviews and highlights today.
- The route summary reports due cards, words reviewed today, and the current learning streak.
- The progress board reports this week's reviews against a 50-card goal, words last rated “簡單”, all collected words, and unique learning days.
- The featured NASA card uses the current article title, Chinese title, estimated reading time, and a simple difficulty estimate.
- Both the full card and “前往閱讀” open the existing complete article experience.

## Responsive and accessibility checks

- Desktop preserves the wide editorial hierarchy, four-column progress board, reading image, and quote panel.
- Tablet changes the progress board to two columns and removes the secondary quote card.
- Mobile keeps the five-day path legible, stacks the weekly goal above the metrics, and adds a readable paper surface behind article text.
- Navigation remains keyboard and touch accessible. Regions use headings and accessible names, and the progress goal includes a native `meter` element.
- No browser console errors or warnings were captured.

## Issues found and fixed

- P1: the new reading image initially returned the login document because it was missing from the server's public asset allowlist. Fixed by registering the PNG with the correct image MIME type and rechecking the rendered card.
- P2: the article copy needed a reliable mobile contrast surface over the image. Fixed with a solid translucent paper panel at the mobile breakpoint.
- P2: date calculations could depend on the server or browser timezone. Fixed by anchoring week, streak, and five-day path calculations to Asia/Taipei.
- P2: the featured card needed a real destination. Verified that clicking it opens the existing full NASA reading screen.

No actionable P0, P1, or P2 issues remain.

final result: passed
