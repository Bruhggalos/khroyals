/** types: internal API implementation. Screens import the connect facade. */
import type { Decision } from '../comms/permissions';
import type { Group, GroupRole, Post, SchoolRole, User } from '../comms/types';
import type { VehicleColor, VehicleKind } from '../carline/vehicles';
import type { Category, EventKind } from '../sports/categories';
import type { AlertKind } from '../alerts/kinds';

export type Abilities = {
  post: Decision; askQuestion: Decision; comment: Decision; react: Decision;
  createPolls: Decision; attachFiles: Decision; pin: Decision;
  moderate: boolean; editSettings: boolean; createEvents: boolean;
};

export type GroupView = { group: Group; myRole: GroupRole | null; posts: Post[]; abilities: Abilities };

export type Person = User & { email?: string | null; pending?: boolean; carlineDuty?: boolean; volunteerLead?: boolean };

/** A dress-up day (Spirit Week): a theme students may wear that day, for some grades or (null) everyone. */
export type DressDay = {
  id: string; week: string | null; date: string; title: string; details: string;
  gradeFrom: number | null; gradeTo: number | null;
};

export type GroupEvent = {
  id: string; groupId: string | null; groupName?: string; groupIcon?: string;
  title: string; description?: string | null; date: string; endDate: string | null;
  startTime?: string | null; endTime?: string | null; allDay: boolean; location?: string | null; category: string;
};

export type NewEvent = Omit<GroupEvent, 'id' | 'groupName' | 'groupIcon'>;

export type Member = { userId: string; role: GroupRole; source: string; mutedUntil: string | null; canPost: boolean };

export type Pickup = {
  id: string; studentId: string; guardianId: string | null; status: 'waiting' | 'picked_up' | 'cancelled';
  arrivedAt: string; pickedUpAt: string | null; pickedUpBy: string | null;
  /** 'arrival' = checked in automatically when the parent's phone reached the car line. */
  via: 'app' | 'arrival';
  /** The vehicle that's coming, as it was when announced. */
  vehicle: PickupVehicle | null;
};

export type PickupVehicle = { id: string; make: string; kind: string; color: string; label: string };

export type CarlineConfig = {
  latitude: number; longitude: number; radius: number; start: string; end: string;
  line: { state: 'open' | 'early' | 'closed'; opensAt?: string; openedNow?: boolean };
  /** Car line leads and the office can change these settings. */
  canEdit: boolean;
  /** The big screen's festive touches (src/carline/festive.ts): all off, or the keys switched off. */
  festive?: { enabled: boolean; off: string[] };
};

export type Spot = { lat: number; lng: number; accuracy: number | null };

/** One row of the staff board, in arrival order. */
export type BoardRow = {
  id: string; studentId: string; status: 'waiting' | 'picked_up'; via: 'app' | 'arrival'; arrivedAt: string; pickedUpAt: string | null;
  distanceM: number | null; number: string | null; name: string; grade: number | null; parent: string; pickedUpBy: string;
  /** "Silver Honda SUV", when the driver saved their vehicle. */
  vehicle: string | null; vehicleColor: string | null; vehicleKind: string | null;
  /** It's the child's birthday today (the board never gets the date itself). */
  birthday?: boolean;
};

export type Arrival =
  | { state: 'open'; checkedIn: string[]; names: string[] }
  | { state: 'early'; opensAt: string }
  | { state: 'closed' };

/** A vehicle someone drives to pickup. The first in myVehicles() is their default (the last one used). */
export type Vehicle = { id: string; make: string; kind: VehicleKind; color: VehicleColor; lastUsedAt: string | null };

// Stored in the sports tables (named before theater was added); `category` says which kind.

/** `photo`: the team photo's URL when there is one (only approved accounts can see it). */
export type Sport = { id: string; name: string; icon: string; description: string; category: Category; coachIds: string[]; photoPath?: string | null; photo?: string };

export type SportSeason = {
  id: string; sportId: string; name: string; startsOn: string; endsOn: string;
  signupOpens: string | null; signupCloses: string | null; minGrade: number | null; maxGrade: number | null;
  details: string; infoUrl: string | null;
};

export type SportEventKind = EventKind;

export type SportEvent = {
  id: string; seasonId: string; kind: SportEventKind; title: string; startsAt: string; endsAt: string | null;
  location: string | null; home: boolean | null; notes: string; cancelled: boolean;
  /** Street address under the venue name (Directions opens Maps). */
  address?: string | null;
};

export type SportRegistration = {
  id: string; seasonId: string; studentId: string; requestedBy: string | null;
  status: 'pending' | 'registered' | 'declined' | 'withdrawn'; note: string; decisionNote: string; createdAt: string;
};

export type MySport = { sportId: string; following: boolean; registered: boolean };

/** Live schedule and sign-up changes. */
/** A family's answer to "Are you going?" for one registered child. */
export type SportRsvp = { eventId: string; studentId: string; status: 'going' | 'not_going' };

/** For an activity's leaders: one registered participant and their answer. */
export type SportAttendance = { eventId: string; studentId: string; name: string; status: 'going' | 'not_going' | 'none' };

export type Condition = 'new' | 'like_new' | 'good' | 'fair';

export type Listing = {
  id: string; sellerId: string; title: string; description: string; priceCents: number; quantity: number;
  condition: Condition; photoPath: string | null; status: 'open' | 'pending' | 'sold' | 'removed';
  buyerId: string | null; saleCents: number | null; createdAt: string;
};

/** One buyer's place in line: a Dibs, or an Offer and the seller's counter. */
export type MarketLine = {
  id: string; listingId: string; buyerId: string; kind: 'dibs' | 'offer'; offerCents: number | null;
  counterCents: number | null; message: string | null; agreedCents: number | null; createdAt: string;
  status: 'agreed' | 'offered' | 'countered' | 'declined' | 'withdrawn' | 'selected';
};

export type MarketTerms = { version: number; text: string; accepted: boolean; eligible: boolean };

/**
 * A volunteer opportunity. `kind` 'help' asks for people's time (sign-ups, optional
 * `spots`); 'items' asks for things: `quantity` of `item` ("24 boxes of tissues"),
 * brought by `startsOn`, which people pledge toward.
 */
export type Opportunity = {
  id: string; leadId: string; title: string; description: string; startsOn: string; endsOn: string | null;
  startTime: string | null; endTime: string | null; location: string | null; spots: number | null;
  kind: 'help' | 'items'; item: string | null; quantity: number | null;
  status: 'open' | 'deleted'; deleteReason: string | null; createdAt: string;
};

/** Someone who said yes, or (for item requests) pledged `quantity`. */
export type Signup = { opportunityId: string; userId: string; createdAt: string; quantity: number | null };

export type VolunteerMessage = { id: string; opportunityId: string; authorId: string | null; body: string; createdAt: string };

/** How a school role reads on screen. */
export const ROLE_LABELS: Record<SchoolRole, string> = {
  admin: 'Admin', teacher: 'Teacher', staff: 'Staff', parent: 'Parent', student: 'Student', family: 'Family',
};

export const QUESTION_TOPICS = [
  'Academics', 'Attendance', 'Athletics', 'Fine Arts', 'Car Line', 'Health', 'Tuition & Billing', 'Uniforms', 'Technology', 'Other',
] as const;

export type QuestionTopic = typeof QUESTION_TOPICS[number];

export type SchoolQuestion = {
  id: string; askerId: string; topic: QuestionTopic; subject: string; status: 'new' | 'assigned' | 'answered' | 'closed';
  assigneeId: string | null; assignedAt: string | null; waitingSince: string | null; answeredAt: string | null;
  createdAt: string; updatedAt: string;
};

export type QuestionMessage = { id: string; questionId: string; authorId: string | null; fromSchool: boolean; body: string; createdAt: string };

export type ParentRelation = 'mother' | 'father';

/** A parent's link to a student, or (pickupOnly) a Family account's car line link. */
export type FamilyLink = { guardianId: string; studentId: string; guardianName: string; studentName: string; studentGrade: number | null; pickupOnly?: boolean };

/** A critical alert to every teacher and staff member (severe weather, an active threat, a dangerous situation). */
export type CriticalAlert = {
  id: string; kind: AlertKind; title: string; body: string; createdBy: string | null; createdAt: string;
  endedAt: string | null; endedBy: string | null; endNote: string | null;
};

export type AlertAnswer = { alertId: string; userId: string; status: 'safe' | 'help'; note: string | null; updatedAt: string };

/** For the senders: one teacher or staff member and their answer ('none' = hasn't answered). */
export type AlertStatusRow = { id: string; name: string; role: SchoolRole; status: 'safe' | 'help' | 'none'; note: string | null; updatedAt: string | null };

export type Access = { tier: string | null; roleName: string | null; isDirector: boolean; granted: string[]; permissions: string[]; mfaRequired: boolean; mfaVerified: boolean };

export type PermissionInfo = { key: string; label: string; description: string };

export type AdminPerson = Person & { adminTier: string | null; granted: string[] };

export type AdminRole = { id: string; name: string; description: string; permissions: string[]; isSystem: boolean };

export type PeopleFilter = 'all' | 'pending' | 'staff' | 'parents' | 'family' | 'students' | 'admins';

export type Notice = { id: string; title: string; body: string; data: Record<string, unknown>; createdAt: string; status: string; sentCount: number; audience: string };

export type MySettings = {
  pushSchool: boolean; pushGroups: boolean; pushReplies: boolean; pushMarketplace: boolean; pushVolunteer: boolean;
  quietStart: string | null; quietEnd: string | null;
};

export type GroupPref = { groupId: string; name: string; icon: string; pref: 'all' | 'mentions' | 'none' };

export type PostStats = {
  postId: string; groupId: string; title: string; createdAt: string;
  audience: number; viewers: number; views: number; reactions: Record<string, number>;
  replies: number; repliers: number; pollVotes: number; score: number; followers: number;
  notificationOpens: number; pushDevices: number;
  byDay: { day: string; viewers: number }[];
  seenBy: { name: string; role: string; at: string }[];
};

export type GroupPostStat = { postId: string; title: string; kind: string; createdAt: string; author: string; viewers: number; audience: number; reactions: number; replies: number };

export type Child = {
  id: string; firstName: string; lastName: string; grade: number | null; gradeLabel: string | null; classOf: number | null;
  photoPath: string | null; photo: string; hasLogin: boolean; pickupNumber: string | null;
  birthday: string | null; bio: string; allergies: string; medicalNotes: string; parents: string[];
};

export type FamilyRequest = {
  id: string; kind: 'add_child' | 'edit_child'; status: string; createdAt: string; studentId: string | null;
  details: { firstName: string; lastName: string; grade: number; birthday?: string | null; note?: string | null; relation?: ParentRelation | null };
  decisionNote?: string | null;
};

export type AdminStudent = {
  id: string; firstName: string; lastName: string; grade: number | null; gradeLabel: string | null; classOf: number | null;
  /** Parents, then Family accounts (`family`: car line pickup only). */
  managed: boolean; photoPath: string | null; parents: { id: string; name: string; family?: boolean }[];
};

export type AdminFamilyRequest = {
  id: string; kind: 'add_child' | 'edit_child'; createdAt: string; details: FamilyRequest['details'];
  requestedBy: { id: string; name: string; role: string };
  student: { id: string; firstName: string; lastName: string; grade: number | null } | null;
  /** Existing students this "add a child" request looks like, best first. */
  matches: SimilarStudent[];
  /** Other parents' waiting requests for what looks like the same child. */
  similarRequests: { id: string; from: string; relation: string | null; name: string }[];
};

export type SimilarStudent = {
  id: string; score: number; strong: boolean; name: string; gradeLabel: string | null; birthday: string | null;
  parents: { name: string; relation: string | null }[];
};

export type PickupRelationship = 'grandparent' | 'aunt_uncle' | 'sibling' | 'stepparent' | 'family_friend' | 'nanny' | 'carpool' | 'other';

export type ApprovedPickup = {
  id: string; personId: string; name: string; relationship: PickupRelationship; label: string;
  startsOn: string; endsOn: string | null; pending: boolean; active: boolean; grantedBy: string;
};

export type ChildPickupPeople = {
  parents: { id: string; name: string; relation: ParentRelation | null }[];
  family: { id: string; name: string }[];
  approved: ApprovedPickup[];
};

// Students: Ask the Teacher, Assignments, and the class sections they use

/** For a student: one of their teachers (from their class sections), and their conversation if it's started. */
export type TeacherContact = {
  teacherId: string; teacherName: string; classes: string;
  threadId: string | null; lastMessageAt: string | null; lastBody: string | null; unread: boolean;
};

/** A student–teacher conversation: the person's own, their child's (parents), or any (messages.review). */
export type TeacherConversation = {
  id: string; studentId: string; studentName: string; teacherId: string; teacherName: string;
  lastMessageAt: string; lastBody: string | null; unread: boolean;
};

export type ClassStudent = { studentId: string; studentName: string; grade: number | null; classes: string };

export type TeacherMessage = { id: string; authorId: string | null; body: string; createdAt: string };

export type TeacherThread = {
  id: string; studentId: string; teacherId: string; studentName: string; teacherName: string;
  /** Only the student and the teacher write; parents and reviewers read. */
  canWrite: boolean; messages: TeacherMessage[];
};

/** A class assignment (`rosterId`, from its teacher) or a student's own; `done` is the student's own check. */
export type Assignment = {
  id: string; rosterId: string | null; className: string | null; ownerId: string; title: string; details: string;
  dueOn: string | null; createdAt: string; done: boolean;
};

/** For a parent: one of their child's class assignments (never the child's own entries or check-offs). */
export type ChildAssignment = { id: string; studentId: string; rosterId: string; className: string; title: string; details: string; dueOn: string };

export type Section = { id: string; name: string; students: number };

/** A form question: yes/no, short answer, or one of a few choices. */
export type FormQuestion = { id: string; kind: 'yes_no' | 'text' | 'choice'; prompt: string; required: boolean; options: string[] };
/** A parent's signature for one child: agreed or declined, the answers (by question id) and the typed name. */
export type FormSignature = { agreed: boolean; answers: Record<string, string>; signature: string; signedAt: string; signedBy: string | null };
export type FormAudience = 'section' | 'season' | 'grades' | 'school';
export type PaymentMethod = 'cash' | 'check' | 'card' | 'online' | 'other';
/** A fee paid for one child, as the form's sender recorded it; `note` and `recordedBy` only for the sender. */
export type FormPayment = { amountCents: number; method: PaymentMethod; deliveredTo: string; receivedOn: string; note?: string; recordedBy?: string | null };
/** A permission slip, release or acknowledgment. `sentTo` names the class, activity season or grades. */
export type SchoolForm = {
  id: string; title: string; details: string; link: string | null; dueOn: string; status: 'open' | 'closed';
  questions: FormQuestion[]; audience: FormAudience; sentTo: string | null; author: string | null; authorId: string | null; createdAt: string;
  /** The fee per child, or null for none. */
  feeCents: number | null;
};
/** For a parent: a form and each of their children it went to. */
export type MyForm = SchoolForm & { children: { studentId: string; name: string; response: FormSignature | null; payment: FormPayment | null }[] };
/** For a sender: a form they sent, with counts. */
export type SentForm = SchoolForm & { students: number; agreed: number; declined: number; paid: number; collectedCents: number };
/** For a sender: every student a form went to and their signature (or none yet). */
export type FormStatus = SchoolForm & {
  students: { studentId: string; name: string; grade: number | null; hasParent: boolean; response: FormSignature | null; payment: FormPayment | null }[];
};
export type NewForm = {
  title: string; details: string; link: string; dueOn: string; audience: FormAudience;
  sectionId?: string | null; seasonId?: string | null; grades?: number[] | null;
  questions: Omit<FormQuestion, 'id'>[];
  feeCents?: number | null;
};

/** Class sections in the admin portal (people.family). */
export type AdminSection = { id: string; name: string; leadId: string | null; leadName: string | null; students: number };

export type SectionStudent = { id: string; firstName: string; lastName: string; grade: number | null; hasLogin: boolean };
