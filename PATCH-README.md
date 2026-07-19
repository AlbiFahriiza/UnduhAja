# UnduhAja Frontend Patch v1.0.1

## Yang Diubah

### 1. UrlInput.tsx — Placeholder Animation Fix
- **IN animation**: Changed from right→left to LEFT→RIGHT (first char appears first)
- **OUT animation**: ADDED! Characters now fade out RIGHT→LEFT before phase change
- OUT animation: 40ms per char, fade + translateY down
- IN animation: 35ms per char, spring overshoot (translateY 6px→0)

### 2. UrlInput.module.css — Hover/Focus + Mobile Fix
- Fixed focus state: clean border + subtle ring (no weird hover)
- Mobile layout: inputWrap stays horizontal (not column), proper sizing
- Submit button: full width on mobile, clean spacing
- All buttons properly sized for touch targets

### 3. Header.astro — Dark Mode Toggle Icon Fix
- Added explicit `display: block` for `.header__icon-sun` in light mode
- Moon icon now properly shows in dark mode
- Works on both desktop and mobile

### 4. Footer.astro — Mobile Footer Optimization
- Mobile (< 880px): 3 column grid instead of 1 (more compact)
- Mobile (< 480px): 2 column grid (was 1 column, too long)
- Reduced padding, font sizes, and gaps for mobile
- Footer bottom centered on mobile

## Cara Pakai

1. Extract this ZIP
2. Copy files ke root project UnduhAja lo (overwrite existing)
3. Git commit + push:
   ```bash
   git add .
   git commit -m "fix: placeholder animation, mobile UI, dark mode toggle, footer"
   git push
   ```
4. Vercel auto-deploy akan handle sisanya
