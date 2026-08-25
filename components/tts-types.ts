/** Per-line spoken-audio state, keyed by the line's index in `log`. */
export interface TtsLine {
  status: "loading" | "ready" | "playing" | "error" | "muted";
  url?: string;
}
