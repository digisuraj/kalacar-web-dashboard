import type { ReactNode } from "react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { DataTable, FormField, ModalDrawer, StatusChip } from "./dashboard-ui";
import { Customers } from "./customers";
import { CategoriesPanel, loadCategories } from "./categories";
import type { Category } from "./categories";
import { Coupons } from "./coupons";
import { useLiveRefresh } from "./live";
import { useOrderChanges } from "./live";
import { stopLive, useLiveRevision } from "./realtime";
import { OrderAlertsPanel, useOrderAlerts } from "./order-alerts";
import { removeThisDeviceFromAlerts } from "./push-alerts";
import { InquiriesSection } from "./inquiries-section";
import { PaymentStatusPanel } from "./payment-status";
import { SettingsTabs } from "./settings-tabs";
import { ProductPageSettingsPanel } from "./product-page-settings";
import { ReviewsSection } from "./reviews-section";
import { FestivePanel } from "./festive-settings";
import { InstagramPanel } from "./instagram-settings";
import { LogoPanel } from "./logo-settings";
import { TrackingPanel } from "./tracking-settings";
import { ShopLinkPanel, VisitWebsiteLink, loadShopLink } from "./shop-link";
import { StoreVisibilityPanel, loadStoreSettings } from "./store-visibility";
import type { StoreSettings as StoreVisibility } from "./store-visibility";
import { MessageButtons, MessageTemplatesPanel, useMessageConfig } from "./messages";
import { PrintLabelButton, PrintLabelPanel, useLabelConfig } from "./print-label";
import type { LabelConfig } from "./print-label";
import type { MessageConfig } from "./messages";
import { shrinkImage } from "./admin-api";
import { AlertIcon, ArrowRight, CheckIcon, ChevronDown, CloseIcon, EnterIcon, OrdersIcon, PackageIcon, RupeeIcon, SearchIcon, SignOutIcon, TrendIcon, sectionIcons } from "./icons";

type ProductAccordion = { id: string; title: string; content: string; format?: "rows" | "text"; active: boolean; defaultOpen: boolean };
type ProductAccordionRowDraft = { id: string; label: string; value: string };
type ProductAccordionDraft = ProductAccordion & { mode: "rows" | "text"; rows: ProductAccordionRowDraft[] };
type ProductImageDraft = { key: string; src?: string; file?: File; preview: string };
type Colour = { id: string; name: string; swatch: string; gallery: string[]; price: number; originalPrice: number; stock: number; sort: number; active: boolean };
type Product = { id: string; name: string; deity: string; categories?: string[]; description?: string; bundleIds?: string[]; badge?: string; tagline?: string; specs?: { label: string; value: string }[]; highlights?: string[]; image: string; gallery?: string[]; placement?: string; accordions?: ProductAccordion[]; price: number; stock: number; variants: Colour[] };
type Order = { id: string; date: string; customer: string; item: string; total: number; status: string; fulfillmentStatus?: string; trackingNote?: string; trackingCourier?: string; trackingId?: string; giftWrap?: boolean; email?: string; phone?: string; address?: string; pincode?: string };
type OrderDetail = Order & { items: { id: string; name: string; variant?: string; price: number; quantity: number }[]; giftWrap?: boolean; giftWrapPrice?: number; couponCode?: string; discount?: number; rawStatus: string; trackingNote: string; cancelReason: string; cancelledAt: string | null; refundAmount: number | null; refundReason: string; refundReference: string; refundedAt: string | null };
type AdminMetrics = { todayRevenue: number; monthRevenue: number; totalOrders: number; paidOrders: number; averageOrderValue: number; lowStockProducts: number; outOfStockProducts: number; lowStockThreshold: number; fulfillmentNeeded: number; paymentRecovery: number; paymentMode: "test" | "live" | "unconfigured" };
type OrderFilter = "all" | "pending_payment" | "processing" | "on_hold" | "dispatched" | "completed" | "cancelled" | "refunded";
type OrderStatusCounts = Record<OrderFilter, number>;
type Section = "Overview" | "Orders" | "Products" | "Customers" | "Coupons" | "Pages" | "Reviews" | "Inquiries" | "Settings";
const sections: Section[] = ["Overview", "Orders", "Products", "Customers", "Coupons", "Pages", "Reviews", "Inquiries", "Settings"];
const sectionPaths: Record<Section, string> = { Overview: "/", Orders: "/orders", Products: "/products", Customers: "/customers", Coupons: "/coupons", Pages: "/pages", Reviews: "/reviews", Inquiries: "/inquiries", Settings: "/settings" };
type Route = { section: Section; orderId: string };
const routePath = ({ section, orderId }: Route) => orderId ? `${sectionPaths.Orders}/${orderId}` : sectionPaths[section];
function readRoute(): Route {
  const [first = "", second = ""] = window.location.pathname.split("/").filter(Boolean);
  const section = sections.find(item => sectionPaths[item] === `/${first}`) ?? "Overview";
  return { section, orderId: section === "Orders" && /^[0-9a-f-]{36}$/i.test(second) ? second : "" };
}
const orderFilters: { key: OrderFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "pending_payment", label: "Pending payment" },
  { key: "processing", label: "Processing" }, { key: "on_hold", label: "On hold" },
  { key: "dispatched", label: "Dispatched" }, { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" }, { key: "refunded", label: "Refunded" },
];

function parseAccordionRows(content: string): ProductAccordionRowDraft[] | null {
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const rows: ProductAccordionRowDraft[] = [];
  for (const line of lines) {
    const separator = line.indexOf(": ");
    if (separator < 1 || separator > 80) return null;
    const label = line.slice(0, separator).trim();
    const value = line.slice(separator + 2).trim();
    if (!label || !value) return null;
    rows.push({ id: crypto.randomUUID(), label, value });
  }
  return rows;
}

function toAccordionDraft(section: ProductAccordion): ProductAccordionDraft {
  const rows = parseAccordionRows(section.content);
  return { ...section, mode: section.format ?? (rows ? "rows" : "text"), rows: rows ?? [{ id: crypto.randomUUID(), label: "", value: "" }] };
}

async function loadAdminMetrics() {
  const response = await fetch("/api/admin/metrics", { cache: "no-store" });
  const data = await response.json() as AdminMetrics & { error?: string };
  if (!response.ok) throw new Error(data.error || "Dashboard metrics are temporarily unavailable.");
  return data;
}

// The page editor is large, so it loads only when Pages is opened.
const PagesSection = lazy(() => import("./pages-section").then(module => ({ default: module.PagesSection })));

export default function Dashboard() {
  const [owner, setOwner] = useState<{ name: string; email: string } | null>(null);
  const [authState, setAuthState] = useState<"checking" | "signedOut" | "notOwner" | "ready">("checking");
  const [authError, setAuthError] = useState("");
  const signedIn = authState === "ready";
  const [storeMode, setStoreMode] = useState<StoreVisibility["mode"] | "">("");
  
  const [shopLink, setShopLink] = useState("");
  useEffect(() => { if (signedIn) void loadShopLink().then(setShopLink).catch(() => undefined); }, [signedIn]);
  // The address bar holds the open tab, so refresh, Back and shared links all work.
  const [route, setRoute] = useState<Route>(readRoute);
  const section = route.section;
  function navigate(next: Route) {
    setRoute(next);
    if (window.location.pathname !== routePath(next)) { window.history.pushState(null, "", routePath(next)); window.scrollTo(0, 0); }
  }
  const setSection = (next: Section) => navigate({ section: next, orderId: "" });
  useEffect(() => {
    const onHistory = () => setRoute(readRoute());
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, []);
  const ordersRevision = useOrderChanges(signedIn);
  const productsRevision = useLiveRevision(signedIn, "products");
  const storeRevision = useLiveRevision(signedIn, "store");
  useEffect(() => { if (signedIn) void loadStoreSettings().then(store => setStoreMode(store.mode)).catch(() => undefined); }, [signedIn, storeRevision]);
  const { newCount, soundNeedsClick } = useOrderAlerts(signedIn, section === "Orders", ordersRevision);
  useEffect(() => { document.title = `${newCount ? `(${newCount}) ` : ""}${section} · Kalacar owner`; }, [section, newCount]);
  // An address that isn't a dashboard page shows Overview, so make the address say so too.
  useEffect(() => { if (window.location.pathname !== routePath(route)) window.history.replaceState(null, "", routePath(route) + window.location.search); }, [route]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(() => window.sessionStorage.getItem("kalacar-dashboard-banner-dismissed") !== "yes");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [orderCounts, setOrderCounts] = useState<OrderStatusCounts | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const ordersListShown = useRef("");
  const [ordersError, setOrdersError] = useState("");
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [metricsError, setMetricsError] = useState("");
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [apiError, setApiError] = useState("");

  async function refreshProducts() {
    try {
      const response = await fetch("/api/admin/products", { cache: "no-store" });
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json() as { products: Product[] };
      setProducts(data.products);
      setApiError("");
    } catch {
      setProducts([]);
      setApiError("Shared inventory is unavailable. Product information is hidden until the connection returns.");
    }
  }

  useEffect(() => {
    if (!signedIn) return;
    void refreshProducts();
    // Changes arrive through the revisions. This is the backstop for a missed signal.
    const timer = window.setInterval(() => { if (!document.hidden) void refreshProducts(); }, 5 * 60000);
    return () => window.clearInterval(timer);
  }, [section, signedIn, ordersRevision, productsRevision]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const reason = url.searchParams.get("auth_error");
    if (reason) {
      setAuthError({ cancelled: "Google sign-in was cancelled.", expired: "Google sign-in expired. Please try again.", unverified: "That Google email isn’t verified.", not_owner: "That Google account isn’t listed as a shop owner, so it can’t open the dashboard. Your shop sign-in is unchanged.", unavailable: "Google confirmed your account, but the shop's database can't be reached, so sign-in couldn't finish.", google: "Google didn't accept the sign-in. Check the Google client ID and secret on the shop's server." }[reason] ?? "Google sign-in failed. Please try again.");
      url.searchParams.delete("auth_error");
      window.history.replaceState(null, "", url);
    }
    const checkSession = () => fetch("/api/auth/session?scope=owner", { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as { user?: { name: string; email: string } | null; isOwner?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error || "Account service is unavailable.");
        setOwner(data.user ?? null);
        setAuthState(!data.user ? "signedOut" : data.isOwner ? "ready" : "notOwner");
      })
      .catch(error => { setAuthError(error instanceof Error ? error.message : "Account service is unavailable."); setAuthState("signedOut"); });
    void checkSession();
    // Back can restore an old copy of the sign-in page; check again so a signed-in owner goes straight in.
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) { setRoute(readRoute()); void checkSession(); } };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function signOut() {
    await removeThisDeviceFromAlerts();
    stopLive();
    await fetch("/api/auth/logout?scope=owner", { method: "POST" }).catch(() => undefined);
    setOwner(null); setProfileOpen(false); setAuthState("signedOut");
  }

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    const requestFilter = section === "Orders" ? orderFilter : "all";
    // A background reload keeps what's on screen: no loading message, and a brief failure doesn't blank the list.
    const background = ordersListShown.current === requestFilter;
    if (!background) { setOrdersLoading(true); setOrdersError(""); }
    const refreshOrders = async () => {
      try {
        const response = await fetch(`/api/admin/orders?status=${requestFilter}`, { cache: "no-store" });
        const data = await response.json() as { orders?: Order[]; statusCounts?: OrderStatusCounts; error?: string };
        if (!response.ok) throw new Error(data.error || "Orders are temporarily unavailable.");
        if (active) { ordersListShown.current = requestFilter; setOrders(data.orders ?? []); setOrderCounts(data.statusCounts ?? null); setOrdersError(""); }
      } catch (error) { if (active && ordersListShown.current !== requestFilter) { setOrders([]); setOrderCounts(null); setOrdersError(error instanceof Error ? error.message : "Orders are temporarily unavailable."); } }
      finally { if (active) setOrdersLoading(false); }
    };
    void refreshOrders();
    // Changes arrive through ordersRevision. This is the backstop.
    const timer = window.setInterval(() => { if (!document.hidden) void refreshOrders(); }, 5 * 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [orderFilter, section, signedIn, ordersRevision]);

  // Overview numbers reload when an order changes, with a once-a-minute backstop while the tab is open.
  useLiveRefresh(async () => {
    try { setMetrics(await loadAdminMetrics()); setMetricsError(""); }
    catch (error) { setMetrics(null); setMetricsError(error instanceof Error ? error.message : "Dashboard metrics are temporarily unavailable."); }
    finally { setMetricsLoading(false); }
  }, 5 * 60000, [ordersRevision, productsRevision], signedIn);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setCommandOpen(true); setCommandQuery("");
      }
      if (event.key === "Escape") { setCommandOpen(false); setProfileOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** Saves a delivery status; returns an error message, or "" when saved. */
  async function updateOrder(id: string, fulfillmentStatus: string, expected: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fulfillmentStatus, expected }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not update order.");
      const refreshed = await fetch(`/api/admin/orders?status=${orderFilter}`, { cache: "no-store" });
      if (!refreshed.ok) throw new Error("Status saved, but the order list could not refresh.");
      const result = await refreshed.json() as { orders: Order[]; statusCounts: OrderStatusCounts };
      setOrders(result.orders); setOrderCounts(result.statusCounts);
      try {
        const refreshedMetrics = await loadAdminMetrics();
        setMetrics(refreshedMetrics); setMetricsError("");
      } catch (error) {
        setMetrics(null); setMetricsError(error instanceof Error ? error.message : "Dashboard metrics are temporarily unavailable.");
      }
      setMessage("Order progress updated for the customer account.");
      window.setTimeout(() => setMessage(""), 4500);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Could not update order.";
    }
  }

  /** Unsaved quick edits, per product. Kept apart from server data so refreshes never wipe them. */
  const [productDrafts, setProductDrafts] = useState<ProductDrafts>({});
  const unsavedCount = Object.keys(productDrafts).length;
  useEffect(() => {
    if (!unsavedCount) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedCount]);
  /** After a colour quick-save (or a conflict), update that colour and the product's summary locally. */
  function colourSaved(productId: string, colourId: string, values: { price: number; stock: number }) {
    setProducts(list => list.map(item => {
      if (item.id !== productId) return item;
      const variants = item.variants.map(v => v.id === colourId ? { ...v, ...values, originalPrice: Math.max(v.originalPrice, values.price) } : v);
      const visible = variants.filter(v => v.active);
      return { ...item, variants, stock: visible.reduce((sum, v) => sum + v.stock, 0), price: visible.length ? Math.min(...visible.map(v => v.price)) : item.price };
    }));
  }


  if (authState === "checking") return <main className="login-shell"><p className="muted">Checking your sign-in…</p></main>;
  if (!signedIn) return <main className="login-shell"><section className="login-card">
    <span className="brand-mark">k.</span><p className="overline">KALACAR · OWNER SPACE</p><h1>Welcome back</h1>
    <p className="muted">{authState === "notOwner" ? `${owner?.email ?? "This account"} isn’t on the owner list.` : "Sign in with the shop owner’s Google account."}</p>
    {authError && <p className="form-error" role="alert">{authError}</p>}
    {authState === "notOwner"
      ? <button className="primary wide" onClick={() => void signOut()}>Sign out and use another account</button>
      : <a className="google-button" href={`/api/auth/google/start?next=${encodeURIComponent(window.location.pathname)}&scope=owner`}><svg aria-hidden="true" viewBox="0 0 18 18" width="18" height="18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>Continue with Google</a>}
    <p className="demo-note">Only the shop owner's Google accounts can open the dashboard.</p>
  </section></main>;

  const todayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase();
  const pendingCount = orderCounts?.pending_payment ?? 0;
  const content = section === "Products" ? <Products products={products} drafts={productDrafts} setDrafts={setProductDrafts} onColourSaved={colourSaved} onProductCreated={refreshProducts} apiError={apiError} /> : section === "Orders" ? <Orders orders={orders} loading={ordersLoading} error={ordersError} filter={orderFilter} counts={orderCounts} onFilter={setOrderFilter} paymentMode={metrics?.paymentMode ?? "unconfigured"} onUpdate={updateOrder} routeOrderId={route.orderId} onOpenOrder={id => navigate({ section: "Orders", orderId: id })} onCloseOrder={() => navigate({ section: "Orders", orderId: "" })} /> : section === "Coupons" ? <Coupons /> : section === "Pages" ? <Suspense fallback={<p className="muted">Loading the page editor…</p>}><PagesSection products={products.map(({ id, name }) => ({ id, name }))} shopLink={shopLink} /></Suspense> : section === "Reviews" ? <ReviewsSection products={products.map(({ id, name }) => ({ id, name }))} /> : section === "Inquiries" ? <InquiriesSection /> : section === "Customers" ? <Customers onOpenOrder={id => { setOrderFilter("all"); navigate({ section: "Orders", orderId: id }); }} /> : section === "Overview" ? <>
    <div className="welcome-row"><div><p className="overline">{todayLabel}</p><h1>Good morning</h1><p className="muted">A clear view of your little shop.</p></div></div>
    {metrics?.paymentMode === "test" && <p className="test-mode-warning" role="note">Razorpay test mode · Orders and revenue shown here are test activity, not live sales.</p>}
    {metrics?.paymentMode === "unconfigured" && <p className="test-mode-warning" role="note">Payment mode is not configured · Do not treat these order totals as live sales.</p>}
    <section className="metrics" aria-label="Store performance"><Metric label="Revenue today" value={metrics ? formatMoney(metrics.todayRevenue) : metricsLoading ? "Loading…" : "Unavailable"} detail={metrics ? `${formatMoney(metrics.monthRevenue)} this month` : "Monthly paid orders"} icon={<RupeeIcon />} /><Metric label="Total orders" value={metrics ? String(metrics.totalOrders) : metricsLoading ? "Loading…" : "Unavailable"} detail={metrics ? `${metrics.paidOrders} paid orders` : "All payment states"} icon={<OrdersIcon />} /><Metric label="Average order value" value={metrics ? formatMoney(metrics.averageOrderValue, true) : metricsLoading ? "Loading…" : "Unavailable"} detail="Based on captured payments" icon={<TrendIcon />} /><Metric label="Low-stock products" value={metrics ? String(metrics.lowStockProducts) : metricsLoading ? "Loading…" : "Unavailable"} detail={metrics ? `Out of stock: ${metrics.outOfStockProducts} · low at 1–${metrics.lowStockThreshold} units` : "Threshold is configurable"} icon={<PackageIcon />} /></section>
    <OperationsInbox metrics={metrics} loading={metricsLoading} error={metricsError} onRetry={() => { setMetricsLoading(true); void loadAdminMetrics().then(result => { setMetrics(result); setMetricsError(""); }).catch(error => { setMetrics(null); setMetricsError(error instanceof Error ? error.message : "Dashboard metrics are temporarily unavailable."); }).finally(() => setMetricsLoading(false)); }} onOpen={setSection} />
    <section className="panel order-panel"><div className="panel-head"><div><p className="overline">LATEST ACTIVITY</p><h2>Order requests</h2></div><button className="text-button" onClick={() => setSection("Orders")}>View all <ArrowRight size={14} /></button></div>{ordersLoading ? <p className="empty-orders">Loading orders…</p> : ordersError ? <p className="empty-orders" role="alert">{ordersError}</p> : orders.length ? <OrderTable orders={orders.slice(0, 2)} /> : <p className="empty-orders">No orders have been recorded.</p>}</section>
    <section className="panel stock-panel"><div className="panel-head"><div><p className="overline">INVENTORY</p><h2>Stock at a glance</h2></div><button className="text-button" onClick={() => setSection("Products")}>Manage stock <ArrowRight size={14} /></button></div>{products.length ? <ProductRows products={products.slice(0, 3)} /> : <p className="empty-orders">{apiError || "No products have been added."}</p>}</section>
  </> : section === "Settings" ? <StoreSettings onStoreSaved={store => setStoreMode(store.mode)} onShopLinkSaved={setShopLink} /> : <div className="page-heading"><div><p className="overline">WORKSPACE</p><h1>{section}</h1><p className="muted">This workspace is planned and will be added in a later dashboard feature.</p></div><StatusChip tone="neutral">Planned</StatusChip></div>;

  const filteredSections = sections.filter(item => item.toLowerCase().includes(commandQuery.toLowerCase()));
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="/" onClick={event => { event.preventDefault(); setSection("Overview"); }}><span className="brand-mark">k.</span><span>kalacar</span></a><VisitWebsiteLink link={shopLink} onSetUp={() => setSection("Settings")} /><p className="nav-label">WORKSPACE</p><nav>{sections.map(item => <button key={item} className={section === item ? "nav-item selected" : "nav-item"} onClick={() => { setSection(item); setMessage(""); }}><span className="nav-icon">{(() => { const Icon = sectionIcons[item]; return <Icon />; })()}</span>{item}{item === "Orders" && newCount > 0 && <b className="nav-count new" title="New paid orders">{newCount} new</b>}{item === "Orders" && pendingCount > 0 && <b className="nav-count">{pendingCount}</b>}{item === "Products" && unsavedCount > 0 && <b className="nav-count unsaved" title="Unsaved product changes">{unsavedCount}</b>}</button>)}</nav><div className="sidebar-bottom"><div className="owner-avatar">{(owner?.name ?? "S").charAt(0).toUpperCase()}</div><div className="owner-copy"><b>{owner?.name ?? "Shop owner"}</b><small>{owner?.email ?? ""}</small></div><button className="signout" title="Sign out" aria-label="Sign out" onClick={() => void signOut()}><SignOutIcon /></button></div></aside>
    <main className="main-content"><div className="mobile-brand"><span className="brand-mark">k.</span><span>kalacar<VisitWebsiteLink link={shopLink} onSetUp={() => setSection("Settings")} /></span><button className="signout" onClick={() => void signOut()}><SignOutIcon /></button></div><div className="content-wrap">{soundNeedsClick && <p className="order-sound-note" role="status">Click anywhere on this page to turn on the new-order sound.</p>}<header className="admin-bar"><button className="command-trigger" onClick={() => { setCommandOpen(true); setCommandQuery(""); }}><SearchIcon size={15} /> Search dashboard <kbd>⌘K</kbd></button><div className="admin-bar-actions"><button className="visibility-pill" type="button" title="Change this in Settings" onClick={() => setSection("Settings")}><i /> Shop <strong>{storeMode === "coming_soon" ? "Coming soon" : storeMode === "live" ? "Live" : "…"}</strong></button><button className="profile-trigger" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen}><span className="owner-avatar">{(owner?.name ?? "S").charAt(0).toUpperCase()}</span><span>{owner?.name ?? "Shop owner"}</span><ChevronDown size={14} /></button>{profileOpen && <div className="profile-menu"><strong>{owner?.name ?? "Shop owner"}</strong><small>{owner?.email}</small><button onClick={() => void signOut()}>Sign out</button></div>}</div></header><nav className="mobile-section-nav" aria-label="Dashboard sections">{sections.map(item => <button key={item} className={section === item ? "selected" : ""} aria-current={section === item ? "page" : undefined} onClick={() => setSection(item)}><span className="mobile-nav-icon">{(() => { const Icon = sectionIcons[item]; return <Icon size={16} />; })()}</span>{item}{item === "Orders" && newCount > 0 && <b className="new" title="New paid orders">{newCount} new</b>}{item === "Orders" && pendingCount > 0 && <b>{pendingCount}</b>}{item === "Products" && unsavedCount > 0 && <b className="unsaved" title="Unsaved product changes">{unsavedCount}</b>}</button>)}</nav>{bannerVisible && <aside className="announcement"><span><b>Setup in progress</b><span> Dashboard tools are being added in stages.</span></span><button aria-label="Dismiss setup notice" onClick={() => { window.sessionStorage.setItem("kalacar-dashboard-banner-dismissed", "yes"); setBannerVisible(false); }}><CloseIcon size={14} /></button></aside>}{apiError && <div className="warning" role="status">{apiError}</div>}{content}{message && <div className="toast" role="status">{message}</div>}<footer>Kalacar owner dashboard</footer></div></main>
    <ModalDrawer open={commandOpen} title="Go to" onClose={() => setCommandOpen(false)}><FormField label="Search sections"><input autoFocus value={commandQuery} onChange={event => setCommandQuery(event.target.value)} placeholder="Type a section name…" /></FormField><div className="command-results">{filteredSections.map(item => <button key={item} onClick={() => { setSection(item); setCommandOpen(false); }}>{item}<EnterIcon size={14} /></button>)}{filteredSections.length === 0 && <p>No matching sections.</p>}</div></ModalDrawer>
  </div>;
}

function formatMoney(amount: number, showPaise = false) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: showPaise ? 2 : 0, minimumFractionDigits: 0 }).format(amount);
}
function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) { return <article className="metric-card"><span className="metric-icon">{icon}</span><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>; }
function OperationsInbox({ metrics, loading, error, onRetry, onOpen }: { metrics: AdminMetrics | null; loading: boolean; error: string; onRetry: () => void; onOpen: (section: Section) => void }) {
  const alerts = metrics ? [
    { title: "Paid orders awaiting fulfilment", detail: "Prepare and update these orders for customers.", count: metrics.fulfillmentNeeded, section: "Orders" as const },
    { title: "Inventory needs attention", detail: `${metrics.outOfStockProducts} out of stock · ${metrics.lowStockProducts} low at 1–${metrics.lowStockThreshold} units.`, count: metrics.outOfStockProducts + metrics.lowStockProducts, section: "Products" as const },
    { title: "Payment recovery", detail: "Failed or interrupted payments may need follow-up.", count: metrics.paymentRecovery, section: "Orders" as const },
  ].filter(alert => alert.count > 0) : [];
  return <section className="panel operations-inbox" aria-live="polite"><div className="panel-head"><div><p className="overline">ACTION NEEDED</p><h2>Operations inbox</h2></div></div>
    {loading && !metrics ? <p className="inbox-message">Loading current orders and inventory…</p> : error && !metrics ? <div className="inbox-error"><p>{error}</p><button className="secondary" onClick={onRetry}>Try again</button></div> : alerts.length ? <div className="inbox-alerts">{alerts.map(alert => <article className="inbox-alert" key={alert.title}><span className="inbox-alert-mark" aria-hidden="true"><AlertIcon size={15} /></span><div className="inbox-alert-copy"><b>{alert.title}</b><small>{alert.detail}</small></div><StatusChip tone="warning">{alert.count}</StatusChip><button className="text-button" onClick={() => onOpen(alert.section)}>{alert.section === "Orders" ? "Review orders" : "Manage stock"} <ArrowRight size={14} /></button></article>)}</div> : <p className="inbox-message inbox-clear"><CheckIcon size={15} /> All caught up. No order, stock, or payment recovery alerts.</p>}
  </section>;
}
type ProductDraft = { price?: string; stock?: string };
/** Unsaved quick edits keyed by colour id. */
type ProductDrafts = Record<string, ProductDraft>;
const LOW_STOCK = 3;

/** Validates a draft against the saved colour; returns per-field errors and the clean changes. */
function checkDraft(saved: { price: number; stock: number }, draft: ProductDraft) {
  const errors: { price?: string; stock?: string } = {};
  const changes: { price?: number; stock?: number } = {};
  if (draft.price !== undefined) {
    const value = Number(draft.price);
    if (draft.price.trim() === "" || !Number.isSafeInteger(value) || value < 1 || value > 1000000) errors.price = "Whole rupees, ₹1 or more";
    else if (value !== saved.price) changes.price = value;
  }
  if (draft.stock !== undefined) {
    const value = Number(draft.stock);
    if (draft.stock.trim() === "" || !Number.isSafeInteger(value) || value < 0 || value > 1000000) errors.stock = "Whole number, 0 or more";
    else if (value !== saved.stock) changes.stock = value;
  }
  return { errors, changes };
}

const Chevron = ({ up = false }: { up?: boolean }) => <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d={up ? "M2.5 7.5 6 4l3.5 3.5" : "M2.5 4.5 6 8l3.5-3.5"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const stockLevel = (stock: number) => stock === 0 ? { tone: "out", label: "Out of stock" } : stock <= LOW_STOCK ? { tone: "low", label: `Low · ${stock} left` } : { tone: "ok", label: "In stock" };
type StockFilter = "all" | "ok" | "low" | "out";
const stockFilters: { key: StockFilter; label: string }[] = [{ key: "all", label: "All" }, { key: "ok", label: "In stock" }, { key: "low", label: "Low stock" }, { key: "out", label: "Out of stock" }];
// Stock level of what customers can see. Hidden colours only count when every colour is hidden.
const productStockLevels = (product: Product) => { const shown = product.variants.filter(colour => colour.active); return (shown.length ? shown : product.variants).map(colour => stockLevel(colour.stock).tone); };

function Products({ products, drafts, setDrafts, onColourSaved, onProductCreated, apiError }: { products: Product[]; drafts: ProductDrafts; setDrafts: (update: (current: ProductDrafts) => ProductDrafts) => void; onColourSaved: (productId: string, colourId: string, values: { price: number; stock: number }) => void; onProductCreated: () => void; apiError: string }) {
  const [editorProduct, setEditorProduct] = useState<Product | null | undefined>(undefined);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [savingId, setSavingId] = useState("");
  const [rowMessage, setRowMessage] = useState<{ id: string; text: string; error?: boolean } | null>(null);
  // Stable alphabetical order: rows don't jump around after one is saved.
  const [categoryFilter, setCategoryFilter] = useState("");
  const categoryNames = [...new Set(products.flatMap(product => product.categories?.length ? product.categories : [product.deity]))].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  const shownCategory = categoryNames.includes(categoryFilter) ? categoryFilter : "";
  const [productSearch, setProductSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const searchText = productSearch.trim().toLowerCase();
  const inCategoryAndSearch = products.filter(product => (!shownCategory || (product.categories?.length ? product.categories : [product.deity]).includes(shownCategory)) && (!searchText || [product.name, product.deity, product.badge ?? "", ...product.variants.map(colour => colour.name)].some(text => text.toLowerCase().includes(searchText))));
  const stockCount = (key: StockFilter) => key === "all" ? inCategoryAndSearch.length : inCategoryAndSearch.filter(product => productStockLevels(product).includes(key)).length;
  // A row with unsaved changes or a fresh save message stays visible, whatever the filters say.
  const keepVisible = (product: Product) => product.variants.some(colour => drafts[colour.id] || rowMessage?.id === colour.id);
  const sorted = products.filter(product => keepVisible(product) || (inCategoryAndSearch.includes(product) && (stockFilter === "all" || productStockLevels(product).includes(stockFilter)))).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const filtersOn = Boolean(searchText || shownCategory || stockFilter !== "all");
  const clearFilters = () => { setProductSearch(""); setCategoryFilter(""); setStockFilter("all"); };
  const colourName = (id: string) => { for (const p of products) { const c = p.variants.find(v => v.id === id); if (c) return p.variants.length > 1 ? `${p.name} (${c.name})` : p.name; } return ""; };
  const unsaved = Object.keys(drafts).filter(id => colourName(id));

  function edit(colour: Colour, key: "price" | "stock", value: string) {
    setRowMessage(null);
    setDrafts(current => {
      const next = { ...current, [colour.id]: { ...current[colour.id], [key]: value } };
      // A field typed back to its saved value is no longer a change.
      if (next[colour.id][key] === String(colour[key])) delete next[colour.id][key];
      if (!Object.keys(next[colour.id]).length) delete next[colour.id];
      return next;
    });
  }
  function undo(id: string) { setDrafts(current => { const next = { ...current }; delete next[id]; return next; }); setRowMessage(null); }
  async function save(product: Product, colour: Colour) {
    const { errors, changes } = checkDraft(colour, drafts[colour.id] ?? {});
    if (Object.keys(errors).length) return;
    if (!Object.keys(changes).length) { undo(colour.id); return; }
    setSavingId(colour.id); setRowMessage(null);
    const label = product.variants.length > 1 ? `${product.name} (${colour.name})` : product.name;
    try {
      // Send what the owner was looking at; the server refuses if an order changed it meanwhile.
      const response = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}/variants/${encodeURIComponent(colour.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...changes, expectedPrice: colour.price, expectedStock: colour.stock }) });
      const data = await response.json().catch(() => ({})) as { error?: string; conflict?: boolean; current?: { price: number; stock: number } };
      if (response.status === 409 && data.conflict && data.current) {
        const current = data.current;
        onColourSaved(product.id, colour.id, current); // refresh saved values; the typed draft stays
        const parts = [current.stock !== colour.stock && `stock changed from ${colour.stock} to ${current.stock}`, current.price !== colour.price && `price changed from ₹${colour.price} to ₹${current.price}`].filter(Boolean).join(" and ");
        setRowMessage({ id: colour.id, text: `Not saved: ${parts || "this colour changed"} while you were editing${current.stock < colour.stock ? " (an order probably came in)" : ""}. Your new value is still in the box — check it and save again.`, error: true });
        return;
      }
      if (!response.ok) throw new Error(data.error || "Could not save this colour.");
      onColourSaved(product.id, colour.id, { price: changes.price ?? colour.price, stock: changes.stock ?? colour.stock });
      undo(colour.id);
      setRowMessage({ id: colour.id, text: `Saved ${label}.` });
    } catch (cause) { setRowMessage({ id: colour.id, text: cause instanceof Error ? cause.message : "Could not save this colour.", error: true }); }
    finally { setSavingId(""); }
  }

  /** Price + stock fields, change summary and Save/Undo for one colour. */
  const colourCells = (product: Product, colour: Colour) => {
    const draft = drafts[colour.id];
    const { errors, changes } = checkDraft(colour, draft ?? {});
    const label = product.variants.length > 1 ? `${product.name} ${colour.name}` : product.name;
    const field = (key: "price" | "stock", title: string) => {
      const changed = draft?.[key] !== undefined;
      const value = draft?.[key] ?? String(colour[key]);
      const step = (delta: number) => { const current = Number(value); edit(colour, "stock", String(Number.isFinite(current) ? Math.min(1000000, Math.max(0, Math.trunc(current) + delta)) : colour.stock)); };
      return <label className={`stock-field-cell${changed ? " changed" : ""}${errors[key] ? " invalid" : ""}`}>
        <span className="stock-field-label">{title}</span>
        <span className={`stock-input${key === "stock" ? " has-stepper" : ""}`}>{key === "price" && <span aria-hidden="true">₹</span>}<input type="number" inputMode="numeric" min={key === "price" ? 1 : 0} step={1} aria-label={`${label} ${title.toLowerCase()}`} aria-invalid={Boolean(errors[key])} value={value} onChange={event => edit(colour, key, event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void save(product, colour); } if (event.key === "Escape") undo(colour.id); }} />
          {key === "stock" && <span className="stepper"><button type="button" aria-label={`Increase ${label} stock`} onClick={() => step(1)}><Chevron up /></button><button type="button" aria-label={`Decrease ${label} stock`} disabled={Number(value) <= 0} onClick={() => step(-1)}><Chevron /></button></span>}</span>
        {errors[key] ? <small className="stock-error">{errors[key]}</small> : changed ? <small className="stock-was">was {key === "price" ? "₹" : ""}{colour[key]}</small> : null}
      </label>;
    };
    const message = rowMessage?.id === colour.id ? rowMessage : null;
    return { dirty: Boolean(draft), fields: <>{field("price", "Price")}{field("stock", "Available")}</>, after: <>
      {draft && <div className="stock-row-save">
        <span className="stock-change-summary">Unsaved: {[changes.price !== undefined && `price ₹${colour.price} → ₹${changes.price}`, changes.stock !== undefined && `stock ${colour.stock} → ${changes.stock}`].filter(Boolean).join(", ") || "check the highlighted field"}</span>
        <div><button className="text-button" type="button" disabled={savingId === colour.id} onClick={() => undo(colour.id)}>Undo</button><button className="primary" type="button" disabled={savingId === colour.id || Object.keys(errors).length > 0} onClick={() => void save(product, colour)}>{savingId === colour.id ? "Saving…" : product.variants.length > 1 ? "Save colour" : "Save product"}</button></div>
      </div>}
      {message && <p className={`stock-row-message${message.error ? " error" : ""}`} role={message.error ? "alert" : "status"}>{message.text}</p>}
    </> };
  };

  return <>
    <div className="page-heading"><div><p className="overline">YOUR CATALOGUE</p><h1>Products</h1><p className="muted">Change a price or stock, then save that product or colour on its own row.</p></div><div className="heading-actions"><button className="secondary" onClick={() => setEditorProduct(null)}>+ Add product</button></div></div>
    {unsaved.length > 0 && <p className="unsaved-banner" role="status"><b>{unsaved.length === 1 ? "1 item has" : `${unsaved.length} items have`} unsaved changes</b> — highlighted below. Save or undo each one; nothing is saved until you do.</p>}
    {editorProduct !== undefined && <ProductEditor key={editorProduct?.id ?? "new"} allProducts={products} product={editorProduct} onCancel={() => setEditorProduct(undefined)} onSaved={async () => { await onProductCreated(); setEditorProduct(undefined); }} />}
    {!apiError && products.length > 0 && <section className="panel product-tools" aria-label="Find products">
      <div className="product-tools-row"><label className="customer-search"><SearchIcon size={15} /><input type="search" value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Search name, category or colour" aria-label="Search products" /></label>{categoryNames.length > 1 && <label className="category-filter">Category<select value={shownCategory} onChange={event => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categoryNames.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}</div>
      <div className="product-stock-filters" role="group" aria-label="Filter products by stock">{stockFilters.map(item => <button type="button" key={item.key} className={stockFilter === item.key ? "order-filter selected" : "order-filter"} aria-pressed={stockFilter === item.key} onClick={() => setStockFilter(item.key)}>{item.label}<span>{stockCount(item.key)}</span></button>)}</div>
    </section>}
    <section className="panel">{apiError ? <p className="empty-orders" role="alert">{apiError}</p> : products.length ? <div className="stock-list">
      <div className="stock-list-head" aria-hidden="true"><span className="head-product">Product</span><span className="head-price">Price</span><span className="head-stock">Available</span></div>
      {!sorted.length && <div className="product-no-match"><p>No products match these filters.</p>{filtersOn && <button className="secondary" type="button" onClick={clearFilters}>Clear filters</button>}</div>}
      {sorted.map(product => {
        const productDirty = product.variants.some(colour => drafts[colour.id]);
        const buttons = <div className="stock-row-buttons">
          <button className="secondary" type="button" onClick={() => setPreviewProduct(product)}>Preview</button>
          <button className="secondary" type="button" disabled={productDirty} title={productDirty ? "Save or undo the price/stock changes first" : undefined} onClick={() => setEditorProduct(product)}>Edit details</button>
        </div>;
        const title = <div className="stock-name"><b>{product.name}{product.badge && <span className="product-badge">{product.badge}</span>}</b><small>{product.deity}{product.variants.length > 1 ? ` · ${product.variants.length} colours · ${product.variants.filter(v => v.active).reduce((sum, v) => sum + v.stock, 0)} in stock` : ""}{product.variants.length === 1 && <span className="stock-row-levels"><span className={`level-chip ${stockLevel(product.variants[0].stock).tone}`}>{stockLevel(product.variants[0].stock).label}</span>{!product.variants[0].active && <span className="level-chip hidden">Hidden in shop</span>}</span>}</small></div>;
        if (product.variants.length <= 1) {
          const colour = product.variants[0];
          if (!colour) return null;
          const cells = colourCells(product, colour);
          return <article key={product.id} className={`stock-row${cells.dirty ? " dirty" : ""}`} aria-label={`${product.name}${cells.dirty ? ", unsaved changes" : ""}`}>
            <img src={product.image} alt="" />{title}{cells.fields}{buttons}{cells.after}
          </article>;
        }
        return <div key={product.id} className="stock-group">
          <article className="stock-row stock-row-parent" aria-label={product.name}><img src={product.image} alt="" />{title}<span className="stock-group-note">Set per colour below</span>{buttons}</article>
          {product.variants.map(colour => {
            const cells = colourCells(product, colour);
            const level = stockLevel(colour.stock);
            return <article key={colour.id} className={`stock-row stock-row-colour${cells.dirty ? " dirty" : ""}${colour.active ? "" : " hidden-colour"}`} aria-label={`${product.name} ${colour.name}${cells.dirty ? ", unsaved changes" : ""}`}>
              <span className="colour-swatch" style={{ background: colour.swatch }} aria-hidden="true" />
              <div className="stock-name"><b>{colour.name}</b><small><span className={`level-chip ${level.tone}`}>{level.label}</span>{!colour.active && <span className="level-chip hidden">Hidden in shop</span>}</small></div>
              {cells.fields}<span />{cells.after}
            </article>;
          })}
        </div>;
      })}
    </div> : <p className="empty-orders">No products have been added yet.</p>}</section>
    <ModalDrawer open={Boolean(previewProduct)} title="Product preview" onClose={() => setPreviewProduct(null)} wide>{previewProduct && <ProductPreview key={previewProduct.id} product={previewProduct} />}</ModalDrawer>
  </>;
}

type ColourDraft = { key: string; id?: string; name: string; swatch: string; price: string; originalPrice: string; stock: string; active: boolean; images: ProductImageDraft[]; base?: { price: number; stock: number } };
const newColour = (name = "", price = "", originalPrice = ""): ColourDraft => ({ key: crypto.randomUUID(), name, swatch: "#b08d57", price, originalPrice, stock: "0", active: true, images: [] });
const MAX_COLOURS = 8;

/** Name, swatch, photos, price, regular price, stock and visibility for one colour. */
function ColourEditor({ colour, index, count, onChange, onMove, onRemove, registerPreview }: { colour: ColourDraft; index: number; count: number; onChange: (next: ColourDraft) => void; onMove: (delta: number) => void; onRemove: () => void; registerPreview: (file: File) => string }) {
  const set = (patch: Partial<ColourDraft>) => onChange({ ...colour, ...patch });
  const addImages = (files: FileList | null) => {
    if (!files?.length) return;
    const room = 5 - colour.images.length;
    set({ images: [...colour.images, ...Array.from(files).slice(0, room).map(file => ({ key: crypto.randomUUID(), file, preview: registerPreview(file) }))] });
  };
  const moveImage = (from: number, to: number) => { const next = [...colour.images]; [next[from], next[to]] = [next[to], next[from]]; set({ images: next }); };
  const discount = Number(colour.originalPrice) > Number(colour.price) && Number(colour.price) > 0 ? Math.round((1 - Number(colour.price) / Number(colour.originalPrice)) * 100) : 0;
  return <fieldset className={`colour-editor${colour.active ? "" : " is-hidden"}`}>
    <legend><span className="colour-swatch" style={{ background: colour.swatch }} aria-hidden="true" />{colour.name || `Colour ${index + 1}`}{index === 0 && <span className="level-chip ok">Shown first</span>}{!colour.active && <span className="level-chip hidden">Hidden in shop</span>}</legend>
    <div className="colour-editor-grid">
      <label>Colour name<input required maxLength={60} placeholder="e.g. Blue, White, Skin" value={colour.name} onChange={e => set({ name: e.target.value })} /></label>
      <label>Swatch<span className="swatch-input"><input type="color" value={colour.swatch} onChange={e => set({ swatch: e.target.value })} aria-label={`${colour.name || "Colour"} swatch`} /><code>{colour.swatch}</code></span></label>
      <label>Selling price (₹)<input required type="number" min="1" max="1000000" step="1" value={colour.price} onChange={e => set({ price: e.target.value, ...(colour.originalPrice === colour.price ? { originalPrice: e.target.value } : {}) })} /></label>
      <label>Regular price (₹)<input required type="number" min="1" max="1000000" step="1" value={colour.originalPrice} onChange={e => set({ originalPrice: e.target.value })} /><small className="field-hint">{discount ? `Shows as Save ${discount}%` : "Same as selling price = no discount shown"}</small></label>
      <label>Stock<input required type="number" min="0" max="1000000" step="1" value={colour.stock} onChange={e => set({ stock: e.target.value })} /></label>
      <label className="check-label"><input type="checkbox" checked={colour.active} onChange={e => set({ active: e.target.checked })} /> Show in shop</label>
    </div>
    <div className="colour-photos" aria-label={`${colour.name || "Colour"} photos`}>
      {colour.images.map((image, i) => <div className="colour-photo" key={image.key}>
        <img src={image.preview} alt={`${colour.name} photo ${i + 1}`} />
        <span className="colour-photo-label">{i === 0 ? "Main" : `Photo ${i + 1}`}</span>
        <div className="colour-photo-actions">
          <button type="button" className="icon-button" aria-label={`Move ${colour.name} photo ${i + 1} earlier`} disabled={i === 0} onClick={() => moveImage(i, i - 1)}><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          <button type="button" className="icon-button" aria-label={`Move ${colour.name} photo ${i + 1} later`} disabled={i === colour.images.length - 1} onClick={() => moveImage(i, i + 1)}><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M4.5 2.5 8 6 4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          <button type="button" className="icon-button danger" aria-label={`Remove ${colour.name} photo ${i + 1}`} onClick={() => set({ images: colour.images.filter(item => item.key !== image.key) })}><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
        </div>
      </div>)}
      {colour.images.length < 5 && <label className="colour-photo-add"><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg><span>Add photos</span><small>{colour.images.length}/5 · JPG, PNG, WebP, AVIF · 5 MB each</small><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={e => { addImages(e.target.files); e.currentTarget.value = ""; }} /></label>}
    </div>
    <div className="colour-editor-actions">
      <button className="secondary" type="button" disabled={index === 0} onClick={() => onMove(-1)}>Move up</button>
      <button className="secondary" type="button" disabled={index === count - 1} onClick={() => onMove(1)}>Move down</button>
      <button className="secondary danger" type="button" disabled={count === 1} title={count === 1 ? "A product needs at least one colour" : undefined} onClick={onRemove}>Remove colour</button>
    </div>
  </fieldset>;
}

function ProductEditor({ allProducts, product, onCancel, onSaved }: { allProducts: Product[]; product: Product | null; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(product?.name ?? "");
  const [deity, setDeity] = useState(product?.deity ?? "");
  const [extraCategories, setExtraCategories] = useState<string[]>(() => (product?.categories ?? []).filter(name => name !== product?.deity));
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoriesError, setCategoriesError] = useState("");
  useEffect(() => {
    let active = true;
    loadCategories().then(list => { if (active) setCategories(list); }).catch(cause => { if (active) setCategoriesError(cause instanceof Error ? cause.message : "Categories are unavailable right now."); });
    return () => { active = false; };
  }, []);
  const [badge, setBadge] = useState(product?.badge ?? "");
  const [tagline, setTagline] = useState(product?.tagline ?? "");
  const [placement, setPlacement] = useState(product?.placement ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [bundleIds, setBundleIds] = useState<string[]>(product?.bundleIds ?? []);
  const [specs, setSpecs] = useState<{ key: string; label: string; value: string }[]>(() => (product?.specs ?? []).map(spec => ({ key: crypto.randomUUID(), ...spec })));
  const [highlights, setHighlights] = useState<{ key: string; text: string }[]>(() => (product?.highlights ?? []).map(text => ({ key: crypto.randomUUID(), text })));
  const [colours, setColours] = useState<ColourDraft[]>(() => product?.variants.length
    ? product.variants.map(v => ({ key: v.id, id: v.id, name: v.name, swatch: v.swatch, price: String(v.price), originalPrice: String(v.originalPrice), stock: String(v.stock), active: v.active, base: { price: v.price, stock: v.stock }, images: v.gallery.map((src, i) => ({ key: `${v.id}-${i}-${src}`, src, preview: src })) }))
    : [newColour("Standard")]);
  const previewUrls = useRef(new Set<string>());
  const [accordions, setAccordions] = useState<ProductAccordionDraft[]>(() => (product?.accordions ?? []).map(toAccordionDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => () => { previewUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  async function deleteProduct() {
    if (!product) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not delete the product.");
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the product."); setConfirmDelete(false); }
    finally { setSaving(false); }
  }
  const registerPreview = (file: File) => { const url = URL.createObjectURL(file); previewUrls.current.add(url); return url; };
  const setColour = (key: string, next: ColourDraft) => setColours(current => current.map(c => c.key === key ? next : c));
  const moveColour = (index: number, delta: number) => setColours(current => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });

  function addSection(title = "") {
    setAccordions(current => [...current, { id: crypto.randomUUID(), title, content: "", mode: "rows", rows: [{ id: crypto.randomUUID(), label: "", value: "" }], active: true, defaultOpen: false }]);
  }
  function addCommonSections() {
    setAccordions(current => [...current, ...["Dimensions & weight", "Material & finish", "Care instructions", "Packaging & delivery"].slice(0, 12 - current.length).map(title => ({ id: crypto.randomUUID(), title, content: "", mode: "rows" as const, rows: [{ id: crypto.randomUUID(), label: "", value: "" }], active: true, defaultOpen: false }))]);
  }
  function setSection(id: string, patch: Partial<ProductAccordionDraft>) {
    setAccordions(current => current.map(section => section.id === id ? { ...section, ...patch, ...(patch.active === false ? { defaultOpen: false } : {}) } : section));
  }
  function setSectionMode(section: ProductAccordionDraft, mode: "rows" | "text") {
    if (mode === "rows") {
      const parsed = parseAccordionRows(section.content);
      const rows = parsed ?? (section.content.trim() ? [{ id: crypto.randomUUID(), label: "Details", value: section.content.trim() }] : section.rows.length ? section.rows : [{ id: crypto.randomUUID(), label: "", value: "" }]);
      setSection(section.id, { mode, format: mode, rows });
    } else {
      const content = section.rows.filter(row => row.label.trim() && row.value.trim()).map(row => `${row.label.trim()} — ${row.value.trim()}`).join("\n");
      setSection(section.id, { mode, format: mode, content });
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const missing = colours.find(c => c.images.length < 1);
      if (missing) throw new Error(`Add at least one photo for “${missing.name || "a colour"}”.`);
      if (!colours.some(c => c.active)) throw new Error("Keep at least one colour visible in the shop.");
      const form = new FormData();
      form.set("name", name); form.set("deity", deity); form.set("extraCategories", JSON.stringify(extraCategories.filter(name => name !== deity))); form.set("badge", badge); form.set("tagline", tagline); form.set("placement", placement); form.set("description", description); form.set("bundleIds", JSON.stringify(bundleIds));
      form.set("specs", JSON.stringify(specs.filter(spec => spec.label.trim() || spec.value.trim()).map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))));
      form.set("highlights", JSON.stringify(highlights.map(h => h.text.trim()).filter(Boolean)));
      const savedAccordions: ProductAccordion[] = accordions.map(({ mode, rows, ...section }) => ({ ...section, format: mode, content: mode === "rows" ? rows.filter(row => row.label.trim() && row.value.trim()).map(row => `${row.label.trim()}: ${row.value.trim()}`).join("\n") : section.content }));
      form.set("accordions", JSON.stringify(savedAccordions));
      const shrunk = new Map<File, File>();
      for (const image of colours.flatMap(c => c.images)) if (image.file && !shrunk.has(image.file)) shrunk.set(image.file, await shrinkImage(image.file));
      let uploadIndex = 0;
      const payload = colours.map(c => ({
        id: c.id, name: c.name.trim(), swatch: c.swatch, price: Number(c.price), originalPrice: Number(c.originalPrice || c.price), stock: Number(c.stock), active: c.active,
        expectedPrice: c.base?.price, expectedStock: c.base?.stock,
        gallery: c.images.map(image => { if (image.file) { form.append("images", shrunk.get(image.file) ?? image.file); return { kind: "upload", uploadIndex: uploadIndex++ }; } return { kind: "existing", src: image.src }; }),
      }));
      form.set("colours", JSON.stringify(payload));
      const url = product ? `/api/admin/products/${encodeURIComponent(product.id)}` : "/api/admin/products";
      const response = await fetch(url, { method: product ? "PATCH" : "POST", body: form });
      const result = await response.json() as { error?: string; conflict?: boolean; colour?: string; current?: { price: number; stock: number } };
      if (response.status === 409 && result.conflict && result.current && result.colour) {
        const current = result.current;
        let detail = "";
        setColours(list => list.map(c => {
          if (c.name.trim() !== result.colour || !c.base) return c;
          const before = c.base;
          detail = [current.stock !== before.stock && `stock changed from ${before.stock} to ${current.stock}`, current.price !== before.price && `price changed from ₹${before.price} to ₹${current.price}`].filter(Boolean).join(" and ");
          // Fields the owner didn't touch simply take the latest stored value.
          return { ...c, base: current, stock: c.stock === String(before.stock) ? String(current.stock) : c.stock, price: c.price === String(before.price) ? String(current.price) : c.price };
        }));
        throw new Error(`Not saved: “${result.colour}” ${detail || "changed"} while this form was open (an order may have come in). The form now shows the latest values where you hadn't changed them — check and save again.`);
      }
      if (!response.ok) throw new Error(result.error || "Product could not be saved.");
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Product could not be saved."); }
    finally { setSaving(false); }
  }

  return <form className="panel add-product-form" onSubmit={submit}>
    <div className="panel-head"><div><p className="overline">{product ? "EDIT CATALOGUE ITEM" : "NEW CATALOGUE ITEM"}</p><h2>{product ? `Edit ${product.name}` : "Add a product"}</h2></div><button className="secondary" type="button" onClick={onCancel}>Close</button></div>
    <div className="form-grid">
      <label>Product name<input required minLength={2} maxLength={160} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Category<select required value={deity} disabled={!categories?.length} onChange={e => setDeity(e.target.value)}><option value="" disabled>{categories ? categories.length ? "Choose a category" : "No categories yet" : "Loading categories…"}</option>{categories?.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}</select>{categoriesError ? <small className="fulfillment-error" role="alert">{categoriesError}</small> : <small className="field-hint">Add or rename categories in Settings.</small>}</label>
      {categories && categories.length > 1 && deity && <fieldset className="extra-categories"><legend>Also show under</legend><small className="field-hint">Optional. The murti appears in each ticked category as well as its main one.</small>
        <div>{categories.filter(category => category.name !== deity).map(category => <label key={category.id} className="editor-check"><input type="checkbox" checked={extraCategories.includes(category.name)} onChange={event => setExtraCategories(current => event.target.checked ? [...current, category.name] : current.filter(name => name !== category.name))} /><span>{category.name}</span></label>)}</div>
      </fieldset>}
      <label>Badge (optional)<input maxLength={40} placeholder="e.g. Flagship, New, Festive" value={badge} onChange={e => setBadge(e.target.value)} /><small className="field-hint">Small label on the product photo and card.</small></label>
      <label>Tagline (optional)<input maxLength={120} placeholder="A short line under the name" value={tagline} onChange={e => setTagline(e.target.value)} /></label>
      <label className="form-grid-wide">Short description / placement (optional)<textarea maxLength={255} value={placement} onChange={e => setPlacement(e.target.value)} /></label>
      <label className="form-grid-wide">Product description (optional)<textarea rows={4} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} /><small className="field-hint">Shown above the colours on this product's page. Use Product details below for longer sections such as care instructions.</small></label>
      <fieldset className="form-grid-wide product-picker"><legend>Frequently bought together (up to 2)</legend>{allProducts.filter(other => other.id !== product?.id).map(other => <label className="editor-check" key={other.id}><input type="checkbox" checked={bundleIds.includes(other.id)} disabled={!bundleIds.includes(other.id) && bundleIds.length >= 2} onChange={e => setBundleIds(current => e.target.checked ? [...current, other.id] : current.filter(id => id !== other.id))} /><span>{other.name}</span></label>)}{allProducts.length < 2 && <p className="muted">Add more products first.</p>}</fieldset>
    </div>
    <div className="colours-editor">
      <div className="accordion-editor-heading"><div><p className="overline">COLOURS</p><h3>Colours, photos, price and stock</h3><p>Each colour has its own photos, price and stock. The first visible colour is shown first in the shop; hidden colours keep their stock but can't be bought.</p></div>
        <button className="secondary" type="button" disabled={colours.length >= MAX_COLOURS} onClick={() => setColours(current => [...current, newColour("", current[0]?.price ?? "", current[0]?.originalPrice ?? "")])}>+ Add colour</button></div>
      {colours.map((colour, index) => <ColourEditor key={colour.key} colour={colour} index={index} count={colours.length} registerPreview={registerPreview} onChange={next => setColour(colour.key, next)} onMove={delta => moveColour(index, delta)} onRemove={() => setColours(current => current.filter(c => c.key !== colour.key))} />)}
    </div>
    <div className="facts-editor">
      <div className="accordion-editor-heading"><div><p className="overline">SPECIFICATIONS</p><h3>Specification cards</h3><p>Short facts shown as cards on the product page (up to 8). Height, Material, Finish, Weight and Size get matching icons. Use only facts you've confirmed for this murti.</p></div>
        <button className="secondary" type="button" disabled={specs.length >= 8} onClick={() => setSpecs(current => [...current, ...["Height", "Material", "Finish", "Weight"].filter(label => !current.some(s => s.label.trim().toLowerCase() === label.toLowerCase())).slice(0, 8 - current.length).map(label => ({ key: crypto.randomUUID(), label, value: "" }))])}>Add common</button></div>
      {specs.map((spec, index) => <div className="fact-row" key={spec.key}>
        <label>Label<input maxLength={30} list="spec-labels" placeholder="e.g. Height" value={spec.label} onChange={e => setSpecs(current => current.map(s => s.key === spec.key ? { ...s, label: e.target.value } : s))} /></label>
        <label>Value<input maxLength={80} placeholder="e.g. 5 in (12.7 cm)" value={spec.value} onChange={e => setSpecs(current => current.map(s => s.key === spec.key ? { ...s, value: e.target.value } : s))} /></label>
        <div className="fact-actions">
          <button type="button" className="icon-button" aria-label={`Move ${spec.label || "specification"} up`} disabled={index === 0} onClick={() => setSpecs(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          <button type="button" className="icon-button" aria-label={`Move ${spec.label || "specification"} down`} disabled={index === specs.length - 1} onClick={() => setSpecs(current => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          <button type="button" className="icon-button danger" aria-label={`Remove ${spec.label || "specification"}`} onClick={() => setSpecs(current => current.filter(s => s.key !== spec.key))}><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
        </div>
      </div>)}
      <datalist id="spec-labels">{["Height", "Width", "Material", "Finish", "Weight", "Size", "Base", "Colour", "Care"].map(label => <option key={label} value={label} />)}</datalist>
      <button className="secondary" type="button" disabled={specs.length >= 8} onClick={() => setSpecs(current => [...current, { key: crypto.randomUUID(), label: "", value: "" }])}>+ Add specification</button>
    </div>
    <div className="facts-editor">
      <div className="accordion-editor-heading"><div><p className="overline">HIGHLIGHTS</p><h3>Highlights</h3><p>Up to 6 short lines shown with a tick on the product page, e.g. "Hand-finished detail".</p></div></div>
      {highlights.map(highlight => <div className="fact-row highlight-row" key={highlight.key}>
        <label>Highlight<input maxLength={80} placeholder="e.g. Inspected piece by piece" value={highlight.text} onChange={e => setHighlights(current => current.map(h => h.key === highlight.key ? { ...h, text: e.target.value } : h))} /></label>
        <div className="fact-actions"><button type="button" className="icon-button danger" aria-label={`Remove highlight ${highlight.text}`} onClick={() => setHighlights(current => current.filter(h => h.key !== highlight.key))}><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button></div>
      </div>)}
      <button className="secondary" type="button" disabled={highlights.length >= 6} onClick={() => setHighlights(current => [...current, { key: crypto.randomUUID(), text: "" }])}>+ Add highlight</button>
    </div>
    <div className="accordion-editor"><div className="accordion-editor-heading"><div><p className="overline">PRODUCT DETAILS</p><h3>Detail accordions</h3><p>Add multiple titled sections; each can contain multiple key/value pairs. Only use facts confirmed for this product. Inactive sections stay hidden on the storefront.</p></div><button className="secondary" type="button" disabled={accordions.length > 8} onClick={addCommonSections}>Add common sections</button></div>
      {accordions.map((section, index) => <div className="accordion-editor-row" key={section.id}><div className="accordion-editor-controls"><label>Accordion title<input required={section.active} maxLength={80} value={section.title} onChange={e => setSection(section.id, { title: e.target.value })} /></label><label>Content format<select value={section.mode} onChange={e => setSectionMode(section, e.target.value as "rows" | "text")}><option value="rows">Key/value details</option><option value="text">Paragraph text</option></select></label>{section.mode === "rows" ? <div className="accordion-content-rows"><div className="accordion-content-rows-heading"><strong>Information rows</strong><span>Shown as a two-column table</span></div>{section.rows.map((row, rowIndex) => <div className="accordion-content-row" key={row.id}><label>Label<input required={section.active} maxLength={80} placeholder="e.g. Brand name" value={row.label} onChange={e => setSection(section.id, { rows: section.rows.map(item => item.id === row.id ? { ...item, label: e.target.value } : item) })} /></label><label>Value<input required={section.active} maxLength={500} placeholder="Enter owner-confirmed value" value={row.value} onChange={e => setSection(section.id, { rows: section.rows.map(item => item.id === row.id ? { ...item, value: e.target.value } : item) })} /></label><button className="secondary" type="button" aria-label={`Remove information row ${rowIndex + 1}`} disabled={section.rows.length === 1} onClick={() => setSection(section.id, { rows: section.rows.filter(item => item.id !== row.id) })}>Remove row</button></div>)}<button className="secondary" type="button" disabled={section.rows.length >= 20} onClick={() => setSection(section.id, { rows: [...section.rows, { id: crypto.randomUUID(), label: "", value: "" }] })}>+ Add information row</button></div> : <label>Paragraph content<textarea required={section.active} maxLength={3000} value={section.content} onChange={e => setSection(section.id, { content: e.target.value })} /></label>}<label className="check-label"><input type="checkbox" checked={section.active} onChange={e => setSection(section.id, { active: e.target.checked })} /> Show on storefront</label><label className="check-label"><input type="checkbox" checked={section.defaultOpen} onChange={e => setSection(section.id, { defaultOpen: e.target.checked })} /> Open by default</label></div><div className="accordion-row-actions"><button className="secondary" type="button" aria-label="Move section up" disabled={index === 0} onClick={() => setAccordions(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>Move up</button><button className="secondary" type="button" aria-label="Move section down" disabled={index === accordions.length - 1} onClick={() => setAccordions(current => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}>Move down</button><button className="secondary" type="button" onClick={() => setAccordions(current => current.filter(item => item.id !== section.id))}>Delete section</button></div></div>)}
      <button className="secondary" type="button" disabled={accordions.length >= 12} onClick={() => addSection()}>+ Add detail accordion</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {product && <div className="danger-zone">{confirmDelete
      ? <><p><b>Delete {product.name}?</b> Its colours, prices and stock are removed from the shop. Past orders keep their records. This can't be undone.</p><div><button className="primary danger" type="button" disabled={saving} onClick={() => void deleteProduct()}>{saving ? "Deleting…" : "Yes, delete product"}</button><button className="text-button" type="button" disabled={saving} onClick={() => setConfirmDelete(false)}>Keep it</button></div></>
      : <><p>Not selling this murti anymore? Hide its colours, or delete the product.</p><button className="secondary danger" type="button" onClick={() => setConfirmDelete(true)}>Delete product</button></>}</div>}
    <div className="form-actions"><span>Use owner-confirmed details and prices. A discount only shows when the regular price is higher.</span><button className="primary" disabled={saving}>{saving ? "Saving…" : product ? "Save product" : "Add product"}</button></div>
  </form>;
}

function ProductRows({ products, editable = false, onChange, onEdit, onPreview }: { products: Product[]; editable?: boolean; onChange?: (id: string, key: "price" | "stock", value: string) => void; onEdit?: (product: Product) => void; onPreview?: (product: Product) => void }) { return <div className="product-list">{products.map(p => <div className={editable ? "product-row product-row-editable" : "product-row"} key={p.id}><img src={p.image} alt="" /><div className="product-name"><b>{p.name}</b><small>{p.deity}</small></div><div className="product-field"><label>Price</label>{editable ? <span className="input-prefix">₹<input aria-label={`${p.name} price`} type="number" min="0" value={p.price} onChange={e => onChange?.(p.id, "price", e.target.value)} /></span> : <b>₹{p.price}</b>}</div><div className="product-field stock-field"><label>Available</label>{editable ? <input aria-label={`${p.name} stock`} type="number" min="0" value={p.stock} onChange={e => onChange?.(p.id, "stock", e.target.value)} /> : <span className={p.stock ? "stock-status" : "stock-status empty"}><i />{p.stock ? `${p.stock} units` : "Out of stock"}</span>}</div>{editable && onPreview && <button className="secondary preview-product-button" type="button" onClick={() => onPreview(p)}>Preview</button>}{editable && onEdit && <button className="secondary edit-product-button" type="button" onClick={() => onEdit(p)}>Edit details</button>}</div>)}</div>; }

function ProductPreview({ product }: { product: Product }) {
  const gallery = product.gallery?.length ? product.gallery : [product.image];
  const [activeImage, setActiveImage] = useState(gallery[0]);
  const details = (product.accordions ?? []).filter(section => section.active && section.title.trim() && section.content.trim());
  return <div className="product-preview">
    <div className="product-preview-toolbar"><div><p className="overline">SAVED CATALOGUE VERSION</p><span>Read-only preview · Customer-facing product information</span></div><StatusChip tone={product.stock > 0 ? "success" : "neutral"}>{product.stock > 0 ? "In stock" : "Out of stock"}</StatusChip></div>
    <div className="product-preview-layout">
      <section className="product-preview-gallery" aria-label="Product image preview"><div className="product-preview-main-image"><img src={activeImage} alt={`${product.name} product view`} /></div>{gallery.length > 1 && <div className="product-preview-thumbnails" aria-label="Choose product image">{gallery.map((image, index) => <button className={activeImage === image ? "selected" : ""} type="button" key={`${image}-${index}`} aria-label={`View image ${index + 1}`} aria-pressed={activeImage === image} onClick={() => setActiveImage(image)}><img src={image} alt="" /></button>)}</div>}</section>
      <section className="product-preview-info"><div className="product-preview-heading"><div><span className="product-preview-deity">{product.deity}</span><h3>{product.name}</h3></div><StatusChip tone="neutral">Saved</StatusChip></div>{product.placement && <p className="product-preview-description">{product.placement}</p>}<div className="product-preview-price">₹{product.price}<span>Current catalogue price</span></div><div className="product-preview-facts"><div><span>Availability</span><b>{product.stock > 0 ? `${product.stock} units` : "Out of stock"}</b></div><div><span>Gallery</span><b>{gallery.length} image{gallery.length === 1 ? "" : "s"}</b></div></div>
        <div className="product-preview-details"><div className="product-preview-details-heading"><h4>Product details</h4><span>{details.length} active section{details.length === 1 ? "" : "s"}</span></div>{details.length ? details.map(section => <details key={section.id} open={section.defaultOpen}><summary>{section.title}<span aria-hidden="true">{section.defaultOpen ? "−" : "+"}</span></summary><ProductPreviewAccordionContent content={section.content} format={section.format} /></details>) : <p className="product-preview-empty">No additional product details have been saved.</p>}</div>
      </section>
    </div>
    <p className="product-preview-footnote">This preview shows saved dashboard data. Unsaved edits are not included.</p>
  </div>;
}

function ProductPreviewAccordionContent({ content, format }: { content: string; format?: "rows" | "text" }) {
  const rows = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const separator = line.indexOf(": ");
    if (separator < 1 || separator > 80) return null;
    const label = line.slice(0, separator).trim();
    const value = line.slice(separator + 2).trim();
    return label && value ? { label, value } : null;
  });
  const isTable = format !== "text" && rows.length > 0 && rows.every((row): row is { label: string; value: string } => row !== null);
  return isTable ? <dl className="product-preview-specs">{rows.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl> : <p>{content}</p>;
}
const statusTone = (status: string): "success" | "warning" | "danger" | "neutral" =>
  status === "Paid" ? "success" : ["Refunded", "Cancelled"].includes(status) ? "neutral" : ["Paid after cancel", "Payment failed", "Payment setup failed"].includes(status) ? "danger" : "warning";
function Orders({ orders, loading, error, filter, counts, onFilter, paymentMode, onUpdate, routeOrderId, onOpenOrder, onCloseOrder }: { orders: Order[]; loading: boolean; error: string; filter: OrderFilter; counts: OrderStatusCounts | null; onFilter: (filter: OrderFilter) => void; paymentMode: AdminMetrics["paymentMode"]; onUpdate: (id: string, status: string, expected: string) => Promise<string>; routeOrderId: string; onOpenOrder: (id: string) => void; onCloseOrder: () => void }) {
  const [detailOrderId, setDetailOrderId] = useState("");
  const { config: messageConfig, error: messageError } = useMessageConfig();
  const { config: labelConfig, error: labelError } = useLabelConfig();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [addressCopied, setAddressCopied] = useState(false);
  async function openDetails(id: string) {
    setDetailOrderId(id); setDetail(null); setDetailError(""); setAddressCopied(false); setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json() as { order?: OrderDetail; error?: string };
      if (!response.ok || !data.order) throw new Error(data.error || "Order details are temporarily unavailable.");
      setDetail(data.order);
    } catch (cause) { setDetailError(cause instanceof Error ? cause.message : "Order details are temporarily unavailable."); }
    finally { setDetailLoading(false); }
  }
  // The address decides which order is open, so Back closes it and refresh keeps it open.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (routeOrderId) void openDetails(routeOrderId);
      else { setDetailOrderId(""); setDetail(null); setDetailError(""); }
    });
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOrderId]);
  /** Re-reads the open order without clearing the drawer, so confirmation messages stay visible. */
  async function refreshDetails(id: string) {
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json() as { order?: OrderDetail; error?: string };
      if (response.ok && data.order) setDetail(data.order);
    } catch { /* keep showing the last loaded details */ }
  }
  async function copyAddress() {
    if (!detail) return;
    const address = [detail.customer, detail.phone, detail.address, detail.pincode].filter(Boolean).join("\n");
    try { await navigator.clipboard.writeText(address); setAddressCopied(true); window.setTimeout(() => setAddressCopied(false), 2000); }
    catch { setDetailError("Could not access the clipboard. Select and copy the address manually."); }
  }
  const total = counts?.[filter] ?? 0;
  return <><div className="page-heading"><div><p className="overline">CUSTOMER REQUESTS</p><h1>Orders</h1><p className="muted">Review orders and update fulfilment progress.</p></div></div>
    {paymentMode === "test" && <p className="test-mode-warning" role="note">Razorpay test mode · These orders are test activity, not live sales.</p>}
    {paymentMode === "unconfigured" && <p className="test-mode-warning" role="note">Payment mode is not configured · Do not treat these orders as live sales.</p>}
    <section className="panel order-filters" role="group" aria-label="Filter orders by status">{orderFilters.map(item => <button type="button" key={item.key} className={filter === item.key ? "order-filter selected" : "order-filter"} aria-pressed={filter === item.key} onClick={() => onFilter(item.key)}>{item.label}<span>{counts?.[item.key] ?? "—"}</span></button>)}</section>
    <section className="panel">{error ? <p className="empty-orders" role="alert">{error}</p> : loading ? <p className="empty-orders">Loading orders…</p> : orders.length ? <><p className="muted order-limit-note">Showing {orders.length} most recent of {total} matching orders.</p><DataTable columns={[{ key: "customer", label: "Customer", render: o => <div className="table-customer"><b>{o.customer}</b><small>{o.item}</small></div> }, { key: "order", label: "Order", render: o => <span>{o.id.length > 12 ? o.id.slice(0, 8) : o.id}</span> }, { key: "status", label: "Status", render: o => <StatusChip tone={statusTone(o.status)}>{o.status}</StatusChip> }, { key: "total", label: "Total", render: o => <b>₹{o.total}</b> }, { key: "actions", label: "Actions", render: o => <div className="order-actions"><button className="text-button" type="button" onClick={() => onOpenOrder(o.id)}>View details</button>{o.status === "Paid" ? <FulfillmentControl order={o} current={o.fulfillmentStatus || "unfulfilled"} onSave={onUpdate} messageConfig={messageConfig} messageError={messageError} labelConfig={labelConfig} labelError={labelError} /> : <span className="table-muted">{(o.fulfillmentStatus || "unfulfilled").replaceAll("_", " ")}</span>}</div> }]} rows={orders} rowKey={o => o.id} /></> : <p className="empty-orders">{filter === "all" ? "No orders have been recorded." : `No ${orderFilters.find(item => item.key === filter)?.label.toLowerCase()} orders.`}</p>}</section>
    <ModalDrawer open={Boolean(detailOrderId)} title={detail ? `Order ${detail.id.slice(0, 8)}` : "Order details"} onClose={onCloseOrder}><div className="order-detail-content">{detailLoading ? <p role="status">Loading saved order details…</p> : detailError && !detail ? <p role="alert" className="order-detail-error">{detailError}</p> : detail ? <>
      <div className="order-detail-summary"><div><span>Customer</span><b>{detail.customer}</b></div><div><span>Order status</span><StatusChip tone={statusTone(detail.status)}>{detail.status}</StatusChip></div><div><span>Email</span><a href={`mailto:${detail.email}`}>{detail.email}</a></div><div><span>Phone</span><a href={`tel:${detail.phone}`}>{detail.phone}</a></div></div>
      <section className="order-detail-section"><h3>Items</h3>{detail.items.length ? <div className="order-detail-items">{detail.items.map((item, index) => <div className="order-detail-item" key={`${item.id}-${index}`}><span>{item.name}{item.variant && item.variant !== "Standard" && <em className="order-item-colour">{item.variant}</em>}<small>{item.quantity} × ₹{item.price}</small></span><b>₹{item.quantity * item.price}</b></div>)}{detail.giftWrap && <div className="order-detail-item gift-line"><span>Gift-ready packaging<small>Wrap this order as a gift</small></span><b>₹{detail.giftWrapPrice ?? 0}</b></div>}{detail.couponCode && (detail.discount ?? 0) > 0 && <div className="order-detail-item coupon-line"><span>Coupon {detail.couponCode}<small>Discount on murtis</small></span><b>−₹{detail.discount}</b></div>}</div> : <p>No item rows were saved for this order.</p>}<div className="order-detail-total"><span>Order total</span><b>₹{detail.total}</b></div></section>
      <section className="order-detail-section"><div className="order-detail-heading"><h3>Delivery address</h3><button className="secondary" type="button" onClick={() => void copyAddress()}>{addressCopied ? "Copied" : "Copy address"}</button></div><address>{detail.customer}{detail.phone && <><br />{detail.phone}</>}{detail.address && <><br />{detail.address}</>}{detail.pincode && <><br />PIN {detail.pincode}</>}</address></section>
      <OrderActions key={detail.id} order={detail} messageConfig={messageConfig} messageError={messageError} labelConfig={labelConfig} labelError={labelError} onChanged={() => void refreshDetails(detail.id)} onUpdateStatus={async (id, status, expected) => { const failed = await onUpdate(id, status, expected); if (!failed) await refreshDetails(id); return failed; }} />
      <section className="order-detail-section"><h3>Customer note</h3><p>No customer note was provided with this order.</p></section>
      {detailError && <p role="alert" className="order-detail-error">{detailError}</p>}
    </> : null}</div></ModalDrawer>
  </>;
}
const fulfillmentOptions = [["unfulfilled", "Not started"], ["processing", "Preparing"], ["dispatched", "Dispatched"], ["completed", "Completed"]] as const;
const fulfillmentLabel = (value: string) => fulfillmentOptions.find(option => option[0] === value)?.[1] ?? value;

/** Choosing a status changes nothing until Save, so a wrong click can't reach the customer. Live refreshes keep the unsaved choice. */
function FulfillmentControl({ order, current, onSave, messageConfig, messageError, labelConfig, labelError, showCopy = false }: { order: Order | OrderDetail; current: string; onSave: (id: string, status: string, expected: string) => Promise<string>; messageConfig: MessageConfig | null; messageError: string; labelConfig: LabelConfig | null; labelError: string; showCopy?: boolean }) {
  const orderId = order.id;
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const value = draft ?? current;
  const changed = value !== current;
  async function save() {
    setSaving(true); setError("");
    const failed = await onSave(orderId, value, current);
    setSaving(false);
    if (failed) setError(failed); else setDraft(null);
  }
  return <div className={`fulfillment-picker${changed ? " changed" : ""}`}>
    <div className="fulfillment-row">
      <select aria-label={`Delivery status for order ${orderId.slice(0, 8)}`} value={value} disabled={saving} onChange={event => { setDraft(event.target.value); setError(""); }}>{fulfillmentOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <button className="fulfillment-button" type="button" disabled={!changed || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
      {changed && !saving && <button className="text-button" type="button" onClick={() => { setDraft(null); setError(""); }}>Undo</button>}
    </div>
    {changed && <small className="fulfillment-note">Not saved · was {fulfillmentLabel(current)}</small>}
    {error && <small className="fulfillment-error" role="alert">{error}</small>}
    <MessageButtons order={order} status={current} unsaved={changed} config={messageConfig} configError={messageError} showCopy={showCopy} />
    <div className="message-row"><PrintLabelButton order={order} config={labelConfig} configError={labelError} /></div>
  </div>;
}

const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "";

/** Owner controls for one order: cancel unpaid, record a refund, tracking note. Never marks an order paid. */
function OrderActions({ order, messageConfig, messageError, labelConfig, labelError, onChanged, onUpdateStatus }: { order: OrderDetail; messageConfig: MessageConfig | null; messageError: string; labelConfig: LabelConfig | null; labelError: string; onChanged: () => void; onUpdateStatus: (id: string, status: string, expected: string) => Promise<string> }) {
  const [mode, setMode] = useState<"" | "cancel" | "refund">("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(String(order.total));
  const [reference, setReference] = useState("");
  const [restock, setRestock] = useState(true);
  const [tracking, setTracking] = useState(order.trackingNote);
  const [courier, setCourier] = useState(order.trackingCourier ?? "");
  const [trackingId, setTrackingId] = useState(order.trackingId ?? "");
  const trackingChanged = tracking !== order.trackingNote || courier !== (order.trackingCourier ?? "") || trackingId !== (order.trackingId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const unpaid = ["payment_pending", "payment_failed", "payment_setup_failed"].includes(order.rawStatus);
  const refundable = ["paid", "paid_after_cancel"].includes(order.rawStatus);
  const shipped = ["dispatched", "completed"].includes(order.fulfillmentStatus ?? "");
  const canRestock = order.rawStatus === "paid" && !shipped;

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true); setError(""); setSaved("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not update this order.");
      setSaved(done); setMode(""); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this order."); }
    finally { setBusy(false); }
  }

  if (order.rawStatus === "refunded") return <section className="order-detail-section order-manage"><h3>Refund recorded</h3>
    <dl className="order-facts"><div><dt>Amount</dt><dd>₹{order.refundAmount}{order.refundAmount !== null && order.refundAmount < order.total ? ` of ₹${order.total} (partial)` : ""}</dd></div><div><dt>Reason</dt><dd>{order.refundReason}</dd></div>{order.refundReference && <div><dt>Razorpay refund ID</dt><dd>{order.refundReference}</dd></div>}{order.refundedAt && <div><dt>Recorded</dt><dd>{shortDate(order.refundedAt)}</dd></div>}</dl></section>;
  if (order.rawStatus === "cancelled" || order.rawStatus === "payment_cancelled") return <section className="order-detail-section order-manage"><h3>Order cancelled</h3>
    <dl className="order-facts">{order.cancelReason && <div><dt>Reason</dt><dd>{order.cancelReason}</dd></div>}{order.cancelledAt && <div><dt>Cancelled</dt><dd>{shortDate(order.cancelledAt)}</dd></div>}<div><dt>Stock</dt><dd>Reserved items were returned to stock.</dd></div></dl></section>;

  return <section className="order-detail-section order-manage">
    <h3>Manage order</h3>
    {order.rawStatus === "paid_after_cancel" && <p className="order-alert" role="alert">Payment arrived after this order was cancelled, and its stock was already released. Refund the customer in your Razorpay dashboard, then record it here.</p>}
    {saved && <p className="order-saved" role="status">{saved}</p>}
    {error && <p className="order-detail-error" role="alert">{error}</p>}

    {order.rawStatus === "paid" && <div className="order-status-field"><span>Delivery status</span><FulfillmentControl order={order} current={order.fulfillmentStatus || "unfulfilled"} onSave={onUpdateStatus} messageConfig={messageConfig} messageError={messageError} labelConfig={labelConfig} labelError={labelError} showCopy /></div>}
    {order.rawStatus === "paid" && <form className="order-form" onSubmit={event => { event.preventDefault(); void send({ action: "tracking", courier, trackingId, note: tracking }, trackingId.trim() || tracking.trim() ? "Tracking saved. The customer can see it on their order." : "Tracking removed."); }}>
      <FormField label="Courier"><select value={courier} onChange={event => setCourier(event.target.value)}><option value="">Not sent yet</option><option value="trackon">Trackon</option><option value="india_post">India Post</option></select></FormField>
      <FormField label="Tracking ID"><input maxLength={30} placeholder="From the courier's receipt" value={trackingId} onChange={event => setTrackingId(event.target.value.toUpperCase())} /></FormField>
      <FormField label="Note for the customer (optional)"><input maxLength={300} value={tracking} onChange={event => setTracking(event.target.value)} /></FormField>
      <button className="secondary" type="submit" disabled={busy || !trackingChanged}>{busy ? "Saving…" : "Save tracking"}</button>
    </form>}

    {mode === "" && <div className="order-manage-buttons">
      {unpaid && <button className="secondary danger" type="button" onClick={() => { setMode("cancel"); setReason(""); }}>Cancel order</button>}
      {refundable && <button className="secondary" type="button" onClick={() => { setMode("refund"); setAmount(String(order.total)); setReason(""); setReference(""); setRestock(canRestock); }}>Record a refund</button>}
    </div>}

    {mode === "cancel" && <form className="order-form" onSubmit={event => { event.preventDefault(); void send({ action: "cancel", reason }, "Order cancelled. Its items are back in stock."); }}>
      <p className="order-form-note">This order isn’t paid. Cancelling returns its items to stock and stops the customer from paying for it.</p>
      <FormField label="Reason (optional)"><input maxLength={300} value={reason} onChange={event => setReason(event.target.value)} placeholder="e.g. Customer asked to cancel" /></FormField>
      <div className="order-form-actions"><button className="primary danger" type="submit" disabled={busy}>{busy ? "Cancelling…" : "Yes, cancel order"}</button><button className="text-button" type="button" disabled={busy} onClick={() => setMode("")}>Keep order</button></div>
    </form>}

    {mode === "refund" && <form className="order-form" onSubmit={event => { event.preventDefault(); void send({ action: "refund", amount: Number(amount), reason, reference, restock: canRestock && restock }, "Refund recorded."); }}>
      <p className="order-form-note">Issue the refund in your Razorpay dashboard first. This records it here; it doesn’t move money.</p>
      <div className="order-form-row">
        <FormField label={`Amount (₹, up to ${order.total})`}><input required type="number" inputMode="numeric" min={1} max={order.total} step={1} value={amount} onChange={event => setAmount(event.target.value)} /></FormField>
        <FormField label="Razorpay refund ID (optional)"><input maxLength={64} value={reference} onChange={event => setReference(event.target.value)} placeholder="rfnd_…" /></FormField>
      </div>
      <FormField label="Reason"><input required maxLength={300} value={reason} onChange={event => setReason(event.target.value)} placeholder="e.g. Arrived damaged" /></FormField>
      <label className="order-check"><input type="checkbox" checked={canRestock && restock} disabled={!canRestock} onChange={event => setRestock(event.target.checked)} />Put the items back in stock{!canRestock && <small>{shipped ? " — already dispatched; adjust stock in Products if they come back" : " — stock was already released"}</small>}</label>
      <div className="order-form-actions"><button className="primary" type="submit" disabled={busy || !reason.trim()}>{busy ? "Recording…" : "Record refund"}</button><button className="text-button" type="button" disabled={busy} onClick={() => setMode("")}>Back</button></div>
    </form>}
  </section>;
}

function OrderTable({ orders }: { orders: Order[] }) { return <div className="orders-list">{orders.map(o => { const date = String(o.date); const dateLabel = date.includes("T") ? date.replace("T", " ").slice(0, 16) : date; return <article className="order-row" key={o.id}><div className="order-symbol"><OrdersIcon size={17} /></div><div className="order-main"><b>{o.customer}</b><small>{o.item}</small>{o.phone && <small>{o.phone} · {o.address}, {o.pincode}</small>}</div><div className="order-meta"><small>{o.id.length > 12 ? o.id.slice(0, 8) : o.id} · {dateLabel}</small><span className={`status ${o.status.toLowerCase().replaceAll(" ", "-")}`}>{o.status}</span></div><b className="order-total">₹{o.total}</b></article>; })}</div>; }

type GiftWrap = { enabled: boolean; price: number; title: string; description: string };

/** Store settings the owner changes season to season. */
function StoreSettings({ onStoreSaved, onShopLinkSaved }: { onStoreSaved: (store: StoreVisibility) => void; onShopLinkSaved: (link: string) => void }) {
  const [saved, setSaved] = useState<GiftWrap | null>(null);
  const [draft, setDraft] = useState<{ enabled: boolean; price: string; title: string; description: string } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/admin/settings", { cache: "no-store" }).then(async response => {
      const data = await response.json() as { giftWrap?: GiftWrap; error?: string };
      if (!response.ok || !data.giftWrap) throw new Error(data.error || "Settings are unavailable right now.");
      if (active) { setSaved(data.giftWrap); setDraft({ ...data.giftWrap, price: String(data.giftWrap.price) }); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Settings are unavailable right now."); });
    return () => { active = false; };
  }, []);
  const dirty = Boolean(saved && draft && (draft.enabled !== saved.enabled || draft.price !== String(saved.price) || draft.title !== saved.title || draft.description !== saved.description));
  async function save() {
    if (!draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ giftWrap: { ...draft, price: Number(draft.price) } }) });
      const data = await response.json() as { giftWrap?: GiftWrap; error?: string };
      if (!response.ok || !data.giftWrap) throw new Error(data.error || "Could not save settings.");
      setSaved(data.giftWrap); setDraft({ ...data.giftWrap, price: String(data.giftWrap.price) });
      setMessage(data.giftWrap.enabled ? `Saved. Customers now see gift packaging for ₹${data.giftWrap.price} in the cart.` : "Saved. Gift packaging is turned off in the shop.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save settings."); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><p className="overline">STORE</p><h1>Settings</h1><p className="muted">Choose what you want to change.</p></div></div>
    <SettingsTabs tabs={[
      { key: "shop", label: "Shop", contains: "Open or closed, banner, website link, logo, Instagram, festival decoration", content: <>
        <StoreVisibilityPanel onSaved={onStoreSaved} />
        <ShopLinkPanel onSaved={onShopLinkSaved} />
        <LogoPanel />
        <InstagramPanel />
        <FestivePanel />
      </> },
      { key: "products", label: "Products", contains: "Categories, product page content", content: <>
        <CategoriesPanel />
        <ProductPageSettingsPanel part="page" />
      </> },
      { key: "marketing", label: "Ads and analytics", contains: "Meta Pixel, Google Ads, Google Analytics", content: <>
        <TrackingPanel />
      </> },
      { key: "activity", label: "Activity", contains: "Purchase pop-ups, sold count, people viewing", content: <>
        <ProductPageSettingsPanel part="activity" />
      </> },
      { key: "orders", label: "Orders", contains: "Customer messages, print label, new-order alerts", content: <>
        <MessageTemplatesPanel />
        <PrintLabelPanel />
        <OrderAlertsPanel />
      </> },
      { key: "payments", label: "Bag and payments", contains: "Gift packaging, Razorpay status", content: <>
    <section className={`panel settings-card${dirty ? " dirty" : ""}`} aria-labelledby="gift-title">
      <div className="panel-head"><div><p className="overline">CART ADD-ON</p><h2 id="gift-title">Gift-ready packaging</h2></div>{saved && <StatusChip tone={saved.enabled ? "success" : "neutral"}>{saved.enabled ? "On in shop" : "Off"}</StatusChip>}</div>
      {error && <p className="order-detail-error" role="alert">{error}</p>}
      {!draft ? !error && <p className="muted">Loading settings…</p> : <>
        <label className="toggle-row"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /><span><b>Offer gift packaging in the bag</b><small>Customers can tick it before checkout; the price is added to their total.</small></span></label>
        <div className="settings-grid">
          <label>Price per murti (₹)<input type="number" inputMode="numeric" min="0" max="10000" step="1" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} /><small className="field-hint">Charged for each murti in the bag (2 murtis = 2 × this price). 0 makes it free.</small></label>
          <label>Title<input maxLength={60} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
          <label className="settings-wide">What's included (optional)<textarea maxLength={200} placeholder="e.g. Premium wrapping, a handwritten note and a gift card" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
        </div>
        <div className="settings-preview" aria-label="Bag preview"><span className="overline">PREVIEW IN BAG</span><div className="gift-preview"><span className="gift-check" aria-hidden="true" /><div><b>{draft.title || "Gift-ready packaging"}</b>{draft.description && <small>{draft.description}</small>}</div><strong>{Number(draft.price) > 0 ? `+₹${Number(draft.price)}` : "Free"}</strong></div>{!draft.enabled && <small className="field-hint">Hidden from customers while switched off.</small>}</div>
        {message && <p className="order-saved" role="status">{message}</p>}
        <div className="settings-actions">{dirty && <span className="stock-change-summary">Unsaved changes</span>}<button className="text-button" type="button" disabled={!dirty || busy} onClick={() => saved && setDraft({ ...saved, price: String(saved.price) })}>Undo</button><button className="primary" type="button" disabled={!dirty || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save settings"}</button></div>
      </>}
    </section>
        <PaymentStatusPanel />
      </> },
    ]} />
  </>;
}
