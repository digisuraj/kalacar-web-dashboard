import { useEffect, useState } from "react";
import { errorText, getJson, sendJson } from "./admin-api";
import { StatusChip } from "./dashboard-ui";

type Tracking = { metaPixelId: string; googleTagIds: string[] };
type Draft = { metaPixelId: string; googleTagIds: string };
const EMPTY: Tracking = { metaPixelId: "", googleTagIds: [] };
const toDraft = (value: Tracking): Draft => ({ metaPixelId: value.metaPixelId, googleTagIds: value.googleTagIds.join("\n") });

/** Meta Pixel and Google tags, loaded on every shop page. Only IDs are saved; the shop writes the code. */
export function TrackingPanel() {
  const [saved, setSaved] = useState<Tracking | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft(EMPTY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    getJson<{ tracking?: Partial<Tracking> }>("/api/admin/settings", "Settings are unavailable right now.")
      .then(data => { if (active) { const tracking = { ...EMPTY, ...data.tracking }; setSaved(tracking); setDraft(toDraft(tracking)); } })
      .catch(cause => { if (active) setError(errorText(cause, "Settings are unavailable right now.")); });
    return () => { active = false; };
  }, []);
  const change = (next: Partial<Draft>) => { setDraft(current => ({ ...current, ...next })); setError(""); setMessage(""); };
  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(saved));
  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await sendJson<{ tracking: Tracking }>("/api/admin/settings", "PATCH", { tracking: draft });
      setSaved(data.tracking); setDraft(toDraft(data.tracking));
      const count = (data.tracking.metaPixelId ? 1 : 0) + data.tracking.googleTagIds.length;
      setMessage(count ? `Saved. ${count} tag${count === 1 ? "" : "s"} now load on every shop page.` : "Saved. No ad or analytics tags load on the shop.");
    } catch (cause) { setError(errorText(cause, "Could not save the tags.")); }
    finally { setBusy(false); }
  }
  const count = saved ? (saved.metaPixelId ? 1 : 0) + saved.googleTagIds.length : 0;
  return <section className={`panel settings-card${dirty ? " dirty" : ""}`} aria-labelledby="tracking-title">
    <div className="panel-head"><div><p className="overline">ADS AND ANALYTICS</p><h2 id="tracking-title">Tracking codes</h2></div>{saved && <StatusChip tone={count ? "success" : "neutral"}>{count ? `${count} active` : "None"}</StatusChip>}</div>
    <p className="muted">These load on every page of the shop. Paste just the ID, or the whole code Meta or Google gives you: only the ID is kept.</p>
    {saved === null ? !error && <p className="muted">Loading…</p> : <div className="settings-grid">
      <label className="settings-wide">Meta (Facebook) Pixel ID<input inputMode="numeric" placeholder="e.g. 4436512496660507" value={draft.metaPixelId} onChange={event => change({ metaPixelId: event.target.value })} /><small className="field-hint">Meta Events Manager → Data sources → your pixel. Leave empty to turn it off.</small></label>
      <label className="settings-wide">Google tags (Ads, Analytics, Tag Manager)<textarea rows={4} placeholder={"One per line, e.g.\nGTM-KZJ27PVT\nG-ABC123XYZ"} value={draft.googleTagIds} onChange={event => change({ googleTagIds: event.target.value })} /><small className="field-hint">IDs start with GTM-, G- or AW-. Up to 5. Remove a line to turn that tag off.</small></label>
    </div>}
    {error && <p className="order-detail-error" role="alert">{error}</p>}
    {message && <p className="order-saved" role="status">{message}</p>}
    {saved !== null && <div className="settings-actions">{dirty && <span className="stock-change-summary">Unsaved changes</span>}<button className="text-button" type="button" disabled={!dirty || busy} onClick={() => setDraft(toDraft(saved))}>Undo</button><button className="primary" type="button" disabled={!dirty || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button></div>}
  </section>;
}
