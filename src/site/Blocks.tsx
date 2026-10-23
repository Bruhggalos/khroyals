/**
 * Renders imported khroyals.com content (sections -> blocks) natively. Every
 * site page, the home page and news posts go through here, so a re-import
 * needs no screen changes.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { getNews } from '../api/mockApi';
import { Button, C, Card, Chip, P, useLoad } from '../ui';
import { openLink } from './links';
import type { Article, Block, Link, Section } from './types';
import { EmbedVideo } from './video/EmbedVideo';
import { HlsVideo } from './video/HlsVideo';

/** Text colour flips to white on top of photo/video section backgrounds. */
const OnDark = createContext(false);
const useInk = () => (useContext(OnDark) ? '#fff' : C.ink);

const H_SIZE: Record<number, number> = { 1: 28, 2: 23, 3: 19, 4: 16 };

function Heading({ level, children }: { level: number; children: ReactNode }) {
  const color = useInk();
  return <Text accessibilityRole="header" style={{ fontSize: H_SIZE[level] ?? 16, fontWeight: '800', color, lineHeight: (H_SIZE[level] ?? 16) * 1.25 }}>{children}</Text>;
}

/** Paragraph with the site's inline links made tappable. */
function Paragraph({ text, links = [] }: { text: string; links?: Link[] }) {
  const color = useInk();
  const parts: ReactNode[] = [];
  let rest = text;
  links.forEach((l, i) => {
    const at = rest.indexOf(l.label);
    if (at < 0) return;
    parts.push(rest.slice(0, at));
    parts.push(<Text key={i} style={{ color: linkColor(color), textDecorationLine: 'underline', fontWeight: '600' }} onPress={() => openLink(l.url)}>{l.label}</Text>);
    rest = rest.slice(at + l.label.length);
  });
  parts.push(rest);
  return <Text style={{ fontSize: 15, lineHeight: 22, color }}>{parts}</Text>;
}
const linkColor = (ink: string) => (ink === '#fff' ? '#fff' : C.primary);

/** Image that keeps its natural aspect ratio (logos and photos vary a lot). */
export function AutoImage({ uri, maxHeight, contain, radius = 10 }: { uri: string; maxHeight?: number; contain?: boolean; radius?: number }) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    Image.getSize(uri, (w, h) => live && h > 0 && setRatio(w / h), () => live && setRatio(16 / 9));
    return () => { live = false; };
  }, [uri]);
  return (
    <Image source={{ uri }} resizeMode={contain ? 'contain' : 'cover'}
      style={{ width: '100%', aspectRatio: ratio ?? 16 / 9, maxHeight, borderRadius: radius, backgroundColor: contain ? 'transparent' : C.line }} />
  );
}

function RotatingText({ words, intervalMs, level }: { words: string[]; intervalMs: number; level: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % words.length), intervalMs);
    return () => clearInterval(t);
  }, [words.length, intervalMs]);
  return <Text style={{ fontSize: H_SIZE[level] ?? 19, fontWeight: '800', color: C.accent }}>{words[i]}</Text>;
}

function Accordion({ items }: { items: { title: string; blocks: Block[] }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <View style={{ gap: 8 }}>
      {items.map((it, i) => (
        <Card key={i} onPress={() => setOpen(open === i ? null : i)}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={{ flex: 1, fontWeight: '700', fontSize: 15, color: C.ink }}>{it.title}</Text>
            <Text style={{ color: C.primary, fontWeight: '800' }}>{open === i ? '−' : '+'}</Text>
          </View>
          {open === i && <OnDark.Provider value={false}><BlockList blocks={it.blocks} /></OnDark.Provider>}
        </Card>
      ))}
    </View>
  );
}

function Cards({ items }: { items: Extract<Block, { type: 'cards' }>['items'] }) {
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  // Logo-style cards (partners, memberships) scroll sideways; photo cards stack.
  const logos = items.length > 3 && items.every((it) => it.image && !it.button)
    && items.filter((it) => /\.png/i.test(it.image!)).length >= items.length * 0.6;
  if (logos) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {items.map((it, i) => (
          <Card key={i} style={{ width: Math.min(260, width * 0.7) }}>
            {it.image && <Image source={{ uri: it.image }} resizeMode="contain" style={{ height: 70, width: '100%' }} />}
            <Text style={{ fontWeight: '700', color: C.ink }}>{it.title}</Text>
            <Text numberOfLines={5} style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}>{it.text}</Text>
          </Card>
        ))}
      </ScrollView>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {items.map((it, i) => (
        <Card key={i} onPress={it.button ? () => openLink(it.button!.url) : () => setExpanded({ ...expanded, [i]: !expanded[i] })}>
          {it.image && (/\.png/i.test(it.image) ? <AutoImage uri={it.image} maxHeight={140} contain /> : <AutoImage uri={it.image} maxHeight={240} />)}
          {!!it.title && <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>{it.title}</Text>}
          {!!it.text && <Text numberOfLines={expanded[i] ? undefined : 6} style={{ fontSize: 14, lineHeight: 20, color: C.ink }}>{it.text}</Text>}
          {it.button && <Text style={{ color: C.primary, fontWeight: '700' }}>{it.button.label} ›</Text>}
        </Card>
      ))}
    </View>
  );
}

function NewsFeed({ limit }: { limit: number }) {
  const { data } = useLoad(getNews);
  if (!data) return null;
  return <View style={{ gap: 8 }}>{data.articles.slice(0, limit).map((a) => <ArticleCard key={a.id} a={a} />)}</View>;
}

export function ArticleCard({ a, compact }: { a: Article; compact?: boolean }) {
  return (
    <Card onPress={() => router.push(`/news/${a.slug}`)} style={compact ? { flexDirection: 'row', gap: 12, alignItems: 'center' } : undefined}>
      {a.heroImage && <Image source={{ uri: a.heroImage }} style={compact ? { width: 72, height: 72, borderRadius: 8 } : { height: 160, borderRadius: 10 }} />}
      <View style={{ flex: compact ? 1 : undefined, gap: 4 }}>
        {!compact && <Chip label={a.category} />}
        <Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }} numberOfLines={compact ? 2 : undefined}>{a.title}</Text>
        <P muted>{formatDate(a.publishedAt)}{compact ? '' : ` · ${a.author}`}</P>
      </View>
    </Card>
  );
}

export const formatDate = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', opts);

export function BlockView({ b }: { b: Block }) {
  const ink = useInk();
  const { width } = useWindowDimensions();
  switch (b.type) {
    case 'heading': return <Heading level={b.level}>{b.text}</Heading>;
    case 'paragraph': return <Paragraph text={b.text} links={b.links} />;
    case 'list':
      return (
        <View style={{ gap: 4 }}>
          {b.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ color: ink, fontWeight: '700', minWidth: 16 }}>{b.ordered ? `${i + 1}.` : '•'}</Text>
              <Text style={{ flex: 1, color: ink, fontSize: 15, lineHeight: 21 }}>{it}</Text>
            </View>
          ))}
        </View>
      );
    case 'quote':
      return <Text style={{ fontStyle: 'italic', fontSize: 16, color: ink, borderLeftWidth: 3, borderLeftColor: C.accent, paddingLeft: 10 }}>{b.text}</Text>;
    case 'button': return <Button label={b.label} onPress={() => openLink(b.url)} />;
    case 'image': {
      const img = (
        <View style={{ gap: 6 }}>
          {/\.png/i.test(b.src) ? <AutoImage uri={b.src} maxHeight={170} contain /> : <AutoImage uri={b.src} maxHeight={420} />}
          {!!b.title && <Heading level={4}>{b.title}</Heading>}
          {!!b.subtitle && <Paragraph text={b.subtitle} />}
          {!!b.caption && <P muted>{b.caption}</P>}
          {b.button && <Button kind="ghost" label={b.button.label} onPress={() => openLink(b.button!.url)} />}
        </View>
      );
      return b.url && !b.button ? <Pressable onPress={() => openLink(b.url!)}>{img}</Pressable> : img;
    }
    case 'gallery':
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, alignItems: 'center' }}>
          {b.images.map((src) => {
            const logo = /\.png/i.test(src);
            return <Image key={src} source={{ uri: src }} resizeMode={logo ? 'contain' : 'cover'}
              style={{ width: logo ? 150 : Math.min(width * 0.7, 420), height: logo ? 80 : 200, borderRadius: 10, backgroundColor: logo ? '#fff' : C.line }} />;
          })}
        </ScrollView>
      );
    case 'cards': return <Cards items={b.items} />;
    case 'accordion': return <Accordion items={b.items} />;
    case 'video': return <HlsVideo hls={b.hls} thumbnail={b.thumbnail} aspectRatio={b.aspectRatio} />;
    case 'vimeo':
    case 'youtube': {
      // Portrait testimonials shouldn't fill a whole phone screen.
      const portrait = b.aspectRatio < 1;
      return <EmbedVideo provider={b.type} id={b.id} aspectRatio={b.aspectRatio}
        style={portrait ? { width: Math.min(width * 0.62, 320), alignSelf: 'center' } : undefined} />;
    }
    case 'rotatingText': return <RotatingText {...b} />;
    case 'marquee':
      return (
        <View style={{ backgroundColor: C.primary, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '800', letterSpacing: 1.5, textAlign: 'center' }}>{b.text}</Text>
        </View>
      );
    case 'webTool':
      return (
        <Card>
          <Text style={{ fontWeight: '800', fontSize: 17, color: C.ink }}>{b.title}</Text>
          {!!b.text && <P>{b.text}</P>}
          <Button label="Open on khroyals.com" onPress={() => openLink(b.url)} />
        </Card>
      );
    case 'embed': return <Button kind="ghost" label="Open form" onPress={() => openLink(b.url)} />;
    case 'newsFeed': return <NewsFeed limit={b.limit} />;
    default: return null;
  }
}

type Embed = Extract<Block, { type: 'vimeo' | 'youtube' }>;
const isPortraitEmbed = (b: Block): b is Embed => (b.type === 'vimeo' || b.type === 'youtube') && b.aspectRatio < 1;

/** Side-by-side portrait videos (e.g. the parent testimonials), swiped horizontally. */
function PortraitVideos({ videos }: { videos: Embed[] }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width * 0.62, 280);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={w + 10} decelerationRate="fast" contentContainerStyle={{ gap: 10 }}>
      {videos.map((v) => <EmbedVideo key={v.id} provider={v.type} id={v.id} aspectRatio={v.aspectRatio} style={{ width: w }} />)}
    </ScrollView>
  );
}

export function BlockList({ blocks }: { blocks: Block[] }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (isPortraitEmbed(blocks[i]) && blocks[i + 1] && isPortraitEmbed(blocks[i + 1])) {
      const run: Embed[] = [];
      while (i < blocks.length && isPortraitEmbed(blocks[i])) run.push(blocks[i++] as Embed);
      i--;
      out.push(<PortraitVideos key={`v${i}`} videos={run} />);
    } else {
      out.push(<BlockView key={i} b={blocks[i]} />);
    }
  }
  return <View style={{ gap: 12 }}>{out}</View>;
}

export function SectionView({ section, hero }: { section: Section; hero?: boolean }) {
  const bg = section.background;
  if (!bg) return <BlockList blocks={section.blocks} />;
  const content = (
    <View style={{ padding: 18, paddingVertical: hero ? 36 : 24, backgroundColor: '#0B1928A6', gap: 12, minHeight: hero ? 320 : undefined, justifyContent: 'center' }}>
      <OnDark.Provider value><BlockList blocks={section.blocks} /></OnDark.Provider>
    </View>
  );
  if (bg.type === 'video') {
    return (
      <View style={{ borderRadius: 16, overflow: 'hidden' }}>
        <HlsVideo hls={bg.hls} thumbnail={bg.thumbnail} background />
        {content}
      </View>
    );
  }
  return (
    <ImageBackground source={{ uri: bg.src }} style={{ borderRadius: 16, overflow: 'hidden' }} imageStyle={{ borderRadius: 16 }}>
      {content}
    </ImageBackground>
  );
}

export function Sections({ sections }: { sections: Section[] }) {
  return <View style={{ gap: 22 }}>{sections.map((s, i) => <SectionView key={i} section={s} hero={i === 0} />)}</View>;
}
