import { createContext, useContext, useEffect, useState } from "react";
import type { AppSettings, Provider } from "./settings-constants";

export type { Provider, AppSettings } from "./settings-constants";
export { DEFAULT_MODELS } from "./settings-constants";

const DEFAULTS: AppSettings = {
  provider: "normal",
  token: "",
  model: "",
  systemContext: "",
};

const STORAGE_KEY = "po-importer-settings";

function loadStored(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      provider: (parsed.provider ?? "normal") as Provider,
      token: parsed.token ?? "",
      model: parsed.model ?? "",
      systemContext: parsed.systemContext ?? "",
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(next: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

const SettingsContext = createContext<{
  settings: AppSettings;
  loading: boolean;
  save: (next: AppSettings) => Promise<void>;
}>({ settings: DEFAULTS, loading: false, save: async () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSettings(loadStored());
  }, []);

  const save = async (next: AppSettings) => {
    setSettings(next);
    persist(next);
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, save }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
