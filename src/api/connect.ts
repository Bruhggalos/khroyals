/** Public API facade. Domain implementations, transport and DTOs live beside it. */
export { live } from './client';
export { errorText, isNetworkError } from './errors';
export { Abilities, GroupView, Person, GroupEvent, NewEvent, DressDay, Member, Pickup, PickupVehicle, CarlineConfig, Spot, BoardRow, Arrival, Vehicle, Sport, SportSeason, SportEventKind, SportEvent, SportRegistration, MySport, SportRsvp, SportAttendance, Condition, Listing, MarketLine, MarketTerms, Opportunity, Signup, VolunteerEvent, VolunteerMessage, ROLE_LABELS, QUESTION_TOPICS, QuestionTopic, SchoolQuestion, QuestionMessage, ParentRelation, FamilyLink, CriticalAlert, AlertAnswer, AlertStatusRow, AccessPoint, Access, CheckinStudent, SchoolCheck, CheckoutPerson, CheckoutListSummary, CheckoutList, AttendanceMark, ClassRollSummary, RollCheck, RollStudent, ClassRoll, SubDay, SubOptions, TicketKind, TicketEvent, MyTicket, TicketSale, TicketSetup, AdmitResult, PermissionInfo, AdminPerson, AdminRole, PeopleFilter, Notice, MySettings, GroupPref, PostStats, GroupPostStat, Child, FamilyRequest, AdminStudent, AdminFamilyRequest, SimilarStudent, PickupRelationship, ApprovedPickup, ChildPickupPeople, PickupTransfer, PickupAsk, PickupTransfers, TeacherContact, TeacherConversation, ClassStudent, TeacherMessage, TeacherThread, Assignment, ChildAssignment, Section, MyCalendarItem, StudentEvent, Feedback, FeedbackWorkshop, FormQuestion, FormSignature, FormAudience, FormPayment, PaymentMethod, SchoolForm, MyForm, SentForm, FormStatus, NewForm, AdminSection, SectionStudent } from './types';
export { session, me, getUser, listUsers, signOut, hasSignIn, onAuthChange, setMockUser } from './session';
export { marketPhotoUrls } from './storage';
export { listMyGroups, listDiscoverableGroups, getGroup, getComments, createPost, addComment, moderatePost, toggleReaction, votePoll, updateGroupSettings, createGroup, joinGroup, leaveGroup, listMembers, setMembership, subscribeGroup } from './groups';
export { listEvents, createEvent, deleteEvent, editableCalendars, listDressDays, saveDressDay, deleteDressDay, schoolBreaks } from './calendar';
export { listAlbums, listCategories, getAlbum, saveAlbum, saveCategory, deleteCategory, addGalleryPhotos, deleteGalleryPhoto, deleteAlbum, leaveAlbum, albumPeople, setAlbumMember, makeEventAlbum, eventAlbumId, type AlbumPerson, type GalleryAlbum, type GalleryCategory, type AlbumVisibility, type GalleryPhoto, type NewGalleryPhoto } from './gallery';
export { issueDate, listNewsletters, getNewsletter, importNewsletter, deleteNewsletter, type NewsletterSummary, type NewsletterIssue, type NewsBlock, type Span } from './news';
export { onCarlineDuty, canManageSport, canBuyTickets, canVolunteer, isFamily, isSchoolStaff, isSubstitute, isVolunteerLead } from './policy';
export { myChildren, carlineToday, carlineAnnounce, myVehicles, saveVehicle, deleteVehicle, chooseVehicle, carlineCancel, carlineConfirm, carlineReopen, carlineConfig, carlineArrived, carlineBoard, carlineSetConfig, carlineOpenNow, carlineSetFestive, setPickupNumber, pickupNumbers, subscribeCarline, createCarPass, revokeCarPass } from './carline';
export { listSports, sportSchedule, mySports, mySportSchedule, sportRegistrations, followSport, saveSport, deleteSport, setSportCoach, saveSeason, deleteSeason, saveSportEvent, cancelSportEvent, deleteSportEvent, registerForSport, withdrawSportRegistration, decideSportRegistration, myRsvps, answerRsvp, eventAttendance, uploadSportPhoto, removeSportPhoto, subscribeSports } from './activities';
export { marketTerms, acceptMarketTerms, listMarket, getListing, uploadMarketPhoto, marketPost, marketRemove, marketDibs, marketOffer, marketAnswerOffer, marketAnswerCounter, marketWithdraw, marketSelect, marketComplete, marketCancelSale, subscribeMarket } from './market';
export { listVolunteer, listVolunteerEvents, getOpportunity, volunteerPost, volunteerEventSave, volunteerEventDelete, volunteerEventReorder, volunteerSetEvent, volunteerSayYes, volunteerPledge, volunteerWithdraw, volunteerDelete, volunteerSend, adminSetVolunteerLead, subscribeVolunteer } from './volunteer';
export { listQuestions, getQuestion, askSchool, questionReply, questionAssign, questionClose, subscribeQuestions } from './questions';
export { adminUpdateProfile, adminLinkGuardian, adminSetParentRelation, adminSetCarlineDuty, adminFamilyLinks, listAudit, permissionCatalog, adminListPeople, adminRoles, adminSaveRole, adminDeleteRole, adminSetAccess, adminSetDirector, adminDeleteUser, transferDirector } from './admin';
export { NoAccountError, sendEmailCode, authRedirectUrl, completeSignInFromUrl, verifyEmailCode, ssoProviders, signInWithGoogle, signInWithApple, mfaStatus, mfaEnroll, mfaVerify } from './auth';
export { listAlerts, myAlertAnswers, sendCriticalAlert, answerAlert, endAlert, alertStatus, shareAlertLocation, myLocationConsent, setLocationConsent, listAccessPoints, saveAccessPoint, deleteAccessPoint, importAccessPoints, subscribeAlerts } from './alerts';
export { myAccess } from './access';
export {
  checkinStudents, checkinToday, schoolCheck, undoSchoolCheck, checkoutPeople, myCheckoutLists, checkoutList, checkoutEventOptions,
  checkoutMyStudents, saveCheckoutList, checkoutListForEvent, deleteCheckoutList, releaseStudent, unreleaseStudent,
} from './checkin';
export { myClassAttendance, attendanceOverview, classRoll, markAttendance } from './attendance';
export { mySubDays, subSchedule, subOptions, saveSubDay, deleteSubDay } from './subs';
export {
  ticketSetup, ticketsOnSale, ticketEvent, saveTicketEvent, ticketSales, admitTicket, myTickets, startTicketCheckout, ticketOrderStatus,
  cancelTicketOrder, walletLink,
} from './tickets';
export { listNotifications, myNotifications, unreadNotificationCount, subscribeNotifications, sendNotification, setNotificationPref, registerPushToken, unregisterPushToken, markNotificationsOpened, openedNotifications, notificationOpenCounts, dismissNotifications, clearMyNotifications } from './notifications';
export { updateMyName, uploadMyAvatar, removeMyAvatar, adminClearAvatar, mySettings, updateMySettings, myGroupPrefs } from './profile';
export { recordPostViews, postStats, groupPostStats, myFollows, setPostFollow } from './stats';
export { myChildProfiles, updateChildDetails, uploadChildPhoto, removeChildPhoto, requestChild, requestChildEdit, cancelFamilyRequest, myFamilyRequests, studentLoginStatus, giveStudentLogin, removeStudentLogin, type StudentLogin } from './children';
export { adminListStudents, adminCreateStudent, adminUpdateStudent, adminDeleteStudent, adminSimilarStudents, adminFamilyRequests, adminDecideFamilyRequest } from './adminStudents';
export { childPickupPeople, addPickupPerson, removePickupPerson, myPickupChildren, pickupTransferPeople, transferPickup, answerPickupTransfer, cancelPickupTransfer, pickupTransfers } from './pickup';
export { myTeachers, teacherConversations, myClassStudents, teacherThread, teacherThreadFor, teacherSend, teacherThreadRead, subscribeTeacherMessages } from './teachers';
export { listFeedback, sendFeedback, triageFeedback, listWorkshops, saveWorkshop, deleteWorkshop } from './feedback';
export { myCalendar, studentEvents, savePersonalEvent, deletePersonalEvent, planStudentEvent } from './myCalendar';
export { listAssignments, childAssignments, addAssignment, deleteAssignment, checkAssignment, mySections, subscribeAssignments } from './assignments';
export { myForms, sentForms, formStatus, sendForm, signForm, remindForm, closeForm, recordPayment, clearPayment } from './forms';
export { adminListSections, adminSectionStudents, adminSaveSection, adminSectionMember, adminDeleteSection } from './classes';
