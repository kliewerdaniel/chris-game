/**
 * Canonical topic → human label map, shared by the engine and the ADR-005
 * chat resolver so every caller renders the same label. (Previously duplicated
 * across game-engine.ts + each episode; consolidated here.)
 */
export function topicToLabel(topic: string): string {
  const map: Record<string, string> = {
    is_chris: "whether it's really Chris",
    voice: "whether it's really his voice",
    memory: "whether it really remembers",
    feed: "the feed",
    act: "the act / KonradFreeman",
    misinfo: "the misinformation it makes",
    toll: "what it's doing to you",
    cats: "Captain the cat",
    mother: "your mother",
    note: "the post",
    general: "the feed",
  };
  return map[topic] ?? topic;
}
