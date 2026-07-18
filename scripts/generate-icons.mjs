/**
 * Generate PWA icons from SVG template.
 * Uses sharp to render at various sizes.
 */
import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const iconsDir = join(publicDir, 'icons');

if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// SVG template — blue rounded square with white download arrow
const iconSvg = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="128" fill="#2563eb"/>
  <path d="M256 144V320M256 320L176 240M256 320L336 240" stroke="white" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M144 368H368" stroke="white" stroke-width="40" stroke-linecap="round"/>
</svg>
`;

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  for (const size of sizes) {
    const outputPath = join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(Buffer.from(iconSvg))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✓ Generated icon-${size}x${size}.png`);
  }

  // Apple touch icon (180x180, no transparency, white bg)
  const appleIcon = `
<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="180" height="180" fill="#2563eb"/>
    <path d="M90 50V112M90 112L60 82M90 112L120 82" stroke="white" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M50 130H130" stroke="white" stroke-width="14" stroke-linecap="round"/>
  </svg>
  `;
  await sharp(Buffer.from(appleIcon))
    .resize(180, 180)
    .png()
    .toFile(join(iconsDir, 'apple-touch-icon.png'));
  console.log('✓ Generated apple-touch-icon.png');

  // Shortcut icons
  const shortcutSvg = (emoji) => `
<svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="96" height="96" rx="24" fill="#2563eb"/>
    <text x="48" y="62" font-family="sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">${emoji}</text>
  </svg>
  `;
  await sharp(Buffer.from(shortcutSvg('↓'))).png().toFile(join(iconsDir, 'shortcut-download.png'));
  await sharp(Buffer.from(shortcutSvg('?'))).png().toFile(join(iconsDir, 'shortcut-faq.png'));
  console.log('✓ Generated shortcut icons');

  // Default OG image (1200x630)
  const ogSvg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#f8fafc"/>
    <rect x="60" y="60" width="1080" height="510" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <rect x="120" y="120" width="80" height="80" rx="20" fill="#2563eb"/>
    <path d="M160 140V180M160 180L145 165M160 180L175 165" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M140 190H180" stroke="white" stroke-width="6" stroke-linecap="round"/>
    <text x="220" y="170" font-family="Plus Jakarta Sans, sans-serif" font-size="48" font-weight="800" fill="#0f172a">UnduhAja</text>
    <text x="120" y="290" font-family="Plus Jakarta Sans, sans-serif" font-size="64" font-weight="800" fill="#0f172a">Download Video</text>
    <text x="120" y="370" font-family="Plus Jakarta Sans, sans-serif" font-size="64" font-weight="800" fill="#2563eb">Tanpa Ribet.</text>
    <text x="120" y="460" font-family="Plus Jakarta Sans, sans-serif" font-size="28" font-weight="500" fill="#475569">YouTube &amp; TikTok · Made in Indonesia</text>
    <rect x="120" y="510" width="180" height="36" rx="18" fill="#eff6ff"/>
    <text x="210" y="535" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="600" fill="#2563eb" text-anchor="middle">v1.0.0</text>
  </svg>
  `;
  await sharp(Buffer.from(ogSvg)).jpeg({ quality: 90 }).toFile(join(publicDir, 'og-default.png'));
  console.log('✓ Generated og-default.png');

  // Logo for structured data
  const logoSvg = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" rx="128" fill="#2563eb"/>
    <path d="M256 144V320M256 320L176 240M256 320L336 240" stroke="white" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M144 368H368" stroke="white" stroke-width="40" stroke-linecap="round"/>
  </svg>
  `;
  await sharp(Buffer.from(logoSvg)).png().toFile(join(publicDir, 'logo.png'));
  console.log('✓ Generated logo.png');
}

generateIcons().catch(console.error);
