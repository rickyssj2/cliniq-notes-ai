/** Apple platforms use ⌘ / ⌃ chords; Win/Linux use Ctrl / Alt. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  if (uaData?.platform) {
    return /mac|iphone|ipad|ipod/i.test(uaData.platform);
  }
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function saveModKeyLabel(): "⌘" | "Ctrl" {
  return isApplePlatform() ? "⌘" : "Ctrl";
}

export function soapSectionShortcutHint(section: string): string {
  return isApplePlatform() ? `⌃${section}` : `Alt+${section}`;
}
