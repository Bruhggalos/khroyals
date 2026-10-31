/** Runtime checks for JSON RPC payloads, whose shapes Postgres cannot express. */
import { z } from 'zod';
import type { Abilities, Access, CarlineConfig, Child, FamilyRequest, TeacherThread } from './types';
import type { GroupSettings } from '../comms/types';

const text = z.string(), number = z.number(), boolean = z.boolean();
const nullableText = text.nullable();
export const groupRole = z.enum(['owner', 'moderator', 'member', 'subscriber']);
export const schoolRole = z.enum(['admin', 'teacher', 'staff', 'parent', 'student', 'family', 'substitute']);
export const postStatus = z.enum(['published', 'pending', 'rejected', 'removed', 'scheduled']);
const audience = z.enum(['nobody', 'owners', 'moderators', 'members', 'subscribers']);
const decision = z.object({ allowed: boolean, needsApproval: boolean.optional(), reason: text.optional() });
export const abilitiesSchema = z.object({
  role: groupRole.nullable(), post: decision, askQuestion: decision, comment: decision, react: decision,
  createPolls: decision, attachFiles: decision, pin: decision, moderate: boolean, editSettings: boolean, createEvents: boolean,
}) satisfies z.ZodType<Abilities & { role: z.infer<typeof groupRole> | null }>;
export const groupSettingsSchema = z.object({
  mode: z.enum(['chat', 'forum', 'broadcast', 'qa']), visibility: z.enum(['public', 'school', 'private', 'hidden']),
  joinPolicy: z.enum(['assigned', 'open', 'request', 'invite']),
  permissions: z.object({ viewContent: audience, post: audience, comment: audience, react: audience, askQuestion: audience,
    answerQuestion: audience, attachFiles: audience, createPolls: audience, pin: audience, seeMemberList: audience,
    directMessageMembers: audience, mentionEveryone: audience }),
  requirePostApproval: boolean, requireQuestionApproval: boolean, allowAnonymousQuestions: boolean,
  slowModeSeconds: number, autoCloseCommentsAfterDays: number.nullable(), locked: boolean, lockReason: text.optional(),
  quietHours: z.object({ start: text, end: text, appliesTo: groupRole.array() }).nullish(),
  contentFilter: z.enum(['off', 'standard', 'strict']), retainDeletedContent: boolean, membersCanLeave: boolean,
  notificationDefault: z.enum(['all', 'mentions', 'digest', 'none']),
}) satisfies z.ZodType<GroupSettings>;
export const attachmentsSchema = z.object({ type: z.enum(['image', 'file', 'link']), url: text, name: text.optional() }).array();
export const pickupVehicleSchema = z.object({ id: text, make: text, kind: text, color: text, label: text }).nullable();
export const familyDetailsSchema = z.object({ firstName: text, lastName: text, grade: number,
  birthday: nullableText.optional(), note: nullableText.optional(), relation: z.enum(['mother', 'father']).nullish(),
}) satisfies z.ZodType<FamilyRequest['details']>;
export const parentsSchema = z.object({ id: text, name: text, family: boolean.optional() }).array();
export const childrenSchema = z.object({
  id: text, firstName: text, lastName: text, grade: number.nullable(), gradeLabel: nullableText, classOf: number.nullable(),
  photoPath: nullableText, hasLogin: boolean, pickupNumber: nullableText, birthday: nullableText,
  bio: text, allergies: text, medicalNotes: text, parents: text.array(),
}).array() satisfies z.ZodType<Omit<Child, 'photo'>[]>;
export const accessSchema = z.object({
  // Servers before migration 34 sent null for people without an admin tier.
  tier: nullableText, roleName: nullableText, isDirector: boolean.nullable().transform((v) => !!v), granted: text.array(), permissions: text.array(),
  mfaRequired: boolean, mfaVerified: boolean,
}) satisfies z.ZodType<Access>;
export const carlineConfigSchema = z.object({
  latitude: number, longitude: number, radius: number, start: text, end: text, canEdit: boolean,
  line: z.object({ state: z.enum(['open', 'early', 'closed']), opensAt: text.optional(), openedNow: boolean.optional() }),
  festive: z.object({ enabled: boolean, off: text.array() }).optional(),
}) satisfies z.ZodType<CarlineConfig>;
export const teacherThreadSchema = z.object({
  id: text, studentId: text, teacherId: text, studentName: text, teacherName: text, canWrite: boolean,
  messages: z.object({ id: text, authorId: nullableText, body: text, createdAt: text }).array(),
}).nullable() satisfies z.ZodType<TeacherThread | null>;
export const teacherSendSchema = z.object({ thread_id: text });
