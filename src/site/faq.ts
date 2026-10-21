/**
 * The F.A.Q.s on the khroyals.com home page. They live in Ask the School
 * (app/questions/faq.tsx), so the Info tab leaves them out. Found by their "F.A.Q.s"
 * heading, so they keep working when the site content is imported again. No app
 * imports, so tests run it.
 */
import type { Block, Section } from './types';

const isFaqHeading = (b: Block) => b.type === 'heading' && /^F\.?\s*A\.?\s*Q/i.test(b.text.trim());

export const isFaqSection = (sec: Section) => sec.blocks.some(isFaqHeading);

/**
 * The F.A.Q.s section without its heading (the screen's title says it) or its photo (so
 * "Still have a question?" sits right under the answers), or null if the site has none.
 */
export function faqSection(sections: Section[]): Section | null {
  const sec = sections.find(isFaqSection);
  return sec ? { ...sec, blocks: sec.blocks.filter((b) => !isFaqHeading(b) && b.type !== 'image') } : null;
}
