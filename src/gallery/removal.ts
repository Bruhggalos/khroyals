/**
 * Why a teacher, staff member or admin removed someone's photo. The same keys and words are in the database
 * (app.photo_removal_reasons), which puts the reason in the notice the person who added it gets;
 * tests/db.test.ts checks they match. "other" needs a note.
 */
export const REMOVAL_REASONS = [
  { key: 'guidelines', label: "Doesn't meet the school's photo guidelines" },
  { key: 'inappropriate', label: 'Not appropriate for a school album' },
  { key: 'permission', label: 'Shows a student without photo permission' },
  { key: 'wrong_album', label: 'Belongs in a different album' },
  { key: 'quality', label: 'A duplicate, or too blurry or dark' },
  { key: 'other', label: 'Another reason' },
] as const;

export type RemovalReason = (typeof REMOVAL_REASONS)[number]['key'];
