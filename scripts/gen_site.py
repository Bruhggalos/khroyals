"""Generate per-page mock database for the KH Royals school site.

All content is PLACEHOLDER: khroyals.com blocks automated fetching, so these
files mirror the structure of a typical K-12 school site. Replace values with
real content later; the schema stays the same.
"""
import json, os, sys, random
from datetime import date, timedelta

random.seed(42)
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
TODAY = date(2026, 10, 14)
MOCK = {"mock": True, "source": "https://www.khroyals.com/", "generatedAt": "2026-10-14"}

def write(name, data):
    with open(os.path.join(OUT, f"{name}.json"), "w") as f:
        json.dump({"_meta": MOCK, **data}, f, indent=2)

def d(offset):
    return (TODAY + timedelta(days=offset)).isoformat()

# ---------- shared site config ----------
nav = [
    {"id": "home", "label": "Home", "route": "/"},
    {"id": "about", "label": "About", "route": "/about"},
    {"id": "news", "label": "News", "route": "/news"},
    {"id": "calendar", "label": "Calendar", "route": "/calendar"},
    {"id": "academics", "label": "Academics", "route": "/academics"},
    {"id": "athletics", "label": "Athletics", "route": "/athletics"},
    {"id": "activities", "label": "Clubs & Activities", "route": "/activities"},
    {"id": "staff", "label": "Staff Directory", "route": "/staff"},
    {"id": "parents", "label": "Parents", "route": "/parents"},
    {"id": "students", "label": "Students", "route": "/students"},
    {"id": "enrollment", "label": "Enrollment", "route": "/enrollment"},
    {"id": "dining", "label": "Lunch Menu", "route": "/dining"},
    {"id": "contact", "label": "Contact", "route": "/contact"},
]
write("site", {
    "school": {
        "name": "KH Royals", "shortName": "KHR", "mascot": "Royals",
        "colors": {"primary": "#4B2A7B", "secondary": "#F2B705", "ink": "#1B1530"},
        "logo": "assets/logo.png", "tagline": "Once a Royal, always a Royal.",
        "address": {"line1": "100 Royal Way", "city": "Placeholder", "state": "TX", "zip": "00000"},
        "phone": "(555) 010-2000", "fax": "(555) 010-2001", "email": "info@khroyals.example",
        "hours": "Mon–Fri 7:30 AM – 4:00 PM",
    },
    "navigation": nav,
    "footerLinks": [
        {"label": "Non-Discrimination Notice", "url": "/legal/non-discrimination"},
        {"label": "Accessibility", "url": "/legal/accessibility"},
        {"label": "Privacy Policy", "url": "/legal/privacy"},
    ],
    "social": [
        {"network": "facebook", "url": "https://facebook.com/example"},
        {"network": "instagram", "url": "https://instagram.com/example"},
        {"network": "x", "url": "https://x.com/example"},
        {"network": "youtube", "url": "https://youtube.com/example"},
    ],
    "alertBanner": {"active": True, "level": "info",
                     "message": "Early release Friday, Oct 16 — dismissal at 12:30 PM.",
                     "link": "/news/early-release-oct-16", "expiresAt": d(2)},
})

# ---------- news ----------
news_seed = [
    ("Royals Volleyball Clinches District Title", "athletics", "The varsity volleyball team swept its final match to claim the district championship."),
    ("Fall Book Fair Opens Monday", "events", "The library hosts the fall book fair all week during lunch and after school."),
    ("Early Release Friday, Oct 16", "announcements", "Students will dismiss at 12:30 PM for teacher professional development."),
    ("Band Earns Superior Rating at Marching Contest", "fine-arts", "The Royal Regiment earned a Division I rating at the regional marching contest."),
    ("Parent-Teacher Conferences Sign-Up Open", "announcements", "Schedule a 15-minute conference slot through the parent portal."),
    ("Robotics Team Advances to State", "academics", "Team 4021 placed second at regionals and qualified for the state championship."),
    ("Flu Shot Clinic Oct 22", "health", "The school nurse is hosting a free flu shot clinic with parental consent."),
    ("Homecoming Week Dress-Up Days Announced", "student-life", "Student council released the spirit-day themes for homecoming week."),
    ("New Counseling Office Hours", "counseling", "Counselors now hold drop-in hours before school on Tuesdays and Thursdays."),
    ("Senior Portraits Due Nov 1", "seniors", "Yearbook portraits for seniors must be submitted by November 1."),
    ("Theater Presents 'The Royal Mystery'", "fine-arts", "The fall play opens Nov 6 in the auditorium; tickets on sale now."),
    ("Cafeteria Adds Grab-and-Go Breakfast", "dining", "Breakfast carts now open at each entrance from 7:15 to 7:45 AM."),
]
authors = ["Communications Office", "Athletics Dept.", "Principal's Office", "Fine Arts Dept."]
articles = []
for i, (title, cat, summary) in enumerate(news_seed):
    slug = title.lower().replace("'", "").replace(",", "").replace(" ", "-")
    articles.append({
        "id": f"news-{i+1:03d}", "slug": slug, "title": title, "category": cat,
        "summary": summary,
        "body": [
            {"type": "paragraph", "text": summary},
            {"type": "paragraph", "text": "Placeholder body copy. Replace with the article text from the live site."},
        ],
        "heroImage": f"https://picsum.photos/seed/khr{i}/1200/630",
        "author": random.choice(authors), "publishedAt": d(-i * 2), "featured": i < 3,
        "tags": [cat],
    })
write("news", {"page": {"id": "news", "title": "News", "route": "/news"},
               "categories": sorted({a["category"] for a in articles}),
               "articles": articles, "pagination": {"pageSize": 10, "total": len(articles)}})

# ---------- calendar ----------
ev_seed = [
    ("Early Release", "district", 2, None, "All campus"),
    ("Volleyball vs. Eagles", "athletics", 3, "18:00", "Main Gym"),
    ("Football vs. Mustangs (Homecoming)", "athletics", 9, "19:00", "Royal Stadium"),
    ("PTO Meeting", "parents", 5, "18:30", "Library"),
    ("Flu Shot Clinic", "health", 8, "09:00", "Nurse's Office"),
    ("Fall Book Fair", "events", 5, "07:30", "Library"),
    ("Parent-Teacher Conferences", "academics", 14, "13:00", "Classrooms"),
    ("Band Fall Concert", "fine-arts", 20, "19:00", "Auditorium"),
    ("Theater: The Royal Mystery", "fine-arts", 23, "19:00", "Auditorium"),
    ("Veterans Day Assembly", "events", 28, "10:00", "Main Gym"),
    ("Thanksgiving Break (No School)", "district", 40, None, "All campus"),
    ("Robotics State Championship", "academics", 45, "08:00", "Off-site"),
]
events = []
for i, (t, cat, off, time, loc) in enumerate(ev_seed):
    events.append({
        "id": f"evt-{i+1:03d}", "title": t, "category": cat, "date": d(off),
        "startTime": time, "endTime": None, "allDay": time is None, "location": loc,
        "description": f"{t}. Placeholder description.", "rsvp": cat in ("parents", "academics"),
    })
write("calendar", {"page": {"id": "calendar", "title": "Calendar", "route": "/calendar"},
                   "categories": sorted({e["category"] for e in events}),
                   "icsFeed": "https://www.khroyals.com/calendar.ics", "events": events})

# ---------- staff ----------
first = ["Maria","James","Linda","Robert","Patricia","Michael","Jennifer","David","Elizabeth","William",
         "Susan","Richard","Jessica","Joseph","Sarah","Thomas","Karen","Charles","Nancy","Daniel",
         "Lisa","Matthew","Betty","Anthony","Sandra","Mark","Ashley","Steven","Kimberly","Paul"]
last = ["Garcia","Johnson","Nguyen","Smith","Patel","Brown","Williams","Davis","Lopez","Miller",
        "Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Clark",
        "Lewis","Walker","Hall","Young","Allen","King","Wright","Scott","Green","Baker"]
depts = [("Administration", ["Principal","Assistant Principal","Assistant Principal"]),
         ("Counseling", ["Lead Counselor","Counselor","College & Career Advisor"]),
         ("English", ["English Teacher"]*3), ("Mathematics", ["Math Teacher"]*3),
         ("Science", ["Science Teacher"]*3), ("Social Studies", ["Social Studies Teacher"]*3),
         ("Fine Arts", ["Band Director","Choir Director","Art Teacher","Theater Director"]),
         ("Athletics", ["Athletic Director","Head Football Coach","Head Volleyball Coach"]),
         ("Special Education", ["SPED Coordinator","SPED Teacher"]),
         ("Front Office", ["Registrar","Attendance Clerk","Receptionist"]),
         ("Health Services", ["School Nurse"])]
staff, n = [], 0
for dept, titles in depts:
    for title in titles:
        fn, ln = first[n % 30], last[(n * 7) % 30]
        n += 1
        staff.append({"id": f"staff-{n:03d}", "firstName": fn, "lastName": ln,
                      "title": title, "department": dept,
                      "email": f"{fn[0].lower()}{ln.lower()}@khroyals.example",
                      "phone": f"(555) 010-{2100+n}", "room": None if dept in ("Administration","Front Office") else f"{100+n}",
                      "photo": f"https://i.pravatar.cc/200?u=khr{n}", "website": None})
write("staff", {"page": {"id": "staff", "title": "Staff Directory", "route": "/staff"},
                "departments": [d_[0] for d_ in depts], "staff": staff})

def staff_by(title):
    s = next(x for x in staff if x["title"] == title)
    return {"staffId": s["id"], "name": f'{s["firstName"]} {s["lastName"]}'}

# ---------- home ----------
write("home", {
    "page": {"id": "home", "title": "Home", "route": "/"},
    "blocks": [
        {"type": "hero", "slides": [
            {"image": "https://picsum.photos/seed/khrhero1/1600/900", "headline": "Welcome, Royals!", "subhead": "2026–27 school year", "cta": {"label": "Calendar", "route": "/calendar"}},
            {"image": "https://picsum.photos/seed/khrhero2/1600/900", "headline": "District Champs", "subhead": "Varsity volleyball", "cta": {"label": "Athletics", "route": "/athletics"}},
        ]},
        {"type": "quickLinks", "items": [
            {"label": "Parent Portal", "icon": "user", "url": "https://portal.example"},
            {"label": "Lunch Menu", "icon": "utensils", "route": "/dining"},
            {"label": "Bell Schedule", "icon": "clock", "route": "/students#bell-schedule"},
            {"label": "Report an Absence", "icon": "alert", "route": "/parents#attendance"},
            {"label": "Enroll", "icon": "pencil", "route": "/enrollment"},
            {"label": "Tickets", "icon": "ticket", "url": "https://tickets.example"},
        ]},
        {"type": "newsFeed", "source": "news", "filter": {"featured": True}, "limit": 3},
        {"type": "eventFeed", "source": "calendar", "limit": 5},
        {"type": "principalMessage", **staff_by("Principal"),
         "text": "Placeholder welcome message from the principal."},
        {"type": "stats", "items": [{"label": "Students", "value": "1,240"},
                                     {"label": "Clubs", "value": "45+"},
                                     {"label": "AP Courses", "value": "18"},
                                     {"label": "Student:Teacher", "value": "16:1"}]},
    ],
})

# ---------- about ----------
write("about", {
    "page": {"id": "about", "title": "About", "route": "/about"},
    "mission": "Placeholder mission statement.",
    "vision": "Placeholder vision statement.",
    "values": ["Respect", "Integrity", "Excellence", "Community"],
    "history": [{"year": 1968, "text": "School founded (placeholder)."},
                {"year": 2005, "text": "New fine arts wing opened (placeholder)."},
                {"year": 2024, "text": "Campus modernization completed (placeholder)."}],
    "leadership": [staff_by("Principal"), staff_by("Assistant Principal")],
    "accreditation": ["Placeholder accrediting body"],
    "documents": [{"title": "School Improvement Plan", "url": "/docs/sip.pdf"},
                  {"title": "Annual Report Card", "url": "/docs/report-card.pdf"}],
})

# ---------- academics ----------
write("academics", {
    "page": {"id": "academics", "title": "Academics", "route": "/academics"},
    "programs": [
        {"id": "ap", "name": "Advanced Placement", "description": "18 AP courses offered (placeholder)."},
        {"id": "dual", "name": "Dual Credit", "description": "College credit partnership (placeholder)."},
        {"id": "cte", "name": "Career & Technical Education", "pathways": ["Health Science", "Engineering", "Business", "Culinary Arts"]},
        {"id": "gt", "name": "Gifted & Talented", "description": "Placeholder."},
    ],
    "departments": [{"name": d_[0]} for d_ in depts if d_[0] in ("English","Mathematics","Science","Social Studies","Fine Arts","Special Education")],
    "courseCatalog": {"url": "/docs/course-catalog.pdf", "year": "2026-27"},
    "graduationRequirements": {"totalCredits": 26, "breakdown": {"English": 4, "Math": 4, "Science": 4, "Social Studies": 4, "Fine Arts": 1, "PE": 1, "Electives": 8}},
    "gradingPeriods": [{"name": "Q1", "start": "2026-08-12", "end": "2026-10-09"},
                       {"name": "Q2", "start": "2026-10-13", "end": "2026-12-18"},
                       {"name": "Q3", "start": "2027-01-05", "end": "2027-03-12"},
                       {"name": "Q4", "start": "2027-03-22", "end": "2027-05-28"}],
})

# ---------- athletics ----------
sports = [("Football","fall"),("Volleyball","fall"),("Cross Country","fall"),("Basketball (Boys)","winter"),
          ("Basketball (Girls)","winter"),("Soccer","winter"),("Swimming","winter"),
          ("Baseball","spring"),("Softball","spring"),("Track & Field","spring"),("Tennis","spring"),("Golf","spring")]
opps = ["Eagles","Mustangs","Panthers","Wildcats","Bulldogs","Tigers","Falcons","Hornets"]
teams = []
for i, (s, season) in enumerate(sports):
    sched = []
    for g in range(4):
        off = (g - 2) * 7 + i
        played = off < 0
        us, them = random.randint(0, 40), random.randint(0, 40)
        sched.append({"id": f"game-{i+1:02d}-{g+1}", "date": d(off), "opponent": random.choice(opps),
                      "home": g % 2 == 0, "location": "Royal Stadium" if g % 2 == 0 else "Away",
                      "result": ({"us": us, "them": them, "outcome": "W" if us > them else "L" if us < them else "T"} if played and season == "fall" else None)})
    teams.append({"id": f"team-{i+1:02d}", "sport": s, "season": season, "levels": ["Varsity", "JV"],
                  "headCoach": None, "record": {"w": random.randint(2, 9), "l": random.randint(0, 5)} if season == "fall" else None,
                  "schedule": sched, "rosterUrl": None})
teams[0]["headCoach"] = staff_by("Head Football Coach")
teams[1]["headCoach"] = staff_by("Head Volleyball Coach")
write("athletics", {"page": {"id": "athletics", "title": "Athletics", "route": "/athletics"},
                    "athleticDirector": staff_by("Athletic Director"),
                    "seasons": ["fall", "winter", "spring"], "teams": teams,
                    "forms": [{"title": "Athletic Physical Form", "url": "/docs/physical.pdf"},
                              {"title": "Concussion Acknowledgment", "url": "/docs/concussion.pdf"}],
                    "ticketsUrl": "https://tickets.example"})

# ---------- activities ----------
clubs = ["Student Council","National Honor Society","Robotics","Debate","Theater","Choir","Band","Art Club",
         "Key Club","FFA","FCCLA","HOSA","Yearbook","Chess Club","Spanish Club","Esports"]
write("activities", {"page": {"id": "activities", "title": "Clubs & Activities", "route": "/activities"},
                     "clubs": [{"id": f"club-{i+1:02d}", "name": c, "sponsor": None,
                                "meets": random.choice(["Mon after school", "Tue lunch", "Wed after school", "Thu lunch", "1st Fri monthly"]),
                                "room": str(100 + i), "description": f"{c} (placeholder description).",
                                "category": "fine-arts" if c in ("Theater","Choir","Band","Art Club") else "academic" if c in ("Robotics","Debate","Chess Club","National Honor Society") else "service" if c in ("Key Club",) else "general"}
                               for i, c in enumerate(clubs)]})

# ---------- parents ----------
write("parents", {"page": {"id": "parents", "title": "Parents", "route": "/parents"},
    "sections": [
        {"id": "portal", "title": "Parent Portal", "body": "View grades and attendance (placeholder).", "link": "https://portal.example"},
        {"id": "attendance", "title": "Reporting an Absence", "body": "Call the attendance line or submit the online form within 2 days.",
         "contact": staff_by("Attendance Clerk"), "form": "/forms/absence"},
        {"id": "pto", "title": "PTO", "body": "Meets the 3rd Tuesday monthly (placeholder).", "link": "/parents/pto"},
        {"id": "volunteer", "title": "Volunteering", "body": "Background check required (placeholder).", "link": "/forms/volunteer"},
        {"id": "transportation", "title": "Transportation", "body": "Bus routes and car-line info (placeholder).", "link": "/docs/bus-routes.pdf"},
        {"id": "handbook", "title": "Student Handbook", "body": "", "link": "/docs/handbook.pdf"},
    ],
    "faqs": [{"q": "What time does school start?", "a": "First bell at 8:00 AM (placeholder)."},
             {"q": "How do I update my contact info?", "a": "Through the parent portal (placeholder)."}]})

# ---------- students ----------
write("students", {"page": {"id": "students", "title": "Students", "route": "/students"},
    "bellSchedules": [
        {"id": "regular", "name": "Regular Day", "periods": [
            {"name": "1st", "start": "08:00", "end": "08:50"}, {"name": "2nd", "start": "08:56", "end": "09:46"},
            {"name": "3rd", "start": "09:52", "end": "10:42"}, {"name": "4th", "start": "10:48", "end": "11:38"},
            {"name": "Lunch", "start": "11:38", "end": "12:18"}, {"name": "5th", "start": "12:24", "end": "13:14"},
            {"name": "6th", "start": "13:20", "end": "14:10"}, {"name": "7th", "start": "14:16", "end": "15:06"}]},
        {"id": "early-release", "name": "Early Release", "periods": [
            {"name": "1st", "start": "08:00", "end": "08:30"}, {"name": "7th", "start": "12:00", "end": "12:30"}]},
    ],
    "resources": [{"title": "Canvas / LMS", "url": "https://lms.example"},
                  {"title": "Library Catalog", "url": "https://library.example"},
                  {"title": "Counseling", "route": "/students#counseling"},
                  {"title": "Tutoring Schedule", "url": "/docs/tutoring.pdf"}],
    "counselors": [staff_by("Lead Counselor"), staff_by("Counselor"), staff_by("College & Career Advisor")]})

# ---------- enrollment ----------
write("enrollment", {"page": {"id": "enrollment", "title": "Enrollment", "route": "/enrollment"},
    "steps": [{"n": 1, "title": "Verify residency", "body": "Placeholder."},
              {"n": 2, "title": "Complete online registration", "body": "Placeholder.", "link": "https://enroll.example"},
              {"n": 3, "title": "Submit documents", "body": "Birth certificate, immunizations, proof of residence."},
              {"n": 4, "title": "Schedule with counselor", "body": "Placeholder."}],
    "requiredDocuments": ["Birth certificate", "Immunization record", "Proof of residency", "Parent photo ID", "Previous school records"],
    "contact": staff_by("Registrar"), "transferPolicyUrl": "/docs/transfer-policy.pdf"})

# ---------- dining ----------
entrees = ["Chicken Tenders","Cheese Pizza","Beef Tacos","Spaghetti & Meatballs","Teriyaki Bowl","Turkey Sandwich","BBQ Chicken","Veggie Burger"]
days = []
start = TODAY - timedelta(days=TODAY.weekday())
for i in range(10):
    day = start + timedelta(days=i + (2 if i >= 5 else 0))
    days.append({"date": day.isoformat(),
                 "breakfast": ["Cereal & Milk", random.choice(["Breakfast Taco", "Pancakes", "Biscuit & Gravy"]), "Fruit"],
                 "lunch": {"entrees": random.sample(entrees, 2), "sides": ["Green Beans", "Fresh Fruit", "Salad Bar"], "vegetarian": True},
                 "allergens": random.sample(["gluten", "dairy", "soy", "egg"], 2)})
write("dining", {"page": {"id": "dining", "title": "Lunch Menu", "route": "/dining"},
                 "prices": {"breakfast": 2.00, "lunch": 3.25, "reducedLunch": 0.40},
                 "paymentUrl": "https://pay.example", "freeReducedApplicationUrl": "https://apply.example",
                 "menu": days})

# ---------- contact ----------
write("contact", {"page": {"id": "contact", "title": "Contact", "route": "/contact"},
    "mainOffice": {"phone": "(555) 010-2000", "email": "info@khroyals.example", "hours": "Mon–Fri 7:30 AM – 4:00 PM"},
    "map": {"lat": 0.0, "lng": 0.0, "label": "KH Royals Campus (placeholder)"},
    "keyContacts": [{"role": "Attendance", **staff_by("Attendance Clerk")},
                    {"role": "Registrar", **staff_by("Registrar")},
                    {"role": "Nurse", **staff_by("School Nurse")},
                    {"role": "Athletics", **staff_by("Athletic Director")}],
    "form": {"fields": [{"name": "name", "type": "text", "required": True},
                        {"name": "email", "type": "email", "required": True},
                        {"name": "topic", "type": "select", "options": ["General", "Attendance", "Enrollment", "Athletics", "Technology"]},
                        {"name": "message", "type": "textarea", "required": True}]}})

print("site files:", sorted(os.listdir(OUT)))
