// Polyfills for the PDF worker thread (same APIs main.tsx polyfills for the
// page): older browsers lack these and silently drop glyphs during render.
if (!Math.sumPrecise) {
  Math.sumPrecise = (values) => {
    let sum = 0
    for (const v of values) sum += v
    return sum
  }
}
if (!Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsertComputed = function (key, fn) {
    if (!this.has(key)) this.set(key, fn(key))
    return this.get(key)
  }
}
if (!Map.prototype.getOrInsert) {
  Map.prototype.getOrInsert = function (key, value) {
    if (!this.has(key)) this.set(key, value)
    return this.get(key)
  }
}
await import('./pdf.worker.min.mjs')
