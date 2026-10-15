#!/usr/bin/env python3
"""
Import the real khroyals.com (Squarespace) content into content/site/*.json.

    pip install beautifulsoup4
    python3 scripts/import_site.py content/site [--cache DIR]

Fetches the sitemap, every page, the news collection (?format=json) and turns
each page into an ordered list of sections -> blocks (heading, paragraph, list,
button, image, gallery, cards, accordion, video, vimeo, youtube, ...). Videos keep
their real sources: Squarespace-hosted videos as HLS playlists, Vimeo/YouTube
embeds by id. With --cache, downloaded HTML/JSON is stored there and reused.
"""
import datetime as dt
import html as H
import json
import os
import re
import sys
import urllib.request
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

BASE = 'https://www.khroyals.com'
VIDEO_LIB = 'https://video.squarespace-cdn.com/content/v1/67b50a3a4b763b233e2c099a/'
TZ = ZoneInfo('America/Chicago')
TODAY = dt.date.today().isoformat()

# Pages reachable from the site's menus/footer. Orphaned drafts (old-home,
# academies, academy-year, contact, bullying-1, enrollment-coming-soon) are skipped.
PAGES = [
    'plan-a-visit', 'admissions', 'military-families', 'our-story', 'contact-us', 'meet-our-team',
    'the-historic-butler-high-school-campus', 'hillsdale', 'early-learning-academy', 'formation-academy',
    'presence-academy', 'kingdom-academy', 'spiritual-life', 'athletics', 'fine-arts', 'uniforms',
    'giving', 'partners', 'support-services', 'bullying', 'terms-of-service', 'privacy-policy',
    'videophotography-policy',
]

OUT = sys.argv[1] if len(sys.argv) > 1 else 'content/site'
CACHE = sys.argv[sys.argv.index('--cache') + 1] if '--cache' in sys.argv else None


def fetch(path: str) -> str:
    name = re.sub(r'[^\w.-]+', '_', path.strip('/') or 'home')
    if CACHE:
        p = os.path.join(CACHE, name)
        if os.path.exists(p):
            return open(p, encoding='utf-8').read()
    req = urllib.request.Request(BASE + path, headers={'User-Agent': 'Mozilla/5.0 (khroyals-app importer)'})
    body = urllib.request.urlopen(req, timeout=60).read().decode('utf-8')
    if CACHE:
        os.makedirs(CACHE, exist_ok=True)
        open(os.path.join(CACHE, name), 'w', encoding='utf-8').write(body)
    return body


# ---------------------------------------------------------------- helpers
def absu(u):
    if not u:
        return None
    u = H.unescape(u.strip())
    if u.startswith('//'):
        return 'https:' + u
    if u.startswith('/'):
        return BASE + u
    return u


def clean(t):
    return re.sub(r'\s+', ' ', H.unescape(t).replace('\xa0', ' ')).strip()


def img_src(img):
    u = img.get('data-src') or img.get('data-image') or img.get('src')
    if not u or u.startswith('data:'):
        return None
    u = absu(u)
    if 'squarespace-cdn.com' in u and '?' not in u:
        u += '?format=1500w'
    return u


def native_video(system_id, **extra):
    base = VIDEO_LIB + system_id
    return {'type': 'video', 'hls': base + '/playlist.m3u8', 'thumbnail': base + '/thumbnail', **extra}


# ------------------------------------------------- rotating-text plugin config
ROTATE = {}
CURRENT_URL = BASE
CURRENT_RAW = ''


def parse_rotating_text(raw):
    """The home hero swaps the word "loop" for a list of phrases via a plugin."""
    ROTATE.clear()
    u = H.unescape(raw)
    i = u.find('"sp_342"')
    if i < 0:
        return
    seg = u[i:u.find('</script>', i)]
    for m in re.finditer(r'"(block-[^"]+)":\[(.*?)\]', seg):
        vals = dict(re.findall(r'"id":"(\d+)","val":"(.*?)"', m.group(2)))
        if '635' in vals:
            words = [w.strip() for w in re.split(r'(?<=\.),', vals['635']) if w.strip()]
            ROTATE[m.group(1)] = {'words': words, 'intervalMs': int(vals.get('636') or 1800)}


# ------------------------------------------------------------- block parsing
def text_blocks(root, out):
    for el in root.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'blockquote']):
        if el.name == 'p' and el.find_parent(['ul', 'ol', 'blockquote']):
            continue
        if el.name in ('ul', 'ol') and el.find_parent(['ul', 'ol']):
            continue
        if el.name in ('h1', 'h2', 'h3', 'h4'):
            t = clean(el.get_text(' '))
            if t:
                out.append({'type': 'heading', 'level': int(el.name[1]), 'text': t})
        elif el.name in ('ul', 'ol'):
            items = [clean(li.get_text(' ')) for li in el.find_all('li', recursive=False)]
            items = [i for i in items if i]
            if items:
                out.append({'type': 'list', 'ordered': el.name == 'ol', 'items': items})
        elif el.name == 'blockquote':
            t = clean(el.get_text(' '))
            if t:
                out.append({'type': 'quote', 'text': t})
        else:
            t = clean(el.get_text(' '))
            if not t:
                continue
            b = {'type': 'paragraph', 'text': t}
            links = [{'label': clean(a.get_text(' ')), 'url': absu(a.get('href'))}
                     for a in el.find_all('a') if a.get('href') and clean(a.get_text(' '))]
            if links:
                b['links'] = links
            out.append(b)


def embed_block(vw):
    frag = H.unescape(vw['data-html'])
    m = re.search(r'src="([^"]+)"', frag)
    if not m:
        return None
    src = m.group(1)
    w = re.search(r'width="(\d+)"', frag)
    h = re.search(r'height="(\d+)"', frag)
    ar = round(int(w.group(1)) / int(h.group(1)), 4) if w and h and int(h.group(1)) else round(16 / 9, 4)
    vm = re.search(r'player\.vimeo\.com/video/(\d+)', src)
    if vm:
        return {'type': 'vimeo', 'id': vm.group(1), 'aspectRatio': ar}
    ym = re.search(r'youtube(?:-nocookie)?\.com/embed/([\w-]{11})', src)
    if ym:
        return {'type': 'youtube', 'id': ym.group(1), 'aspectRatio': ar}
    return {'type': 'embed', 'url': absu(src)}


def anchor_for(blk):
    """Prefer an element id that the site itself links to (e.g. #tuition-calculator)."""
    sec = blk.find_parent('section')
    ids = ([sec['id']] if sec is not None and sec.get('id') else []) + [e['id'] for e in blk.find_all(id=True)]
    linked = [i for i in ids if f'#{i}"' in CURRENT_RAW]
    return f'#{(linked or ids)[0]}' if ids else ''


def blocks_of(container):
    out = []
    for blk in container.select('.sqs-block'):
        if blk.find_parent(class_='sqs-block') is not None:
            continue
        cls = ' '.join(blk.get('class', []))
        if blk.get('id') in ROTATE and re.search(r'\bloop\b', blk.get_text(' '), re.I):
            h = blk.find(['h1', 'h2', 'h3', 'h4'])
            out.append({'type': 'rotatingText', 'level': int(h.name[1]) if h else 3, **ROTATE[blk['id']]})
            continue
        vw = blk.select_one('.sqs-video-wrapper[data-html]')
        if vw:
            b = embed_block(vw)
            if b:
                out.append(b)
            continue
        nv = blk.select_one('[data-config-video]')
        if nv:
            cfg = json.loads(H.unescape(nv['data-config-video']))
            out.append(native_video(cfg['systemDataId'], durationSeconds=round(cfg.get('durationSeconds') or 0),
                                    aspectRatio=round(cfg.get('aspectRatio') or 16 / 9, 4)))
            continue
        if 'sqs-block-marquee' in cls:
            parts = [clean(x.get_text(' ')) for x in blk.select('.Marquee-measure .Marquee-item')]
            text = ' '.join(p for p in parts if p)
            if text:
                out.append({'type': 'marquee', 'text': text})
            continue
        if 'sqs-block-code' in cls and (blk.find('script') or blk.find('input')):
            # Interactive web widget (e.g. the tuition calculator): link to it on the site.
            h = blk.find(['h1', 'h2', 'h3'])
            p = blk.find('p')
            out.append({'type': 'webTool', 'title': clean(h.get_text(' ')) if h else 'Interactive tool',
                        'text': clean(p.get_text(' ')) if p else '', 'url': CURRENT_URL + anchor_for(blk)})
            continue
        if 'sqs-block-button' in cls or blk.get('data-sqsp-block') == 'button':
            a = blk.find('a')
            if a and clean(a.get_text(' ')):
                out.append({'type': 'button', 'label': clean(a.get_text(' ')), 'url': absu(a.get('href'))})
        elif 'sqs-block-image' in cls or blk.get('data-sqsp-block') == 'image':
            img = blk.find('img')
            src = img and img_src(img)
            if not src:
                continue
            b = {'type': 'image', 'src': src}
            if clean(img.get('alt') or ''):
                b['alt'] = clean(img['alt'])
            for key, sel in (('title', '.image-title'), ('subtitle', '.image-subtitle'), ('caption', '.image-caption, figcaption')):
                el = blk.select_one(sel)
                if el and clean(el.get_text(' ')):
                    b[key] = clean(el.get_text(' '))
            btn = blk.select_one('.image-button a')
            if btn and clean(btn.get_text(' ')):
                b['button'] = {'label': clean(btn.get_text(' ')), 'url': absu(btn.get('href'))}
            else:
                a = blk.find('a')
                if a and a.get('href'):
                    b['url'] = absu(a['href'])
            out.append(b)
        elif 'sqs-block-gallery' in cls:
            imgs = list(dict.fromkeys(filter(None, (img_src(i) for i in blk.find_all('img')))))
            if imgs:
                out.append({'type': 'gallery', 'images': imgs})
        elif 'sqs-block-accordion' in cls or blk.select_one('.accordion-item'):
            items = []
            for it in blk.select('.accordion-item'):
                t = it.select_one('.accordion-item__title')
                d = it.select_one('.accordion-item__description')
                body = []
                if d:
                    text_blocks(d, body)
                    if not body and clean(d.get_text(' ')):
                        body = [{'type': 'paragraph', 'text': clean(d.get_text(' '))}]
                items.append({'title': clean(t.get_text(' ')) if t else '', 'blocks': body})
            if items:
                out.append({'type': 'accordion', 'items': items})
        elif 'sqs-block-summary' in cls:
            out.append({'type': 'newsFeed', 'limit': 3})
        elif any(k in cls for k in ('sqs-block-form', 'newsletter', 'spacer', 'horizontalrule')):
            continue
        else:
            ifr = blk.find('iframe')
            if ifr and ifr.get('src'):
                out.append({'type': 'embed', 'url': absu(ifr['src'])})
            else:
                text_blocks(blk, out)
    return out


def section_background(sec):
    m = re.search(r'"videoSourceProvider":\s*"native".*?"systemDataId":\s*"([0-9a-f-]{36})"', H.unescape(str(sec)), re.S)
    img = sec.select_one('.section-background img')
    poster = img_src(img) if img else None
    if m:
        v = native_video(m.group(1), background=True)
        if poster:
            v['thumbnail'] = poster
        return v
    if poster:
        return {'type': 'image', 'src': poster}
    return None


def list_section(sec):
    items = []
    for li in sec.select('li.list-item'):
        t = li.select_one('.list-item-content__title')
        d = li.select_one('.list-item-content__description')
        img = li.find('img')
        a = li.select_one('.list-item-content__button')
        it = {'title': clean(t.get_text(' ')) if t else '', 'text': clean(d.get_text(' ')) if d else ''}
        if img and img_src(img):
            it['image'] = img_src(img)
        if a and a.get('href'):
            it['button'] = {'label': clean(a.get_text(' ')), 'url': absu(a['href'])}
        items.append(it)
    return items


def page_sections(raw, url):
    global CURRENT_URL, CURRENT_RAW
    CURRENT_URL, CURRENT_RAW = url, raw
    parse_rotating_text(raw)
    s = BeautifulSoup(raw, 'html.parser')
    main = s.find('main')
    sections = []
    for sec in main.select('section.page-section'):
        blocks = blocks_of(sec.select_one('.content-wrapper') or sec)
        cards = list_section(sec)
        if cards:
            blocks.append({'type': 'cards', 'items': cards})
        gal = sec.select('.gallery-grid-item img, .gallery-masonry-item img, .gallery-slideshow-item img, '
                         '.gallery-reel-item img, .gallery-fullscreen-slideshow-item img, .gallery-strips-item img')
        imgs = list(dict.fromkeys(filter(None, (img_src(i) for i in gal))))
        if imgs:
            blocks.append({'type': 'gallery', 'images': imgs})
        bg = section_background(sec)
        if blocks or bg:
            out = {'blocks': blocks}
            if bg:
                out['background'] = bg
            sections.append(out)
    return sections


# ------------------------------------------------------------- site chrome
def page_link(href):
    """Menu entries keep the site's absolute URL; the app resolves it."""
    return re.sub(r'%22$', '', absu(href))  # the Transcript Request link ends in a stray quote


def site_chrome(raw, website):
    s = BeautifulSoup(raw, 'html.parser')
    nav, seen = [], set()
    for el in s.select('header .header-display-desktop .header-nav-item'):
        folder = el.select_one('.header-nav-folder-title')
        if folder:
            label = clean(folder.get_text(' '))
            if label in seen:
                continue
            seen.add(label)
            items = [{'label': clean(a.get_text(' ')), 'url': page_link(a.get('href'))}
                     for a in el.select('.header-nav-folder-item a, .header-nav-folder-content a')]
            nav.append({'label': label.title(), 'items': items})
        else:
            a = el.find('a')
            if a and clean(a.get_text(' ')) not in seen:
                seen.add(clean(a.get_text(' ')))
                nav.append({'label': clean(a.get_text(' ')).title(), 'url': page_link(a.get('href'))})

    foot = s.find('footer')
    paras = [clean(p.get_text(' ')) for p in foot.find_all('p')]
    non_disc = next((p for p in paras if 'admits students of any race' in p), '')
    non_disc = re.sub(r'^Non-Discrimination Statement\s*', '', non_disc)
    about = next((p for p in paras if 'is a ministry of the' in p), '')
    about = re.sub(r'\s+([.,])', r'\1', about)
    quick = []
    hdr = foot.find(string=re.compile('QUICK LINKS'))
    if hdr:
        blk = hdr.find_parent(class_='sqs-block')
        quick = [{'label': clean(a.get_text(' ')), 'url': absu(a['href'])} for a in blk.find_all('a') if a.get('href')]
    ctas = [{'label': clean(a.get_text(' ')).title(), 'url': absu(a['href'])}
            for a in foot.select('.sqs-block-button a, [data-sqsp-block="button"] a') if a.get('href')]
    # The footer's portal link is a one-time login-session URL; use the menu's stable one.
    portal = next((n['url'] for n in nav if n['label'] == 'Family Portal'), None)
    for link in quick + ctas:
        if portal and 'accounts.renweb.com/Account/Login' in link['url']:
            link['url'] = portal
    social = [{'service': a['screenname'], 'url': a['profileUrl']} for a in website.get('socialAccounts', [])]
    return nav, {'about': about, 'nonDiscrimination': non_disc, 'quickLinks': quick, 'actions': ctas}, social


# ------------------------------------------------------------------- news
def news_articles():
    items, url = [], '/news?format=json'
    while url:
        d = json.loads(fetch(url))
        items += d['items']
        p = d.get('pagination') or {}
        url = (p['nextPageUrl'] + '&format=json') if p.get('nextPage') else None
    arts = []
    for it in items:
        when = dt.datetime.fromtimestamp(int(it['publishOn']) / 1000, TZ)
        body_soup = BeautifulSoup(it.get('body') or '', 'html.parser')
        parse_rotating_text('')
        body = blocks_of(body_soup)
        summary = clean(BeautifulSoup(it.get('excerpt') or '', 'html.parser').get_text(' '))
        if not summary:
            summary = next((b['text'] for b in body if b['type'] == 'paragraph'), '')[:220]
        arts.append({
            'id': it['id'], 'slug': it['urlId'], 'title': clean(it['title']),
            'publishedAt': when.date().isoformat(),
            'author': (it.get('author') or {}).get('displayName') or 'Kingdom Heights',
            'category': (it.get('categories') or ['School News'])[0].title(),
            'tags': it.get('tags') or [],
            'featured': bool(it.get('starred')),
            'heroImage': (it.get('assetUrl') + '?format=1500w') if it.get('assetUrl') else None,
            'summary': summary,
            'sourceUrl': BASE + it['fullUrl'],
            'body': body,
        })
    arts.sort(key=lambda a: a['publishedAt'], reverse=True)
    return arts


# --------------------------------------------------------------- calendar
# Transcribed from the "Important Dates" column of the official PDF
# (https://www.khroyals.com/s/2026-2027-Calendar-2.pdf); the PDF's colour
# legend is not machine-readable, so `category` is derived from each entry.
CALENDAR_PDF = BASE + '/s/2026-2027-Calendar-2.pdf'
CALENDAR = [
    ('2026-07-27', '2026-07-30', 'Professional Development', 'Teacher In-Service'),
    ('2026-08-03', '2026-08-06', 'Staff Development', 'Teacher In-Service'),
    ('2026-08-07', None, 'Take-A-Peek', 'Special Student Day'),
    ('2026-08-10', None, 'First Day of School', 'Special Student Day'),
    ('2026-09-07', None, 'Labor Day – Closed', 'No School'),
    ('2026-09-11', None, 'E-Learning Day', 'E-Learning'),
    ('2026-09-16', None, 'Formal Hall Ceremony', 'Special Student Day'),
    ('2026-10-02', None, 'End of First Quarter', 'Academic'),
    ('2026-10-05', '2026-10-09', 'Fall Break', 'No School'),
    ('2026-10-12', None, 'First Day of 2nd Quarter', 'Academic'),
    ('2026-11-03', '2026-11-04', 'ACT Testing (10th–12th) / E-Learning Day (6th–9th)', 'Academic'),
    ('2026-11-11', None, 'Veteran’s Day – Closed', 'No School'),
    ('2026-11-23', '2026-11-27', 'Thanksgiving Break', 'No School'),
    ('2026-12-01', None, 'Christmas Program', 'Special Student Day'),
    ('2026-12-16', '2026-12-18', '6th–12th Semester Exams', 'Academic'),
    ('2026-12-18', None, '6th–12th Semester Exams and Semester Ends / Half-Day', 'Academic'),
    ('2026-12-21', '2027-01-01', 'Christmas Break', 'No School'),
    ('2027-01-04', None, 'Professional Development', 'Teacher In-Service'),
    ('2027-01-05', None, 'First Day of 3rd Quarter for Students', 'Academic'),
    ('2027-01-18', None, 'Rev. Dr. MLK Jr. Day – Closed', 'No School'),
    ('2027-02-05', None, 'E-Learning Day / Professional Development', 'E-Learning'),
    ('2027-02-15', None, 'President’s Day', 'No School'),
    ('2027-03-12', None, 'End of 3rd Quarter', 'Academic'),
    ('2027-03-15', '2027-03-19', 'Spring Break', 'No School'),
    ('2027-03-26', None, 'Good Friday', 'No School'),
    ('2027-03-29', None, 'Easter Monday', 'No School'),
    ('2027-04-14', None, 'E-Learning Day', 'E-Learning'),
    ('2027-05-13', None, 'Kindergarten Graduation', 'Special Student Day'),
    ('2027-05-14', None, 'Formal Hall & 12th Grade Commencement', 'Special Student Day'),
    ('2027-05-18', '2027-05-19', '6th–11th Grade Exams', 'Academic'),
    ('2027-05-20', None, 'Last Day of School / Semester Ends (Half Day)', 'Special Student Day'),
    ('2027-05-21', None, 'Teacher Work Day', 'Teacher In-Service'),
]


# ------------------------------------------------------------------- main
def meta(path):
    return {'source': BASE + path, 'scrapedAt': TODAY}


def write(name, data):
    os.makedirs(os.path.dirname(os.path.join(OUT, name)), exist_ok=True)
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')


def page_title(path):
    c = json.loads(fetch(path + '?format=json'))['collection']
    return clean(c.get('navigationTitle') or c.get('title') or path.strip('/'))


def main():
    home_raw = fetch('/')
    website = json.loads(fetch('/?format=json'))['website']
    nav, footer, social = site_chrome(home_raw, website)

    write('site.json', {
        '_meta': meta('/'),
        'school': {
            'name': website['siteTitle'], 'shortName': 'KHPS', 'mascot': 'Royals', 'grades': 'K2–12',
            'motto': 'Regnum Dei Primum', 'mottoTranslation': "God's Kingdom First",
            'colors': {'primary': '#00239C', 'secondary': '#FC1723', 'ink': '#0B1928'},
            'logo': absu(website.get('logoImageUrl')),
            'address': {'line1': '3401 Holmes Ave NW', 'city': 'Huntsville', 'state': 'AL', 'zip': '35816'},
            'phone': '(256) 210-1343', 'email': 'info@khroyals.com', 'admissionsEmail': 'admissions@khroyals.com',
            'ministryOf': {'name': 'Rock Family Worship Center', 'url': 'https://www.therockfamily.org/'},
        },
        'navigation': nav,
        'footer': footer,
        'social': social,
    })

    write('home.json', {'_meta': meta('/'), 'page': {'id': 'home', 'title': 'Home', 'sourceUrl': BASE + '/'},
                        'sections': page_sections(home_raw, BASE + '/')})

    index = []
    for pid in PAGES:
        path = '/' + pid
        title = page_title(path)
        write(f'pages/{pid}.json', {'_meta': meta(path), 'page': {'id': pid, 'title': title, 'sourceUrl': BASE + path},
                                    'sections': page_sections(fetch(path), BASE + path)})
        index.append({'id': pid, 'title': title})
    write('pages/index.json', {'pages': index, 'aliases': {'early-childhood-education': 'early-learning-academy'}})
    # Metro needs static imports, so emit a typed map of every page.
    var = lambda pid: 'p_' + re.sub(r'\W', '_', pid)
    with open(os.path.join(OUT, 'pages.ts'), 'w', encoding='utf-8') as f:
        f.write('// Generated by scripts/import_site.py — do not edit.\n')
        f.write("import type { SitePage } from '../../src/site/types';\n")
        for pid in PAGES:
            f.write(f"import {var(pid)} from './pages/{pid}.json';\n")
        f.write('\nexport const pages: Record<string, SitePage> = {\n')
        for pid in PAGES:
            f.write(f"  '{pid}': {var(pid)} as unknown as SitePage,\n")
        f.write('};\n')

    arts = news_articles()
    write('news.json', {'_meta': meta('/news'), 'categories': sorted({a['category'] for a in arts}), 'articles': arts})

    write('calendar.json', {
        '_meta': {'source': CALENDAR_PDF, 'scrapedAt': TODAY},
        'schoolYear': '2026–2027', 'pdf': CALENDAR_PDF,
        'categories': sorted({c for *_, c in CALENDAR}),
        'events': [{'id': f'ev-{i + 1:02d}', 'title': t, 'date': d, 'endDate': e, 'allDay': True, 'category': c}
                   for i, (d, e, t, c) in enumerate(CALENDAR)],
    })
    print(f'wrote {len(index)} pages, {len(arts)} news posts, {len(CALENDAR)} calendar dates -> {OUT}')


if __name__ == '__main__':
    main()
