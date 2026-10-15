"""Generate mock database for Royals Connect (the group communication app)."""
import json, os, sys, copy
from datetime import datetime, timedelta

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
NOW = datetime(2026, 10, 14, 19, 0)
META = {"mock": True, "generatedAt": "2026-10-14"}
def ts(**kw): return (NOW - timedelta(**kw)).isoformat() + "-05:00"
def write(name, key, data):
    with open(os.path.join(OUT, f"{name}.json"), "w") as f:
        json.dump({"_meta": META, key: data}, f, indent=2)

staff = json.load(open(os.path.join(OUT, "demo-staff.json")))["staff"]
def st(title): return next(s for s in staff if s["title"] == title)

# ---------- presets (mirror src/comms/presets.ts) ----------
P = {
  "chat": dict(viewContent="members", post="members", comment="members", react="members", askQuestion="members", answerQuestion="members", attachFiles="members", createPolls="members", pin="moderators", seeMemberList="members", directMessageMembers="moderators", mentionEveryone="moderators"),
  "forum": dict(viewContent="members", post="members", comment="members", react="members", askQuestion="members", answerQuestion="members", attachFiles="members", createPolls="moderators", pin="moderators", seeMemberList="members", directMessageMembers="nobody", mentionEveryone="moderators"),
  "broadcast": dict(viewContent="subscribers", post="moderators", comment="nobody", react="subscribers", askQuestion="nobody", answerQuestion="moderators", attachFiles="moderators", createPolls="moderators", pin="moderators", seeMemberList="moderators", directMessageMembers="nobody", mentionEveryone="owners"),
  "qa": dict(viewContent="members", post="moderators", comment="moderators", react="members", askQuestion="members", answerQuestion="moderators", attachFiles="moderators", createPolls="moderators", pin="moderators", seeMemberList="moderators", directMessageMembers="nobody", mentionEveryone="owners"),
}
def settings(mode, **over):
    perm_over = over.pop("permissions", {})
    s = dict(mode=mode, visibility="school" if mode == "broadcast" else "private",
             joinPolicy="open" if mode == "broadcast" else "assigned",
             permissions={**P[mode], **perm_over}, requirePostApproval=False,
             requireQuestionApproval=mode == "qa", allowAnonymousQuestions=False,
             slowModeSeconds=0, autoCloseCommentsAfterDays=None, locked=False, quietHours=None,
             contentFilter="standard", retainDeletedContent=True, membersCanLeave=mode == "broadcast",
             notificationDefault="all" if mode in ("chat", "broadcast") else "mentions")
    s.update(over)
    return s

# ---------- users ----------
users = [
  {"id": "u-admin", "firstName": st("Principal")["firstName"], "lastName": st("Principal")["lastName"], "schoolRole": "admin", "staffId": st("Principal")["id"]},
  {"id": "u-ap", "firstName": st("Assistant Principal")["firstName"], "lastName": st("Assistant Principal")["lastName"], "schoolRole": "admin", "staffId": st("Assistant Principal")["id"]},
  {"id": "u-eng", "firstName": st("English Teacher")["firstName"], "lastName": st("English Teacher")["lastName"], "schoolRole": "teacher", "staffId": st("English Teacher")["id"], "sectionIds": ["eng10-p3"]},
  {"id": "u-sci", "firstName": st("Science Teacher")["firstName"], "lastName": st("Science Teacher")["lastName"], "schoolRole": "teacher", "staffId": st("Science Teacher")["id"], "clubIds": ["club-03"]},
  {"id": "u-vbcoach", "firstName": st("Head Volleyball Coach")["firstName"], "lastName": st("Head Volleyball Coach")["lastName"], "schoolRole": "teacher", "staffId": st("Head Volleyball Coach")["id"], "teamIds": ["team-02"]},
  {"id": "u-couns", "firstName": st("Lead Counselor")["firstName"], "lastName": st("Lead Counselor")["lastName"], "schoolRole": "staff", "staffId": st("Lead Counselor")["id"]},
  {"id": "u-libr", "firstName": "Grace", "lastName": "Okafor", "schoolRole": "staff"},
]
students = [("Ava","Reyes",10,["eng10-p3"],["team-02"],[]), ("Liam","Chen",10,["eng10-p3"],[],["club-03"]),
            ("Mia","Brooks",10,["eng10-p3"],["team-02"],[]), ("Noah","Kim",10,["eng10-p3"],[],["club-03"]),
            ("Zoe","Ortiz",11,[],["team-02"],["club-03"]), ("Ethan","Park",11,[],[],["club-03"]),
            ("Chloe","Diaz",12,[],["team-02"],[]), ("Lucas","Ward",10,["eng10-p3"],[],[]),
            ("Emma","Shah",9,[],[],[]), ("Jack","Ross",12,[],[],["club-03"])]
for i, (f, l, g, sec, team, club) in enumerate(students):
    users.append({"id": f"u-s{i+1:02d}", "firstName": f, "lastName": l, "schoolRole": "student", "grade": g,
                  "sectionIds": sec, "teamIds": team, "clubIds": club})
parents = [("Rosa","Reyes",["u-s01"]), ("Wei","Chen",["u-s02"]), ("Dana","Brooks",["u-s03"]),
           ("Sun","Kim",["u-s04"]), ("Luis","Ortiz",["u-s05"]), ("Tara","Ward",["u-s08"]),
           ("Priya","Shah",["u-s09"]), ("Mark","Diaz",["u-s07"])]
for i, (f, l, kids) in enumerate(parents):
    users.append({"id": f"u-p{i+1:02d}", "firstName": f, "lastName": l, "schoolRole": "parent", "guardianOf": kids})
for u in users:
    u["avatar"] = f"https://i.pravatar.cc/120?u={u['id']}"
U = {u["id"]: u for u in users}

# ---------- groups ----------
groups = [
  dict(id="g-announce", name="Royals Announcements", icon="📣", color="#4B2A7B", category="school-wide",
       description="Official school news. Staff post; everyone is subscribed.", createdBy="u-admin",
       settings=settings("broadcast", visibility="public", membersCanLeave=False),
       assignmentRules=[{"id": "r-all", "assignAs": "subscriber"}]),
  dict(id="g-eng-p3", name="English 10 · Period 3", icon="📚", color="#2563EB", category="class",
       description="Class discussion board. Be kind, stay on topic.", createdBy="u-eng",
       settings=settings("forum", slowModeSeconds=30, autoCloseCommentsAfterDays=14,
                         quietHours={"start": "21:00", "end": "07:00", "appliesTo": ["member"]},
                         contentFilter="strict"),
       assignmentRules=[{"id": "r-p3", "sectionIds": ["eng10-p3"], "schoolRoles": ["student"], "assignAs": "member", "includeGuardiansAs": None}]),
  dict(id="g-eng-p3-parents", name="English 10 · P3 Parent Updates", icon="📝", color="#2563EB", category="class",
       parentGroupId="g-eng-p3", description="Weekly updates for families. Parents may comment.", createdBy="u-eng",
       settings=settings("broadcast", visibility="private", joinPolicy="assigned", permissions={"comment": "subscribers"}, requirePostApproval=False),
       assignmentRules=[{"id": "r-p3g", "sectionIds": ["eng10-p3"], "schoolRoles": ["student"], "assignAs": "subscriber", "includeGuardiansAs": "subscriber"}]),
  dict(id="g-c2029-parents", name="Class of 2029 Parents", icon="🎓", color="#0D9488", category="parents",
       description="Ask the grade-level team anything. Questions are screened before posting.", createdBy="u-ap",
       settings=settings("qa", allowAnonymousQuestions=True),
       assignmentRules=[{"id": "r-g10", "grades": [10], "schoolRoles": ["student"], "assignAs": "subscriber", "includeGuardiansAs": "member"}]),
  dict(id="g-vb", name="Varsity Volleyball", icon="🏐", color="#F2B705", category="athletics",
       description="Team chat: practice changes, rides, hype.", createdBy="u-vbcoach",
       settings=settings("chat", quietHours={"start": "22:00", "end": "06:00", "appliesTo": ["member"]}),
       assignmentRules=[{"id": "r-vb", "teamIds": ["team-02"], "schoolRoles": ["student"], "assignAs": "member", "includeGuardiansAs": None}]),
  dict(id="g-vb-parents", name="Volleyball Families", icon="🏐", color="#F2B705", category="athletics", parentGroupId="g-vb",
       description="Schedules and logistics for volleyball families. Polls for carpools.", createdBy="u-vbcoach",
       settings=settings("broadcast", visibility="private", joinPolicy="assigned", permissions={"comment": "subscribers", "createPolls": "moderators"}),
       assignmentRules=[{"id": "r-vbp", "teamIds": ["team-02"], "schoolRoles": ["student"], "assignAs": "subscriber", "includeGuardiansAs": "subscriber"}]),
  dict(id="g-robotics", name="Robotics Team 4021", icon="🤖", color="#DC2626", category="club",
       description="Build logs, design debates, competition prep.", createdBy="u-sci",
       settings=settings("forum", joinPolicy="request", permissions={"createPolls": "members"}),
       assignmentRules=[{"id": "r-rob", "clubIds": ["club-03"], "schoolRoles": ["student"], "assignAs": "member", "includeGuardiansAs": None}]),
  dict(id="g-faculty", name="Faculty Lounge", icon="☕", color="#64748B", category="staff",
       description="Staff-only chat.", createdBy="u-admin",
       settings=settings("chat", visibility="hidden", permissions={"directMessageMembers": "members", "mentionEveryone": "members"}, membersCanLeave=False),
       assignmentRules=[{"id": "r-staff", "schoolRoles": ["admin", "teacher", "staff"], "assignAs": "member"}]),
  dict(id="g-counsel", name="Ask a Counselor", icon="💬", color="#7C3AED", category="school-wide",
       description="Questions about schedules, college and careers. Ask anonymously if you prefer.", createdBy="u-couns",
       settings=settings("qa", visibility="school", joinPolicy="open", allowAnonymousQuestions=True, membersCanLeave=True),
       assignmentRules=[{"id": "r-stu", "schoolRoles": ["student"], "assignAs": "member"}]),
  dict(id="g-homecoming", name="Homecoming Committee", icon="👑", color="#BE185D", category="club",
       description="Planning chat. Locked by admin after an off-topic thread.", createdBy="u-ap",
       settings=settings("chat", locked=True, lockReason="Paused by Admin until Monday's meeting.", requirePostApproval=True),
       assignmentRules=[]),
]
for g in groups:
    g.setdefault("parentGroupId", None)
    g["createdAt"] = ts(days=40)
    g["tags"] = [g["category"], g["settings"]["mode"]]

# ---------- memberships (mirror src/comms/assignment.ts) ----------
RANK = ["owner", "moderator", "member", "subscriber"]
def matches(r, u):
    if "schoolRoles" in r and u["schoolRole"] not in r["schoolRoles"]: return False
    if "grades" in r and u.get("grade") not in r["grades"]: return False
    if "sectionIds" in r and not set(u.get("sectionIds", [])) & set(r["sectionIds"]): return False
    if "teamIds" in r and not set(u.get("teamIds", [])) & set(r["teamIds"]): return False
    if "clubIds" in r and not set(u.get("clubIds", [])) & set(r["clubIds"]): return False
    return True
memberships = []
manual = {  # owners/moderators added by hand
  "g-announce": [("u-admin","owner"),("u-ap","moderator"),("u-libr","moderator")],
  "g-eng-p3": [("u-eng","owner")], "g-eng-p3-parents": [("u-eng","owner")],
  "g-c2029-parents": [("u-ap","owner"),("u-eng","moderator"),("u-couns","moderator")],
  "g-vb": [("u-vbcoach","owner"),("u-s07","moderator")], "g-vb-parents": [("u-vbcoach","owner"),("u-p08","moderator")],
  "g-robotics": [("u-sci","owner"),("u-s10","moderator")], "g-faculty": [("u-admin","owner")],
  "g-counsel": [("u-couns","owner")],
  "g-homecoming": [("u-ap","owner"),("u-s07","member"),("u-s05","member"),("u-s09","member"),("u-s01","member")],
}
for g in groups:
    got = {}
    for uid, role in manual.get(g["id"], []):
        got[uid] = dict(role=role, source="manual")
    for r in g["assignmentRules"]:
        for u in users:
            if not matches(r, u): continue
            targets = [(u["id"], r["assignAs"])]
            if r.get("includeGuardiansAs"):
                targets += [(p["id"], r["includeGuardiansAs"]) for p in users if u["id"] in p.get("guardianOf", [])]
            for uid, role in targets:
                cur = got.get(uid)
                if cur and cur["source"] == "manual": continue
                if not cur or RANK.index(role) < RANK.index(cur["role"]):
                    got[uid] = dict(role=role, source="rule", ruleId=r["id"])
    for uid, m in got.items():
        memberships.append({"groupId": g["id"], "userId": uid, **m, "mutedUntil": None,
                            "notification": g["settings"]["notificationDefault"], "joinedAt": ts(days=30)})
# demonstrate per-member overrides
for m in memberships:
    if m["groupId"] == "g-eng-p3" and m["userId"] == "u-s08":
        m["canPost"] = False
    if m["groupId"] == "g-vb" and m["userId"] == "u-s03":
        m["mutedUntil"] = (NOW + timedelta(hours=20)).isoformat() + "-05:00"

# ---------- posts & comments ----------
posts, comments = [], []
def post(gid, author, kind, body, mins, title=None, **kw):
    p = dict(id=f"p-{len(posts)+1:03d}", groupId=gid, authorId=author, kind=kind, title=title, body=body,
             attachments=kw.pop("attachments", []), status=kw.pop("status", "published"), pinned=kw.pop("pinned", False),
             commentsLocked=False, acceptedAnswerId=None, score=kw.pop("score", 0), reactions=kw.pop("reactions", {}),
             scheduledFor=kw.pop("scheduledFor", None), createdAt=ts(minutes=mins), editedAt=None, **kw)
    posts.append(p); return p["id"]
def comment(pid, author, body, mins, parent=None, isAnswer=False, score=0, status="published"):
    c = dict(id=f"c-{len(comments)+1:03d}", postId=pid, parentCommentId=parent, authorId=author, body=body,
             status=status, isAnswer=isAnswer, score=score, createdAt=ts(minutes=mins))
    comments.append(c); return c["id"]

# Announcements
a1 = post("g-announce","u-admin","announcement","Early release this Friday, Oct 16. Dismissal at 12:30 PM. Buses run 2.5 hours early.",180,
          "Early Release Friday", pinned=True, reactions={"👍":["u-p01","u-p02","u-s01"],"🙏":["u-p03"]})
post("g-announce","u-libr","announcement","The fall book fair opens Monday in the library. Open during all lunches and until 4:30 PM.",1440,"Book Fair Next Week",
     attachments=[{"type":"image","url":"https://picsum.photos/seed/bookfair/800/450"}], reactions={"📚":["u-s09","u-p07"]})
post("g-announce","u-ap","announcement","Congratulations to Varsity Volleyball, district champions!",2880,"District Champs!",
     reactions={"🎉":["u-s01","u-s02","u-p05","u-eng"],"👑":["u-s07"]})
post("g-announce","u-admin","announcement","Picture retakes are Nov 4.",0,"Picture Retakes", status="scheduled",
     scheduledFor=(NOW + timedelta(days=7)).isoformat()+"-05:00")

# English forum
t1 = post("g-eng-p3","u-eng","thread","Is Gatsby a tragic hero, or just a guy who refused to let go? Make your case with one quote.",600,
          "Discussion: Is Gatsby a tragic hero?", pinned=True, score=12)
c1 = comment(t1,"u-s02","Tragic hero. He believes he can rebuild the past, and that belief is what destroys him.",560,score=7)
comment(t1,"u-s01","Agree with Liam, but I'd say his flaw is that he never sees Daisy as she really is.",540,parent=c1,score=4)
comment(t1,"u-s04","Hot take: Nick is the real protagonist.",500,score=5)
t2 = post("g-eng-p3","u-s03","thread","Does the essay need MLA heading or just our name?",300,"Essay formatting question",score=3)
comment(t2,"u-eng","Full MLA heading please. Template is in the files tab.",280,isAnswer=True,score=6)
posts[-1]["acceptedAnswerId"] = comments[-1]["id"]
post("g-eng-p3","u-s04","thread","Can we have a study group before the test?",60,"Study group?",status="pending")
post("g-eng-p3","u-eng","poll","",120,"When should the essay be due?",
     poll={"question":"Pick a due date","options":[{"id":"o1","label":"Fri Oct 23","votes":["u-s01","u-s02"]},{"id":"o2","label":"Mon Oct 26","votes":["u-s03","u-s04","u-s08"]}],
           "closesAt":(NOW + timedelta(days=2)).isoformat()+"-05:00"})

# English parent updates
pu = post("g-eng-p3-parents","u-eng","announcement","This week: finishing The Great Gatsby. Essay due Oct 26. Reading quiz Thursday.",900,"Week of Oct 12",pinned=True)
comment(pu,"u-p01","Thanks! Is the essay typed or handwritten?",850)
comment(pu,"u-eng","Typed, submitted on Canvas.",820)

# Class of 2029 Parents Q&A
q1 = post("g-c2029-parents","u-p01","question","When will PSAT scores be released?",2000,"PSAT scores")
comment(q1,"u-couns","Scores post to the College Board site in early December. We'll send a how-to guide.",1900,isAnswer=True)
posts[-1]["acceptedAnswerId"] = comments[-1]["id"]
post("g-c2029-parents",None,"question","Is there a policy on phones during lunch?",400,"Phones at lunch", anonymous=True)
post("g-c2029-parents","u-p03","question","Can my son switch electives mid-semester?",30,"Elective switch",status="pending")

# Volleyball chat
for i, (who, msg) in enumerate([("u-vbcoach","Practice moved to 6:30 AM tomorrow, main gym."),("u-s01","🫡"),
                                 ("u-s05","Can someone bring the speaker?"),("u-s07","I got it"),
                                 ("u-vbcoach","Great work tonight. Ice and sleep, Royals 👑"),("u-s01","LET'S GO 🏐")]):
    post("g-vb", who, "message", msg, 120 - i * 15, reactions={"🔥":["u-s05"]} if i == 4 else {})
pp = post("g-vb-parents","u-vbcoach","poll","",500,"Carpool for Saturday's away game",
          poll={"question":"Can you drive Saturday?","options":[{"id":"o1","label":"Yes, 3+ seats","votes":["u-p01"]},{"id":"o2","label":"Yes, 1–2 seats","votes":["u-p05"]},{"id":"o3","label":"No","votes":["u-p03"]}]})
comment(pp,"u-p08","I can take 4 if we leave by 7.",450)

# Robotics forum
r1 = post("g-robotics","u-s10","thread","Mecanum vs. tank drive for state? We have 3 weeks.",1500,"Drive train for state",score=9)
comment(r1,"u-s05","Mecanum. Strafing won us 2 matches at regionals.",1450,score=6)
comment(r1,"u-sci","Whatever you choose, freeze the design by Oct 23.",1400,score=8)
post("g-robotics","u-s02","thread","Build log #14: arm gearbox reprinted, slipping fixed.",200,"Build log #14",
     attachments=[{"type":"image","url":"https://picsum.photos/seed/robot/800/450"}],score=4)

# Faculty
for i, (who, msg) in enumerate([("u-admin","Reminder: PD agendas are in the shared drive."),("u-eng","Coffee in the lounge is fresh ☕"),("u-sci","Who has the cart of Chromebooks?")]):
    post("g-faculty", who, "message", msg, 90 - i * 20)

# Counselor
c_q = post("g-counsel",None,"question","How many AP classes is too many junior year?",3000,"AP course load",anonymous=True)
comment(c_q,"u-couns","It depends on your other commitments. 2–3 is typical; come by drop-in hours and we'll plan it together.",2900,isAnswer=True)
posts[-1]["acceptedAnswerId"] = comments[-1]["id"]

# Homecoming (locked)
post("g-homecoming","u-s07","message","Theme vote is tomorrow!",4000)
post("g-homecoming","u-ap","announcement","Pausing this chat until Monday's meeting. See you there.",3000,"Chat paused",pinned=True)

for p in posts: p.setdefault("anonymous", False)

audit = [
  {"id":"a-1","groupId":"g-homecoming","actorId":"u-ap","action":"group.locked","detail":{"reason":"Paused by Admin until Monday's meeting."},"at":ts(minutes=3000)},
  {"id":"a-2","groupId":"g-eng-p3","actorId":"u-eng","action":"member.muted","targetId":"u-s08","detail":{"canPost":False},"at":ts(days=2)},
  {"id":"a-3","groupId":"g-vb","actorId":"u-vbcoach","action":"member.muted","targetId":"u-s03","detail":{"hours":20},"at":ts(hours=4)},
  {"id":"a-4","groupId":"g-eng-p3","actorId":"u-eng","action":"settings.updated","detail":{"slowModeSeconds":[0,30]},"at":ts(days=5)},
]
roster = {"sections":[{"id":"eng10-p3","name":"English 10 – Period 3","teacherId":"u-eng"}],
          "teams":[{"id":"team-02","name":"Volleyball","coachId":"u-vbcoach"}],
          "clubs":[{"id":"club-03","name":"Robotics","sponsorId":"u-sci"}]}

write("users","users",users); write("groups","groups",groups); write("memberships","memberships",memberships)
write("posts","posts",posts); write("comments","comments",comments); write("audit-log","events",audit); write("roster","roster",roster)
print(len(users),"users",len(groups),"groups",len(memberships),"memberships",len(posts),"posts",len(comments),"comments")
