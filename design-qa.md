# Design QA — Exact reference recreation

- Date: 2026-09-30
- Reference: `C:\Users\jiahu\.codex\generated_images\01a0e61e-da30-7c80-a5cb-d1efddb8f8e5\exec-d69b8ca5-bd87-41bc-862d-5eaa4dff8e36.png`
- Prototype: `http://127.0.0.1:8796/app/?v=reference-match-20260930`
- Comparison viewport: 1488 × 1057, matching the reference image dimensions
- Responsive check: 390 × 844

## Fidelity comparison

| Area | Result | Evidence |
| --- | --- | --- |
| Overall geometry | Pass | 260px notebook sidebar; greeting begins at the same vertical band; calendar and metric cards use the reference's roughly 56/44 split. |
| Sidebar | Pass | Large serif logo, handwritten “Small Words / A Bigger You”, 60px active navigation, curiosity note and oversized bottom-left botanical asset match the reference composition. |
| Greeting | Pass | Date sits above the large serif greeting; yellow underline is limited to “幾個新單字”; paper-note quote and plant/books occupy the upper-right. |
| Calendar | Pass | Sunday-first month, pale sage panel, lined day cells, circular completion checks, large dark-green today circle, coral streak pill, botanical encouragement footer. |
| Metric cards | Pass | Three equal-height coral, blue and yellow cards; large circular icons; oversized values; handwritten notes; round arrow actions; progress meter. |
| Reading card | Pass | Full-width torn-paper lunar collage with astronaut and Earth, quiet left text area, leaves, and green reading CTA. |
| Responsive behavior | Pass | Mobile stacks all cards and retains readable calendar dates without horizontal page overflow. |
| Functionality | Pass | Taipei date calculations, practice checks, streak, review entry, library entry, weekly progress and reading entry remain wired to live data. |
| Browser health | Pass | No browser console errors or warnings on desktop or mobile. |

## Verification

- Unit suite: 10/10 passed.
- Local server integration: passed.
- Cloud storage integration: passed.
- Asset routing covers the new transparent botanical and lunar reading artwork.

**final result: passed**
