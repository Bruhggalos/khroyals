export type Provider = 'vimeo' | 'youtube';

export function embedUrl(provider: Provider, id: string, autoplay = false) {
  const ap = autoplay ? 1 : 0;
  return provider === 'vimeo'
    ? `https://player.vimeo.com/video/${id}?playsinline=1&autoplay=${ap}`
    : `https://www.youtube.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&autoplay=${ap}`;
}
