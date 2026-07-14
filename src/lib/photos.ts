// Dish photos, shared app-wide. Every photo lives in src/assets/lto/ named
// by the item's slug (e.g. "Savell SmashBurger" → savell-smashburger.jpg).
// Owner drops a photo in chat → it lands here → every screen that shows the
// item (Food Focus, Line Builds, Specs) picks it up automatically.
export const DISH_PHOTOS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../assets/lto/*.jpg', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.split('/').pop()!.replace('.jpg', ''), url as string]),
)

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const dishPhoto = (name: string): string | undefined => DISH_PHOTOS[slugify(name)]
