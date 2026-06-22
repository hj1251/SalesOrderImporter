export type Provider = "openai" | "anthropic" | "gemini" | "normal";

export type AppSettings = {
  provider: Provider;
  token: string;
  model: string;
  systemContext: string;
};

export const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-2.0-flash",
  normal: "",
};
