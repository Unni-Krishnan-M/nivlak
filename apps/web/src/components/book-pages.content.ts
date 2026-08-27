// The pages of the book, in the order they turn.
//
// Split out from the components because this is the part that gets rewritten:
// they own the turn, this owns the words.
//
// 01 Company is real copy. Everything from 02 on is placeholder -- the right
// length and the right register for the layout, but nothing in it is a claim
// anyone has checked. Replace it.

/** One entry in an illustrated catalogue: a plate and what it is. */
export type PageService = {
  emblem: "web" | "saas" | "ai" | "mobile" | "brand";
  title: string;
  body: string;
};

/** One entry in a defined-terms list, e.g. the N/I/V of NIV. */
export type PageTerm = {
  /** The display letter, set large in the margin. */
  letter: string;
  term: string;
  body: string;
};

export type BookPage = {
  /** The numeral printed above the title. */
  number: string;
  title: string;
  body?: string;
  /** Short lines set under the body, as a list on the page. */
  points?: string[];
  /**
   * What is printed on the LEFT-hand page facing this one.
   *
   * A left-hand page is the BACK of the sheet that turned before it, so this
   * copy is printed there -- page k's facing lands on sheet k-1's back. The
   * one exception is the opening spread, which has no preceding sheet: page 0's
   * facing goes on a layer under the stack instead, and sheet 0's back buries
   * it when it turns.
   *
   * A page without this leaves its left half to a running foot and nothing
   * else, which is what stops every single spread having two columns of type
   * competing for the reader.
   */
  facing?: {
    headline: string;
    subtitle: string;
    /**
     * The opening paragraph of the chapter. `lead` is set in small capitals
     * behind a drop cap -- the standard bridge from a big initial back down to
     * body text -- so it should be a short first sentence, three to six words
     * plus a full stop. `body` runs on from it in plain text.
     */
    intro?: { lead: string; body: string };
    /** A short line set under the chapter title, the way a book sets a quote. */
    epigraph?: string;
    /**
     * A footnote, keyed to a superscript at the end of the intro's lead
     * sentence and set above the folio behind a short rule -- the standard
     * place a book puts an aside it does not want inside the paragraph.
     */
    note?: string;
    /**
     * A figure. Books carry diagrams with a numbered caption, and a freelance
     * engagement is a short enough thing to draw: four nodes on one trace.
     */
    figure?: {
      caption: string;
      steps: { label: string; note: string }[];
    };
    /**
     * The LEAD entry, set large on the left-hand page. One dominant item and
     * a set of smaller ones is what gives a catalogue spread its hierarchy;
     * five entries at the same size is a list, whatever the plates look like.
     */
    services?: PageService[];
  };
  /** The supporting entries, set as a modular grid on the right-hand page. */
  services?: PageService[];
  /** A defined-terms list, set as the body of the right-hand page. */
  termsTitle?: string;
  terms?: PageTerm[];
  /** A closing line under the terms. */
  termsFoot?: string;
};

export const BOOK_PAGES: BookPage[] = [
  {
    number: "01",
    title: "Company",
    facing: {
      headline: "We Architect the Future.",
      subtitle: "Building the Future with Intelligence.",
      epigraph: "The person who plans it is the person who builds it.",
      note: "Freelance means you hire people, not a pipeline. The same hands scope the work, write the code, and hand it over.",
      figure: {
        caption: "Fig. 1 — How the work runs",
        steps: [
          { label: "Talk", note: "free" },
          { label: "Scope", note: "fixed" },
          { label: "Build", note: "weekly" },
          { label: "Ship", note: "yours" },
        ],
      },
      intro: {
        lead: "Nivlak is a freelance studio.",
        body: "You work straight with the people who write your code. There are no account managers in the middle, no handover to a team you have not met, and no guessing what happens next.",
      },
    },
    termsTitle: "NIV — The Meaning",
    terms: [
      {
        letter: "N",
        term: "Noble",
        body: "We keep our word, and we build for a reason bigger than money.",
      },
      {
        letter: "I",
        term: "Intelligent",
        body: "We use technology to solve real problems, not to look clever.",
      },
      {
        letter: "V",
        term: "Vision",
        body: "We think ahead, so what we build still works years from now.",
      },
    ],
    termsFoot: "Three letters. One way of working.",
  },
  {
    number: "02",
    title: "Solutions",
    facing: {
      headline: "What We Build.",
      subtitle: "Five ways in, all of them built by the people you meet.",
      services: [
        {
          emblem: "web",
          title: "Web Application Development",
          body: "Build fast, secure, and scalable web platforms tailored to your business.",
        },
      ],
    },
    services: [
      {
        emblem: "saas",
        title: "SaaS Product Development",
        body: "Design and engineer cloud-native software products for sustainable growth.",
      },
      {
        emblem: "ai",
        title: "AI Automation Solutions",
        body: "Automate workflows and unlock intelligent business operations.",
      },
      {
        emblem: "mobile",
        title: "Mobile Application Development",
        body: "Create premium Android and iOS experiences that users love.",
      },
      {
        emblem: "brand",
        title: "Branding & Digital Marketing",
        body: "Build memorable brands with strategy, design, and digital growth.",
      },
    ],
  },
  {
    number: "03",
    title: "Approach",
    body: "Small teams, short loops, and a working thing in front of you early. We would rather show you the second version than describe the first.",
    points: ["Scope by outcome", "Ship weekly", "Measure, then move"],
  },
  {
    number: "04",
    title: "Work",
    body: "Selected engagements across fintech, logistics and health. Each one started as a problem nobody had time to sit with long enough.",
    points: ["Case studies on request"],
  },
  {
    number: "05",
    title: "Perspectives",
    body: "Notes from the middle of the work -- what we got wrong, what we would do again, and the things that turned out not to matter.",
  },
  {
    number: "06",
    title: "Founder",
    body: "Nivlak is led by an engineer who still writes the hard parts. The company exists because the good version of this work is rarer than it should be.",
  },
  {
    number: "07",
    title: "Connect",
    body: "Tell us what you are trying to build and where it is stuck. A first conversation costs an hour and usually saves a quarter.",
    points: ["hello@nivlak.com"],
  },
];
