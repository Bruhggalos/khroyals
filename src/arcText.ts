/**
 * Text that follows the bottom of a circle (like the "Home" label under the tab bar's
 * shield button), drawn as one rotated letter per view, so it needs no SVG.
 */

/** Rough letter widths in ems, so curved text is spaced like ordinary text. */
const EM: Record<string, number> = { ' ': 0.3, i: 0.28, j: 0.28, l: 0.28, f: 0.36, t: 0.38, r: 0.42, I: 0.3, m: 0.9, w: 0.8, M: 0.9, W: 0.95 };
const em = (c: string) => EM[c] ?? (c !== c.toLowerCase() ? 0.7 : 0.58);

export type ArcLetter = {
  char: string;
  /** Letter center, from the circle's center (y down). */
  x: number;
  y: number;
  /** Clockwise degrees, so each letter's top points at the circle's center. */
  rotate: number;
};

/** Where each letter goes to read left to right along the bottom of a circle of `radius`. */
export function bottomArc(text: string, radius: number, fontSize: number, tracking = 0.04): ArcLetter[] {
  const chars = [...text];
  const step = chars.map((c) => ((em(c) + tracking) * fontSize) / radius);  // radians per letter
  let at = -step.reduce((a, b) => a + b, 0) / 2;                          // start left of center
  return chars.map((char, i) => {
    const angle = at + step[i] / 2;  // from straight down; negative is left
    at += step[i];
    return { char, x: radius * Math.sin(angle), y: radius * Math.cos(angle), rotate: (-angle * 180) / Math.PI };
  });
}
