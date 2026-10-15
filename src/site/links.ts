/**
 * Content keeps the website's own absolute URLs. This decides where each one
 * goes in the app: a site page or news post opens in-app, Vimeo/YouTube links
 * open the in-app player, and everything else (PDFs, portals, forms) opens in
 * the browser.
 */
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { resolvePageId } from '../api/mockApi';

const SITE_HOSTS = new Set(['www.khroyals.com', 'khroyals.com']);

export type Route =
  | { kind: 'tab'; path: '/' | '/news' | '/calendar' }
  | { kind: 'page'; id: string }
  | { kind: 'article'; slug: string }
  | { kind: 'video'; provider: 'vimeo' | 'youtube'; id: string }
  | { kind: 'external'; url: string };

export function videoFromUrl(url: string): { provider: 'vimeo' | 'youtube'; id: string } | null {
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { provider: 'vimeo', id: vm[1] };
  const ym = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (ym) return { provider: 'youtube', id: ym[1] };
  return null;
}

export function routeFor(url: string): Route {
  const video = videoFromUrl(url);
  if (video) return { kind: 'video', ...video };
  let u: URL;
  try { u = new URL(url); } catch { return { kind: 'external', url }; }
  if (!SITE_HOSTS.has(u.hostname)) return { kind: 'external', url };
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'tab', path: '/' };
  if (parts[0] === 'news') return parts[1] ? { kind: 'article', slug: parts[1] } : { kind: 'tab', path: '/news' };
  if (parts.length === 1) {
    const id = resolvePageId(parts[0]);
    if (id) return { kind: 'page', id };
  }
  return { kind: 'external', url };
}

export function openLink(url: string) {
  const r = routeFor(url);
  switch (r.kind) {
    case 'tab': return router.navigate(r.path);
    case 'page': return router.push(`/page/${r.id}`);
    case 'article': return router.push(`/news/${r.slug}`);
    case 'video': return router.push({ pathname: '/video', params: { provider: r.provider, id: r.id } });
    default: return Linking.openURL(r.url);
  }
}
