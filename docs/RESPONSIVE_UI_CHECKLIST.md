# Responsive UI Checklist

Use this checklist for every UI PR to keep layouts consistent across Android and iOS.

## 1) Contract First
- Use `useResponsiveTokens()` from `src/components/Responsiveutils.ts` for spacing, font, size, and safe-area values.
- Avoid screen-local scaling logic unless truly screen-specific.
- Prefer token values over hardcoded dimensions.

## 2) Layout Rules
- Ensure top bars, cards, and list rows adapt on:
  - small phone
  - regular phone
  - large phone
  - tablet
- Keep touch targets at least `44` px (`48` preferred for main actions).
- Ensure long labels and dynamic counts do not clip.

## 3) Safe Area + Navigation
- Respect top/bottom insets for all full-screen panels and modals.
- Ensure scroll content includes bottom padding above tab bar.
- Do not hide bottom tabs unless explicitly required.

## 4) Typography
- Use responsive font tokens (`xs` to `xxxl`) from the shared contract.
- Avoid single fixed font sizes for complex screens.
- Validate with larger system text settings.

## 5) Visual QA Matrix
- Android + iOS:
  - small phone
  - regular phone
  - large phone
  - tablet
- Verify:
  - no clipping
  - no overlap with notch/status/tab bar
  - balanced spacing and card proportions

## 6) Guardrails
- Run `npm run responsive:audit` and review introduced fixed-size hotspots.
- Keep intentional fixed sizes only for assets that must remain fixed (e.g., logos).
