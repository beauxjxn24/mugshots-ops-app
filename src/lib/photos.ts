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

/**
 * Photos filed under a shorter name than the item they belong to.
 *
 * Twelve dishes looked like they had no photo when the photo was sitting in the
 * folder all along — "Mugshot Burger" looks for mugshot-burger.jpg and the file
 * is mugshot.jpg. Aliased rather than renamed because the line-build sheets name
 * several of these files directly, so renaming would break them there.
 *
 * item slug → file name (without .jpg)
 */
const PHOTO_ALIASES: Record<string, string> = {
  'mugshot-burger': 'mugshot',
  'southern-burger': 'southern',
  'texan-burger': 'texan',
  'comeback-burger': 'comeback',
  'breakfast-burger': 'breakfast',
  'garlic-parm-burger': 'garlic-parm',
  'mac-cheese-burger': 'mac-cheese',
  middleberger: 'middle',
  'davis-dill-pickles': 'dill-pickles',
  'southwest-eggrolls-build': 'eggrolls',
  'mombo-combo-build': 'mombo-combo',
  'firecracker-popper-dog': 'firecracker-popper-dog-250',
  '10-oz-mugshots-milkshake': '10-oz-milkshake',
  '22-oz-mugshots-milkshake': '22-oz-milkshake',
  'root-beer-float': '10-root-beer-float',
  // The build sheets are titled "Shrooms" and "Chili"; the spec cards call the
  // same two items "… Build". Same dish, same photo.
  'shrooms-build': 'shrooms',
  'chili-build': 'chili',
  // Portioning queso is a prep card, but it is the same product in the photo.
  'queso-portions': 'mugshots-queso-dip',
  // The apostrophe splits the slug where the file name doesn't.
  'don-t-be-jelly-double-stack': 'dont-be-jelly-double-stack',
  // The menu says Katie's Kickin' Chicken; the line's sheet says Chicken
  // Basket. Same six tenders, same six ounces of fries, same photo — which had
  // been sitting in the folder unused because the two names never met.
  'katie-s-kickin-chicken': 'chicken-basket',
  // The sheet drops the "oz" from the 10 oz float and the photo is filed under
  // that name; the card reads properly, so the two meet here.
  '10-oz-root-beer-float': '10-root-beer-float',
}

export const dishPhoto = (name: string): string | undefined => {
  const s = slugify(name)
  return DISH_PHOTOS[s] ?? DISH_PHOTOS[PHOTO_ALIASES[s] ?? '']
}
