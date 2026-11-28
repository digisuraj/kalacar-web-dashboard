// Same shapes as kalacar-app/src/data/site-content.ts. The server checks everything it receives.
export type HeroSlide = { productId: string; backgroundImage: string; desktopImage: string; showEyebrow: boolean; eyebrow: string; showTitle: boolean; title: string; showDescription: boolean; description: string; buy: { show: boolean; label: string; showPrice: boolean }; explore: { show: boolean; label: string; link: string } };
export const MAX_HERO_SLIDES = 8;
export const NEW_HERO_SLIDE: HeroSlide = { productId: "", backgroundImage: "", desktopImage: "", showEyebrow: true, eyebrow: "", showTitle: true, title: "", showDescription: true, description: "", buy: { show: true, label: "Buy now", showPrice: true }, explore: { show: true, label: "Explore collections", link: "#catalogue" } };
export type SpotlightSection = { show: boolean; showTitle: boolean; title: string; showDescription: boolean; description: string; productId: string; image: string; showLogo: boolean; whatsapp: { show: boolean; label: string } };
export const DEFAULT_GOOGLE_REVIEWS_HEAD: HomeContent["googleReviews"] = { show: true, showEyebrow: true, eyebrow: "Google reviews", showTitle: true, title: "Loved by devotees", showDescription: true, description: "Real Google reviews of Murtiverse, our sister studio. Same hands, same care." };
export const DEFAULT_SPOTLIGHT: SpotlightSection = { show: false, showTitle: true, title: "Bring home the divine", showDescription: true, description: "", productId: "", image: "", showLogo: true, whatsapp: { show: true, label: "Order on WhatsApp" } };
export type CatalogueSection = { show: boolean; showEyebrow: boolean; eyebrow: string; showTitle: boolean; title: string; showDescription: boolean; description: string; productIds: string[]; showFilters: boolean };
export const DEFAULT_CATALOGUE: CatalogueSection = { show: true, showEyebrow: true, eyebrow: "FEATURED", showTitle: true, title: "Murtis for everyday spaces", showDescription: false, description: "", productIds: [], showFilters: false };
export type HomeContent = {
  hero: { show: boolean; autoplay: boolean; interval: number; slides: HeroSlide[] };
  firstLaunch: { show: boolean; showTitle: boolean; title: string; showDescription: boolean; description: string; productIds: string[] };
  comingSoon: { show: boolean; showTitle: boolean; title: string; showDescription: boolean; description: string; items: { name: string; image: string }[] };
  collections: { show: boolean; showTitle: boolean; title: string; showDescription: boolean; description: string };
  catalogue: CatalogueSection;
  why: { show: boolean; showTitle: boolean; title: string; showDescription: boolean; description: string; items: { title: string; text: string; icon?: string }[]; showLogo: boolean; logo: string };
  /** Heading above the fixed Google reviews of Murtiverse. */
  googleReviews: { show: boolean; showEyebrow: boolean; eyebrow: string; showTitle: boolean; title: string; showDescription: boolean; description: string };
  reviews: { show: boolean; showTitle: boolean; title: string; showDescription: boolean; description: string; showText: boolean; showVideo: boolean };
  spotlight: SpotlightSection;
  story: { show: boolean; showTitle: boolean; title: string; showText: boolean; text: string; showImage: boolean; image: string; showFounder: boolean; founder: string };
};
export type ProductPageContent = {
  offer: { show: boolean; title: string; text: string };
  howMade: { show: boolean; title: string; message: string; showImage: boolean; image: string; founder: string };
  faqs: { show: boolean; title: string; items: { question: string; answer: string }[] };
  viewers: { show: boolean; minimum: number };
  recentSales: { show: boolean; showFirstName: boolean; showImage: boolean; everyPage: boolean; delay: number; duration: number; size: "small" | "medium" | "large" };
  soldThisWeek: { show: boolean; minimum: number; hours: number };
  lowStock: { threshold: number; text: string };
  stickyBar: { show: boolean };
  endLink: { show: boolean; label: string; link: string };
  whatsappHelp: { show: boolean; label: string };
  eyebrow: { show: boolean; text: string };
  stockCount: { show: boolean };
  googleReviews: { show: boolean };
  /** "Delivered in {estimate}." on the product page, bag, checkout, order confirmed and the order email; `free` adds "Free delivery". */
  delivery: { estimate: string; note: string; free: { show: boolean; text: string }; freeUnderStock: { show: boolean } };
  /** Off hides the green "In stock" in the buy box; low stock and out of stock messages still show. */
  inStock: { show: boolean };
  trustStrip: { show: boolean; items: TrustItem[] };
  deliveryDates: { show: boolean; cutoffHour: number; text: string; note: string };
  buyNow: { label: string; icon: IconName; showMarks: boolean; marks: string };
  bagTrust: { showLine: boolean; delivery: { show: boolean; label: string; value: string }; taxNote: { show: boolean; text: string }; youSave: { show: boolean; text: string } };
  secureCheckout: { show: boolean; icon: IconName; label: string };
  paymentBox: { show: boolean; icon: IconName; title: string; marks: string; note: string };
  payButton: { label: string; icon: IconName };
  whatsappFloat: { show: boolean; label: string; message: string; productMessage: string };
  leaveSurvey: LeaveSurvey;
  preDispatch: { show: boolean; title: string; text: string };
};
/** The icons the shop can show; "none" hides the icon. */
export const TRUST_ICONS = [["none", "No icon"], ["delivery", "Delivery truck"], ["breakage", "Shield"], ["secure", "Lock"], ["photo", "Camera"], ["whatsapp", "Chat"], ["phone", "Phone"], ["gift", "Gift"], ["check", "Tick"], ["star", "Star"], ["heart", "Heart"]] as const;
export type IconName = (typeof TRUST_ICONS)[number][0];
export type TrustItem = { icon: IconName; title: string; text: string };
export const MAX_TRUST_ITEMS = 4;
export type LeaveReason = { key: "cod" | "trust" | "delivery" | "price" | "payment" | "question" | "other"; label: string; show: boolean };
export type LeaveSurvey = {
  show: boolean; siteShow: boolean; title: string; intro: string; siteIntro: string;
  contact: { show: boolean; title: string; text: string; whatsappLabel: string; whatsappMessage: string; showCall: boolean; callLabel: string };
  showQuestions: boolean; reasons: LeaveReason[]; continueLabel: string; siteContinueLabel: string; exitLabel: string;
};
/** The settings that belong to Settings → Trust and checkout. */
export const TRUST_KEYS: string[] = ["trustStrip", "deliveryDates", "buyNow", "bagTrust", "secureCheckout", "paymentBox", "payButton", "whatsappFloat", "leaveSurvey", "preDispatch"];
/** Same as the shop's defaults for the trust and checkout settings. */
export const DEFAULT_TRUST: Pick<ProductPageContent, "trustStrip" | "deliveryDates" | "buyNow" | "bagTrust" | "secureCheckout" | "paymentBox" | "payButton" | "whatsappFloat" | "leaveSurvey" | "preDispatch"> = {
  trustStrip: { show: true, items: [
    { icon: "delivery", title: "Free delivery", text: "Across India" },
    { icon: "breakage", title: "Breakage covered", text: "Free replacement" },
    { icon: "photo", title: "Photo before dispatch", text: "Of your actual murti, on WhatsApp" },
    { icon: "secure", title: "Secure payment", text: "UPI, cards and net banking" },
  ] },
  deliveryDates: { show: true, cutoffHour: 14, text: "Order today, get it between {from} – {to}.", note: "Exact date depends on your PIN code." },
  buyNow: { label: "Buy now", icon: "secure", showMarks: true, marks: "UPI, GPay, PhonePe, Paytm" },
  bagTrust: { showLine: true, delivery: { show: true, label: "Delivery", value: "FREE" }, taxNote: { show: true, text: "Inclusive of all taxes" }, youSave: { show: true, text: "You save {amount} on this order" } },
  secureCheckout: { show: true, icon: "secure", label: "Secure checkout" },
  paymentBox: { show: true, icon: "secure", title: "Pay securely with Razorpay", marks: "UPI, GPay, PhonePe, Paytm, Visa, Mastercard, RuPay", note: "You choose UPI, card or net banking in the next step. All payments are encrypted, and we never see or store your card or UPI details." },
  payButton: { label: "Pay {total} securely", icon: "secure" },
  whatsappFloat: { show: true, label: "Questions? Chat with us", message: "Hi Kalacar, I have a question.", productMessage: "Hi Kalacar, I have a question about {product}." },
  leaveSurvey: {
    show: true, siteShow: true, title: "Before you go", intro: "Your bag is saved. Tell us what stopped you, or talk to us first.", siteIntro: "Have a question before you decide? Talk to us, or tell us what's missing.",
    contact: { show: true, title: "Talk to a real person", text: "Have a question about the murti, delivery or payment? We reply on WhatsApp, usually within minutes.", whatsappLabel: "Chat on WhatsApp", whatsappMessage: "Hi Kalacar, I have a question before ordering.", showCall: true, callLabel: "Call us" },
    showQuestions: true,
    reasons: [
      { key: "cod", label: "I want Cash on Delivery", show: true },
      { key: "trust", label: "Not sure about the quality or the shop", show: true },
      { key: "delivery", label: "Delivery takes too long", show: true },
      { key: "price", label: "The price feels high", show: true },
      { key: "payment", label: "Payment didn't work", show: true },
      { key: "question", label: "I have a question first", show: true },
      { key: "other", label: "Something else", show: true },
    ],
    continueLabel: "Continue checkout", siteContinueLabel: "Keep browsing", exitLabel: "Exit",
  },
  preDispatch: { show: true, title: "We send you a photo", text: "Before we ship, we'll WhatsApp you a photo of your actual murti, so you can see exactly what you're getting." },
};
export const DEFAULT_EYEBROW = { show: true, text: "{category} · SMALL DEVOTIONAL MURTI" };
/** Same as the shop: the number in stock is hidden until turned on; Google reviews show. */
export const DEFAULT_STOCK_COUNT = { show: false };
export const DEFAULT_GOOGLE_REVIEWS = { show: true };
/** Same as the shop's built-in delivery wording. */
export const DEFAULT_DELIVERY: ProductPageContent["delivery"] = { estimate: "3–7 business days", note: "Carefully chosen, packed and shipped by us.", free: { show: true, text: "Free delivery across India" }, freeUnderStock: { show: false } };
export const DEFAULT_IN_STOCK = { show: true };
/** Suggested "Why choose" text, matching the shop's built-in text. */
export const SUGGESTED_WHY = {
  description: "Small murtis made with devotion, checked and packed by us, and sent safely to your home.",
  items: [
    { title: "Made for small spaces", text: "Sized for car dashboards, Devghars and work desks, so Bhagwan stays with you wherever you go." },
    { title: "Crafted with care", text: "Made by the same hands as our sister studio Murtiverse, with fine detail on every face and ornament." },
    { title: "Checked before it ships", text: "We look over every murti ourselves before it leaves us, so it reaches you just as it should." },
    { title: "Packed for a safe journey", text: "Wrapped and boxed with care so your murti arrives safely at your door." },
  ],
};
export type ProductOption = { id: string; name: string };
export const DEFAULT_ACTIVITY: Pick<ProductPageContent, "viewers" | "recentSales" | "soldThisWeek"> = {
  viewers: { show: false, minimum: 2 },
  recentSales: { show: false, showFirstName: false, showImage: true, everyPage: false, delay: 8, duration: 8, size: "medium" },
  soldThisWeek: { show: false, minimum: 3, hours: 168 },
};
