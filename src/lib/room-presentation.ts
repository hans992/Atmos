// Presentation hints only: no schema, device metadata, or status thresholds change.
export function isOutdoor(name: string) {
  return /\b(outdoor|outside|balcony|balkon|garden|garten|terrace|terrasse|patio)\b|außen|aussen/i.test(
    name,
  );
}
export function roomTone(
  name: string,
): "aqua" | "lavender" | "sand" | "rose" | "slate" | "green" | "blue" {
  if (isOutdoor(name)) return "green";
  if (/bath|\bbad\b|badezimmer/i.test(name)) return "aqua";
  if (/bed|schlaf/i.test(name)) return "lavender";
  if (/kitchen|küche|kueche/i.test(name)) return "sand";
  if (/nursery|child|kinder/i.test(name)) return "rose";
  if (/office|büro|buero|arbeit/i.test(name)) return "slate";
  return "blue";
}
