/** mappers: internal API implementation. Screens import the connect facade. */
import type { Comment, Group, Post, SchoolRole } from '../comms/types';
import type { CriticalAlert, FamilyRequest, GroupEvent, Listing, MarketLine, MySettings, Notice, Opportunity, Person, Pickup, QuestionMessage, SchoolQuestion, Signup, SportEvent, SportRegistration, SportSeason, Vehicle, VolunteerMessage } from './types';
import type { Tables } from './database.types';
import { enumValue, jsonObject } from './validation';
import { KIND_LABELS } from '../sports/categories';
import { ALERT_KINDS } from '../alerts/kinds';
import { attachmentsSchema, familyDetailsSchema, groupSettingsSchema, pickupVehicleSchema, postStatus, schoolRole } from './schemas';
import { QUESTION_TOPICS } from './types';
import { VEHICLE_COLORS, VEHICLE_KINDS } from '../carline/vehicles';

type ProfileRow = Pick<Tables<'profiles'>, 'id' | 'first_name' | 'last_name' | 'school_role' | 'grade' | 'carline_duty' | 'volunteer_lead'> & { email?: string | null };

export const toPerson = (p: ProfileRow, avatar = ''): Person => ({
  id: p.id, firstName: p.first_name ?? '', lastName: p.last_name ?? '', schoolRole: p.school_role === null ? 'student' : schoolRole.parse(p.school_role),
  avatar, grade: p.grade ?? undefined,
  email: p.email, pending: p.school_role == null, carlineDuty: !!p.carline_duty, volunteerLead: !!p.volunteer_lead,
});

export const toGroup = (g: Tables<'groups'>): Group => ({
  id: g.id, name: g.name, description: g.description, icon: g.icon, color: g.color, category: enumValue(g.category, ['school-wide', 'class', 'grade', 'athletics', 'club', 'staff', 'parents', 'district']),
  createdBy: g.created_by ?? '', createdAt: g.created_at, settings: groupSettingsSchema.parse(g.settings), assignmentRules: [],
  parentGroupId: g.parent_group_id, tags: g.tags ?? [],
});

type PostRow = Tables<'posts'> & {
  reactions?: Pick<Tables<'reactions'>, 'emoji' | 'user_id'>[];
  poll_options?: (Pick<Tables<'poll_options'>, 'id' | 'label' | 'position'> & { poll_votes?: { user_id: string }[] })[];
};
export const toPost = (p: PostRow): Post & { anonymous?: boolean } => {
  const reactions: Record<string, string[]> = {};
  for (const r of p.reactions ?? []) (reactions[r.emoji] ??= []).push(r.user_id);
  const options = [...(p.poll_options ?? [])].sort((a, b) => a.position - b.position);
  return {
    id: p.id, groupId: p.group_id, authorId: p.author_id, kind: enumValue(p.kind, ['message', 'thread', 'announcement', 'question', 'poll']), title: p.title ?? undefined, body: p.body,
    attachments: attachmentsSchema.parse(p.attachments ?? []), status: postStatus.parse(p.status), pinned: p.pinned, commentsLocked: p.comments_locked,
    score: p.score, reactions, createdAt: p.created_at, editedAt: p.edited_at,
    poll: options.length ? { question: p.title ?? '', options: options.map((o) => ({ id: o.id, label: o.label, votes: (o.poll_votes ?? []).map((v) => v.user_id) })) } : undefined,
    anonymous: p.author_id == null && p.kind === 'question',
  };
};

export const toComment = (c: Tables<'comments'>): Comment => ({
  id: c.id, postId: c.post_id, parentCommentId: c.parent_comment_id, authorId: c.author_id ?? '', body: c.body,
  status: postStatus.parse(c.status), isAnswer: c.is_answer, score: c.score, createdAt: c.created_at,
});

export const toEvent = (e: Tables<'events'> & { groups?: { name: string; icon: string } | null }): GroupEvent => ({
  id: e.id, groupId: e.group_id, groupName: e.groups?.name, groupIcon: e.groups?.icon, title: e.title,
  description: e.description, date: e.starts_on, endDate: e.ends_on, startTime: e.start_time?.slice(0, 5) ?? null,
  endTime: e.end_time?.slice(0, 5) ?? null, allDay: e.all_day, location: e.location, category: e.category,
});

export const toPickup = (r: Tables<'carline_pickups'>): Pickup => ({
  id: r.id, studentId: r.student_id, guardianId: r.guardian_id, status: enumValue(r.status, ['waiting', 'picked_up', 'cancelled']),
  arrivedAt: r.arrived_at, pickedUpAt: r.picked_up_at, pickedUpBy: r.picked_up_by, via: enumValue(r.via ?? 'app', ['app', 'arrival']), vehicle: pickupVehicleSchema.parse(r.vehicle),
});

export const toVehicle = (r: Tables<'vehicles'>): Vehicle => ({ id: r.id, make: r.make,
  kind: enumValue(r.kind, VEHICLE_KINDS.map((k) => k.key)), color: enumValue(r.color, VEHICLE_COLORS.map((c) => c.key)), lastUsedAt: r.last_used_at });

export const toSeason = (r: Tables<'sport_seasons'>): SportSeason => ({
  id: r.id, sportId: r.sport_id, name: r.name, startsOn: r.starts_on, endsOn: r.ends_on, signupOpens: r.signup_opens,
  signupCloses: r.signup_closes, minGrade: r.min_grade, maxGrade: r.max_grade, details: r.details, infoUrl: r.info_url,
});

export const toSportEvent = (r: Tables<'sport_events'>): SportEvent => ({
  id: r.id, seasonId: r.season_id, kind: enumValue(r.kind, Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]), title: r.title, startsAt: r.starts_at, endsAt: r.ends_at,
  location: r.location, home: r.home, notes: r.notes, cancelled: r.cancelled, address: r.address ?? null,
});

export const toRegistration = (r: Tables<'sport_registrations'>): SportRegistration => ({
  id: r.id, seasonId: r.season_id, studentId: r.student_id, requestedBy: r.requested_by, status: enumValue(r.status, ['pending', 'registered', 'declined', 'withdrawn']),
  note: r.note, decisionNote: r.decision_note, createdAt: r.created_at,
});

export const toListing = (r: Tables<'market_listings'>): Listing => ({
  id: r.id, sellerId: r.seller_id, title: r.title, description: r.description, priceCents: r.price_cents,
  quantity: r.quantity, condition: enumValue(r.condition, ['new', 'like_new', 'good', 'fair']), photoPath: r.photo_path, status: enumValue(r.status, ['open', 'pending', 'sold', 'removed']), buyerId: r.buyer_id,
  saleCents: r.sale_cents, createdAt: r.created_at,
});

export const toLine = (r: Tables<'market_responses'>): MarketLine => ({
  id: r.id, listingId: r.listing_id, buyerId: r.buyer_id, kind: enumValue(r.kind, ['dibs', 'offer']), offerCents: r.offer_cents,
  counterCents: r.counter_cents, message: r.message, agreedCents: r.agreed_cents, createdAt: r.created_at, status: enumValue(r.status, ['agreed', 'offered', 'countered', 'declined', 'withdrawn', 'selected']),
});

export const toOpportunity = (r: Tables<'volunteer_opportunities'>): Opportunity => ({
  id: r.id, leadId: r.lead_id, title: r.title, description: r.description, startsOn: r.starts_on, endsOn: r.ends_on,
  startTime: r.start_time?.slice(0, 5) ?? null, endTime: r.end_time?.slice(0, 5) ?? null, location: r.location,
  spots: r.spots, kind: enumValue(r.kind ?? 'help', ['help', 'items']), item: r.item ?? null, quantity: r.quantity ?? null,
  status: enumValue(r.status, ['open', 'deleted']), deleteReason: r.delete_reason, createdAt: r.created_at,
});

export const toSignup = (r: Tables<'volunteer_signups'>): Signup => ({ opportunityId: r.opportunity_id, userId: r.user_id, createdAt: r.created_at, quantity: r.quantity ?? null });

export const toMessage = (r: Tables<'volunteer_messages'>): VolunteerMessage => ({ id: r.id, opportunityId: r.opportunity_id, authorId: r.author_id, body: r.body, createdAt: r.created_at });

export const toQuestion = (r: Tables<'school_questions'>): SchoolQuestion => ({
  id: r.id, askerId: r.asker_id, topic: enumValue(r.topic, QUESTION_TOPICS), subject: r.subject, status: enumValue(r.status, ['new', 'assigned', 'answered', 'closed']), assigneeId: r.assignee_id,
  assignedAt: r.assigned_at, waitingSince: r.waiting_since, answeredAt: r.answered_at, createdAt: r.created_at, updatedAt: r.updated_at,
});

export const toQuestionMessage = (r: Tables<'school_question_messages'>): QuestionMessage => ({
  id: r.id, questionId: r.question_id, authorId: r.author_id, fromSchool: r.from_school, body: r.body, createdAt: r.created_at,
});

export const toAlert = (r: Tables<'critical_alerts'>): CriticalAlert => ({
  id: r.id, kind: enumValue(r.kind, ALERT_KINDS.map((k) => k.key)), title: r.title, body: r.body ?? '', createdBy: r.created_by, createdAt: r.created_at,
  endedAt: r.ended_at, endedBy: r.ended_by, endNote: r.end_note,
});

export const toNotice = (n: Pick<Tables<'notifications'>, 'id' | 'title' | 'body' | 'data' | 'created_at' | 'status' | 'sent_count' | 'audience'>): Notice => ({
  id: n.id, title: n.title, body: n.body, data: jsonObject(n.data), createdAt: n.created_at, status: n.status, sentCount: n.sent_count, audience: n.audience,
});

export const DEFAULT_SETTINGS: MySettings = {
  pushSchool: true, pushGroups: true, pushReplies: true, pushMarketplace: true, pushVolunteer: true, quietStart: null, quietEnd: null,
};

export const toSettings = (r: Tables<'user_settings'> | null): MySettings => (r ? {
  pushSchool: r.push_school ?? true, pushGroups: r.push_groups, pushReplies: r.push_replies ?? true,
  pushMarketplace: r.push_marketplace, pushVolunteer: r.push_volunteer,
  quietStart: r.quiet_start?.slice(0, 5) ?? null, quietEnd: r.quiet_end?.slice(0, 5) ?? null,
} : DEFAULT_SETTINGS);

export const toRequest = (r: Tables<'family_requests'>): FamilyRequest => ({
  id: r.id, kind: enumValue(r.kind, ['add_child', 'edit_child']), status: r.status, createdAt: r.created_at, studentId: r.student_id, details: familyDetailsSchema.parse(r.details), decisionNote: r.decision_note,
});
