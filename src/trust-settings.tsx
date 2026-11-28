import { useEffect, useMemo, useState } from "react";
import { errorText, getJson, sendJson } from "./admin-api";
import { Check, SaveBar, TextField } from "./editor-fields";
import { DEFAULT_TRUST, MAX_TRUST_ITEMS, TRUST_ICONS, type IconName, type ProductPageContent } from "./site-content-types";

type Trust = typeof DEFAULT_TRUST;
const hourLabel = (hour: number) => `${hour % 12 || 12}${hour < 12 ? " AM" : " PM"}`;

/** The saved settings on top of the defaults, so settings from before this tab existed open complete. */
function withDefaults(page: Partial<ProductPageContent>): Trust {
  const d = DEFAULT_TRUST, l = page.leaveSurvey;
  return {
    trustStrip: { ...d.trustStrip, ...page.trustStrip },
    deliveryDates: { ...d.deliveryDates, ...page.deliveryDates },
    buyNow: { ...d.buyNow, ...page.buyNow },
    bagTrust: { ...d.bagTrust, ...page.bagTrust, delivery: { ...d.bagTrust.delivery, ...page.bagTrust?.delivery }, taxNote: { ...d.bagTrust.taxNote, ...page.bagTrust?.taxNote }, youSave: { ...d.bagTrust.youSave, ...page.bagTrust?.youSave } },
    secureCheckout: { ...d.secureCheckout, ...page.secureCheckout },
    paymentBox: { ...d.paymentBox, ...page.paymentBox },
    payButton: { ...d.payButton, ...page.payButton },
    whatsappFloat: { ...d.whatsappFloat, ...page.whatsappFloat },
    leaveSurvey: { ...d.leaveSurvey, ...l, contact: { ...d.leaveSurvey.contact, ...l?.contact }, reasons: d.leaveSurvey.reasons.map(reason => ({ ...reason, ...l?.reasons?.find(item => item.key === reason.key) })) },
    preDispatch: { ...d.preDispatch, ...page.preDispatch },
  };
}

function IconPick({ label = "Icon", value, onChange }: { label?: string; value: IconName; onChange: (value: IconName) => void }) {
  return <label className="editor-field">{label}<select value={value} onChange={event => onChange(event.target.value as IconName)}>{TRUST_ICONS.map(([name, text]) => <option key={name} value={name}>{text}</option>)}</select></label>;
}

/**
 * Settings → Trust and checkout: the trust strip, delivery dates, Buy now and Pay buttons, bag totals,
 * secure checkout, payment box, WhatsApp button, the "Before you go" panel and the photo promise.
 * Every line has its words, an icon where it shows one, and a switch to hide it. Saves only these settings.
 */
export function TrustSettingsPanel() {
  const [saved, setSaved] = useState<Trust | null>(null);
  const [draft, setDraft] = useState<Trust | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    getJson<{ productPage: ProductPageContent }>("/api/admin/site-content", "Settings are unavailable right now.").then(data => { if (active) { const next = withDefaults(data.productPage); setSaved(next); setDraft(next); } }).catch(cause => { if (active) setError(errorText(cause, "Settings are unavailable right now.")); });
    return () => { active = false; };
  }, []);
  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const shell = (children: React.ReactNode) => <section className={`panel settings-card${dirty ? " dirty" : ""}`} aria-labelledby="trust-settings-title"><div className="panel-head"><div><p className="overline">PRODUCT PAGE, BAG AND CHECKOUT</p><h2 id="trust-settings-title">Trust and checkout</h2></div></div>{children}</section>;
  if (!draft || !saved) return shell(error ? <p className="order-detail-error" role="alert">{error}</p> : <p className="muted">Loading settings…</p>);
  const set = <K extends keyof Trust>(key: K, change: Partial<Trust[K]>) => { setDraft(current => current && { ...current, [key]: { ...current[key], ...change } }); setMessage(""); };
  const { trustStrip, deliveryDates, buyNow, bagTrust, secureCheckout, paymentBox, payButton, whatsappFloat, leaveSurvey, preDispatch } = draft;
  const editItem = (index: number, change: Partial<Trust["trustStrip"]["items"][number]>) => set("trustStrip", { items: trustStrip.items.map((item, i) => i === index ? { ...item, ...change } : item) });
  const setBag = <K extends "delivery" | "taxNote" | "youSave">(key: K, change: Partial<Trust["bagTrust"][K]>) => set("bagTrust", { [key]: { ...bagTrust[key], ...change } } as Partial<Trust["bagTrust"]>);
  const setContact = (change: Partial<Trust["leaveSurvey"]["contact"]>) => set("leaveSurvey", { contact: { ...leaveSurvey.contact, ...change } });
  const setReason = (key: string, change: { label?: string; show?: boolean }) => set("leaveSurvey", { reasons: leaveSurvey.reasons.map(reason => reason.key === key ? { ...reason, ...change } : reason) });
  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      // Other settings cards may have saved since this one loaded, so only these settings change.
      const latest = await getJson<{ productPage: ProductPageContent }>("/api/admin/site-content", "Settings are unavailable right now.");
      const data = await sendJson<{ productPage: ProductPageContent }>("/api/admin/site-content", "PATCH", { productPage: { ...latest.productPage, ...draft } });
      const next = withDefaults(data.productPage);
      setSaved(next); setDraft(next); setMessage("Saved. The shop is updated.");
    }
    catch (cause) { setError(errorText(cause, "Could not save settings.")); }
    finally { setBusy(false); }
  }
  return shell(<>
    <p className="muted">Everything here helps shoppers trust the shop before they pay. Change any words, pick icons, or switch a part off. Only promise what you always do.</p>

    <fieldset className="editor-group"><legend>Trust strip under the Buy buttons</legend>
      <Check label="Show the trust strip" checked={trustStrip.show} onChange={show => set("trustStrip", { show })} hint="Up to 4 promises with icons, on every product page." />
      {trustStrip.items.map((item, index) => <div className="editor-row" key={index}>
        <IconPick value={item.icon} onChange={icon => editItem(index, { icon })} />
        <TextField label={`Promise ${index + 1}`} value={item.title} max={40} onChange={title => editItem(index, { title })} />
        <TextField label="Small line under it" value={item.text} max={60} onChange={text => editItem(index, { text })} />
        <button className="text-button" type="button" onClick={() => set("trustStrip", { items: trustStrip.items.filter((_, i) => i !== index) })}>Remove</button>
      </div>)}
      <button className="secondary" type="button" disabled={trustStrip.items.length >= MAX_TRUST_ITEMS} onClick={() => set("trustStrip", { items: [...trustStrip.items, { icon: "check", title: "", text: "" }] })}>+ Add promise</button>
    </fieldset>

    <fieldset className="editor-group"><legend>Buy now button</legend>
      <TextField label="Button text" value={buyNow.label} max={30} onChange={label => set("buyNow", { label })} />
      <IconPick label="Icon before the text" value={buyNow.icon} onChange={icon => set("buyNow", { icon })} />
      <Check label="Show payment names under the text" checked={buyNow.showMarks} onChange={showMarks => set("buyNow", { showMarks })} />
      <TextField label="Payment names" value={buyNow.marks} max={100} onChange={marks => set("buyNow", { marks })} hint="Separate with commas, e.g. UPI, GPay, PhonePe, Paytm." />
    </fieldset>

    <fieldset className="editor-group"><legend>Delivery dates</legend>
      <Check label="Show delivery dates" checked={deliveryDates.show} onChange={show => set("deliveryDates", { show })} hint="Off: the line says “Delivered in 3–7 business days.” instead. Dates come from the delivery time in Product page settings, skipping Sundays." />
      <TextField label="Text" value={deliveryDates.text} max={120} onChange={text => set("deliveryDates", { text })} hint="{from} and {to} become the dates, e.g. “Thu, 3 Dec”." />
      <TextField label="Line after it" value={deliveryDates.note} max={120} onChange={note => set("deliveryDates", { note })} hint="Leave empty to hide it." />
      <label className="editor-field">Orders after this time count from the next day (India time)<select value={deliveryDates.cutoffHour} onChange={event => set("deliveryDates", { cutoffHour: Number(event.target.value) })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}</select></label>
    </fieldset>

    <fieldset className="editor-group"><legend>Bag totals</legend>
      <Check label="Show the trust strip's promises, small, in the bag and at checkout" checked={bagTrust.showLine} onChange={showLine => set("bagTrust", { showLine })} hint="Each with its icon and a green tick after the words: above Proceed to checkout, and above Pay." />
      <Check label="Show the delivery row" checked={bagTrust.delivery.show} onChange={show => setBag("delivery", { show })} />
      <div className="editor-row"><TextField label="Delivery row name" value={bagTrust.delivery.label} max={30} onChange={label => setBag("delivery", { label })} /><TextField label="Delivery row value" value={bagTrust.delivery.value} max={20} onChange={value => setBag("delivery", { value })} /></div>
      <Check label="Show the tax note under the total" checked={bagTrust.taxNote.show} onChange={show => setBag("taxNote", { show })} />
      <TextField label="Tax note" value={bagTrust.taxNote.text} max={60} onChange={text => setBag("taxNote", { text })} />
      <Check label="Show the saving when a coupon is used" checked={bagTrust.youSave.show} onChange={show => setBag("youSave", { show })} />
      <TextField label="Saving text" value={bagTrust.youSave.text} max={80} onChange={text => setBag("youSave", { text })} hint="{amount} becomes the coupon saving." />
    </fieldset>

    <fieldset className="editor-group"><legend>Checkout</legend>
      <Check label="Large green page title with an icon" checked={secureCheckout.show} onChange={show => set("secureCheckout", { show })} hint="Replaces “SECURE CHECKOUT / Checkout” at the top of the checkout page. Off: the plain “Checkout” title." />
      <div className="editor-row"><IconPick value={secureCheckout.icon} onChange={icon => set("secureCheckout", { icon })} /><TextField label="Page title" value={secureCheckout.label} max={40} onChange={label => set("secureCheckout", { label })} /></div>
      <Check label="Show the payment box above Pay" checked={paymentBox.show} onChange={show => set("paymentBox", { show })} />
      <div className="editor-row"><IconPick value={paymentBox.icon} onChange={icon => set("paymentBox", { icon })} /><TextField label="Title" value={paymentBox.title} max={60} onChange={title => set("paymentBox", { title })} /></div>
      <TextField label="Payment names" value={paymentBox.marks} max={150} onChange={marks => set("paymentBox", { marks })} hint="Separate with commas. Leave empty to hide them." />
      <TextField label="Note" value={paymentBox.note} max={300} rows={2} onChange={note => set("paymentBox", { note })} hint="Leave empty to hide it." />
      <div className="editor-row"><IconPick label="Pay button icon" value={payButton.icon} onChange={icon => set("payButton", { icon })} /><TextField label="Pay button text" value={payButton.label} max={40} onChange={label => set("payButton", { label })} hint="{total} becomes the amount." /></div>
    </fieldset>

    <fieldset className="editor-group"><legend>WhatsApp button</legend>
      <Check label="Round WhatsApp button on every page" checked={whatsappFloat.show} onChange={show => set("whatsappFloat", { show })} />
      <TextField label="Bubble next to it" value={whatsappFloat.label} max={60} onChange={label => set("whatsappFloat", { label })} hint="Shows after a few seconds and can be closed. Leave empty for no bubble." />
      <TextField label="Message on product pages" value={whatsappFloat.productMessage} max={300} rows={2} onChange={productMessage => set("whatsappFloat", { productMessage })} hint="{product} becomes the murti's name." />
      <TextField label="Message on other pages" value={whatsappFloat.message} max={300} rows={2} onChange={message => set("whatsappFloat", { message })} />
    </fieldset>

    <fieldset className="editor-group"><legend>“Before you go” panel</legend>
      <Check label="At checkout: when someone presses Back or closes the payment window" checked={leaveSurvey.show} onChange={show => set("leaveSurvey", { show })} hint="On computers also when the pointer leaves the page. Once per visit." />
      <Check label="When someone presses Back to leave the shop" checked={leaveSurvey.siteShow} onChange={siteShow => set("leaveSurvey", { siteShow })} hint="Only on the page they arrived on (from an ad, Google or WhatsApp). Moving around the shop is never stopped." />
      <TextField label="Heading" value={leaveSurvey.title} max={80} onChange={title => set("leaveSurvey", { title })} />
      <TextField label="Line under it, at checkout" value={leaveSurvey.intro} max={200} onChange={intro => set("leaveSurvey", { intro })} hint="Leave empty to hide it." />
      <TextField label="Line under it, when leaving the shop" value={leaveSurvey.siteIntro} max={200} onChange={siteIntro => set("leaveSurvey", { siteIntro })} hint="Leave empty to hide it." />
      <Check label="Show the big “talk to a real person” box" checked={leaveSurvey.contact.show} onChange={show => setContact({ show })} />
      <TextField label="Box heading" value={leaveSurvey.contact.title} max={60} onChange={title => setContact({ title })} />
      <TextField label="Box text" value={leaveSurvey.contact.text} max={300} rows={2} onChange={text => setContact({ text })} hint="Leave empty to hide it." />
      <div className="editor-row"><TextField label="WhatsApp button text" value={leaveSurvey.contact.whatsappLabel} max={40} onChange={whatsappLabel => setContact({ whatsappLabel })} /><TextField label="WhatsApp message" value={leaveSurvey.contact.whatsappMessage} max={300} onChange={whatsappMessage => setContact({ whatsappMessage })} /></div>
      <Check label="Show a Call button" checked={leaveSurvey.contact.showCall} onChange={showCall => setContact({ showCall })} hint="Calls the shop's WhatsApp number." />
      <TextField label="Call button text" value={leaveSurvey.contact.callLabel} max={40} onChange={callLabel => setContact({ callLabel })} />
      <Check label="Ask what stopped them" checked={leaveSurvey.showQuestions} onChange={showQuestions => set("leaveSurvey", { showQuestions })} hint="Answers appear in Checkouts." />
      {leaveSurvey.reasons.map(reason => <div className="editor-row trust-reason" key={reason.key}>
        <Check label="Show" checked={reason.show} onChange={show => setReason(reason.key, { show })} />
        <TextField label="Answer" value={reason.label} max={80} onChange={label => setReason(reason.key, { label })} />
      </div>)}
      <div className="editor-row"><TextField label="Stay button at checkout" value={leaveSurvey.continueLabel} max={40} onChange={continueLabel => set("leaveSurvey", { continueLabel })} /><TextField label="Stay button when leaving the shop" value={leaveSurvey.siteContinueLabel} max={40} onChange={siteContinueLabel => set("leaveSurvey", { siteContinueLabel })} /><TextField label="Leave button" value={leaveSurvey.exitLabel} max={40} onChange={exitLabel => set("leaveSurvey", { exitLabel })} /></div>
    </fieldset>

    <fieldset className="editor-group"><legend>Photo before dispatch</legend>
      <Check label="Show this step on the order confirmed page" checked={preDispatch.show} onChange={show => set("preDispatch", { show })} hint="Send the photo on WhatsApp for every order." />
      <TextField label="Step title" value={preDispatch.title} max={60} onChange={title => set("preDispatch", { title })} />
      <TextField label="Step text" value={preDispatch.text} max={300} rows={2} onChange={text => set("preDispatch", { text })} />
    </fieldset>
    <SaveBar dirty={dirty} busy={busy} message={message} error={error} onUndo={() => { setDraft(saved); setMessage(""); setError(""); }} onSave={() => void save()} label="Save trust and checkout" />
  </>);
}
