// Seeded station photos are arbitrary stock images; use the app's own charging photos instead,
// unless an admin set a custom (non-stock) image for the station.
const PHOTOS = ['/slides/slide1.jpg', '/slides/slide2.jpg', '/slides/slide3.jpg'];

export function stationPhoto(station) {
  const url = station?.imageUrl;
  if (url && !url.includes('images.unsplash.com')) return url;
  return PHOTOS[(Number(station?.id) || 0) % PHOTOS.length];
}
