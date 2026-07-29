/** Generates a HeroCard-style gradient + glow from a single custom hex color. */

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6)
  const num = parseInt(full, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      default:
        h = (rn - gn) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return [h, s * 100, l * 100]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let rgb: [number, number, number]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255]
}

export interface HeroGradient {
  background: string
  boxShadow: string
}

/** Builds a diagonal light-to-dark gradient and matching glow from one base hex color. */
export function heroGradientFromHex(hex: string): HeroGradient {
  const [r, g, b] = hexToRgb(hex)
  const [h, s, l] = rgbToHsl(r, g, b)
  const from = rgbToHex(...hslToRgb(h, clamp(s + 2, 35, 82), clamp(l + 2, 34, 70)))
  const to = rgbToHex(...hslToRgb(h, clamp(s - 3, 32, 78), clamp(l - 4, 20, 58)))
  return {
    background: `linear-gradient(145deg, ${from} 0%, ${to} 100%)`,
    boxShadow: `0 14px 34px color-mix(in srgb, ${to} 38%, transparent)`,
  }
}

/** Representative flat hex per preset HeroTone, used only as swatch previews (the real tones render as CSS-var gradients). */
export const HERO_TONE_HEX = {
  iris: '#6C63FF',
  apricot: '#F2A65A',
  sun: '#FFC94D',
  mint: '#3DDC97',
  rose: '#E8628F',
} as const

/** Quick-pick swatches offered in card color pickers. */
export const CARD_COLOR_SWATCHES: string[] = [
  HERO_TONE_HEX.iris,
  HERO_TONE_HEX.apricot,
  HERO_TONE_HEX.sun,
  HERO_TONE_HEX.mint,
  HERO_TONE_HEX.rose,
  '#4C8BF5',
  '#8E6ADB',
  '#2FB8A8',
]
