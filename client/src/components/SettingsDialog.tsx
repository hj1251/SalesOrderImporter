import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/lib/settings";
import { DEFAULT_MODELS, type AppSettings, type Provider } from "@/lib/settings-constants";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { settings, save } = useSettings();
  const { toast } = useToast();

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-sync the draft whenever the dialog is opened or settings change.
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const modelPlaceholder = DEFAULT_MODELS[draft.provider] || "(no model needed)";

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(draft);
      toast({ title: "Settings saved", description: "Your provider and token are ready." });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Could not save settings",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-settings">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Bring your own API key. Calls go directly to your OpenAI, Anthropic, or Google account.
            Use Normal mode to import CSV or build a table manually — no key needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Provider */}
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select
              value={draft.provider}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, provider: v as Provider }))
              }
            >
              <SelectTrigger id="provider" data-testid="select-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai" data-testid="option-openai">OpenAI (ChatGPT)</SelectItem>
                <SelectItem value="anthropic" data-testid="option-anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="gemini" data-testid="option-gemini">Google (Gemini)</SelectItem>
                <SelectItem value="normal" data-testid="option-normal">Normal (CSV / manual, no key)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Token */}
          <div className="space-y-2">
            <Label htmlFor="token">API Token</Label>
            <div className="relative">
              <Input
                id="token"
                data-testid="input-token"
                type={showToken ? "text" : "password"}
                placeholder={draft.provider === "normal" ? "Not required for demo" : "sk-…"}
                value={draft.token}
                disabled={draft.provider === "normal"}
                onChange={(e) => setDraft((d) => ({ ...d, token: e.target.value }))}
                className="pr-10 font-mono text-sm"
                autoComplete="off"
              />
              {draft.provider !== "normal" && (
                <button
                  type="button"
                  data-testid="button-toggle-token"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover-elevate rounded p-1"
                  aria-label={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Stored locally for this tool only. Never shown again once masked.
            </p>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              data-testid="input-model"
              placeholder={modelPlaceholder}
              value={draft.model}
              disabled={draft.provider === "normal"}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the default: <span className="font-mono">{modelPlaceholder}</span>
            </p>
          </div>

          {/* Custom system context */}
          <div className="space-y-2">
            <Label htmlFor="systemContext">Custom system context / instructions</Label>
            <Textarea
              id="systemContext"
              data-testid="input-system-context"
              placeholder="e.g. Our SKUs are always 8 digits. Add a column 'Warehouse'. Use GBP for unit cost."
              value={draft.systemContext}
              onChange={(e) => setDraft((d) => ({ ...d, systemContext: e.target.value }))}
              rows={4}
              className="resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Appended to the base extraction prompt — override columns or add company rules.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-settings">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-settings">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
