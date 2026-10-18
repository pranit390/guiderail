export type RailTone = "go" | "step" | "check" | "done" | "stop";

export interface RailStop {
  title: string;
  paragraphs: string[];
  tone: RailTone;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface CallToAction {
  label: string;
  href: string;
}

/** Content contract for a product page in this kit. Claims stay in the product module. */
export interface LandingContent {
  name: string;
  audience: string;
  positioning: string;
  cta: CallToAction;
  route: { id: string; heading: string; lede: string; stops: RailStop[] };
  journey: { id: string; heading: string; lede: string; stops: RailStop[] };
  faq: { id: string; heading: string; lede: string; items: FaqItem[] };
  close: { heading: string; lede: string };
  footer: string;
}
