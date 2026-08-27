// The pages of the book, in the order they turn.
//
// The copy is transcribed from sample.jpeg -- the design mockup for the whole
// site -- so this file is the record of what Nivlak actually says. What that
// mockup lays out as scrolling cards is set here as book spreads instead: the
// words are theirs, the setting is the book's.
//
// The one thing not in here is the founder's photograph. `founder.portrait`
// takes a path under public/ and the page draws a keyline plate until there is
// one to point it at.

/** A plate: one of the line cuts in book-emblems.tsx. */
export type EmblemName =
  | "code"
  | "cloud"
  | "chip"
  | "mobile"
  | "megaphone"
  | "search"
  | "target"
  | "pencil"
  | "rocket"
  | "chart"
  | "book"
  | "compass"
  | "telescope"
  | "phone"
  | "mail"
  | "globe"
  | "pin";

/** One entry in an illustrated catalogue: a plate and what it is. */
export type PageService = {
  emblem: EmblemName;
  title: string;
  /** Optional: a plate grid of titles alone is a legitimate setting. */
  body?: string;
};

/** One numbered step of a procedure. */
export type PageStep = {
  emblem: EmblemName;
  title: string;
  body: string;
};

/** One entry in a defined-terms list, e.g. the N/I/V of NIV. */
export type PageTerm = { letter: string; term: string; body: string };

/** One line of contact detail. */
export type PageContact = {
  emblem: EmblemName;
  value: string;
  href?: string;
};

export type BookPage = {
  /** The numeral printed above the title. */
  number: string;
  title: string;
  body?: string;
  points?: string[];
  /**
   * What is printed on the LEFT-hand page facing this one.
   *
   * A left-hand page is the BACK of the sheet that turned before it, so this
   * copy is printed there -- page k's facing lands on sheet k-1's back. The one
   * exception is the opening spread, which has no preceding sheet: page 0's
   * facing goes on a layer under the stack instead, and sheet 0's back buries
   * it when it turns.
   */
  facing?: {
    headline: string;
    subtitle?: string;
    /**
     * The opening paragraph of a chapter. `lead` is set in small capitals
     * behind a drop cap -- the standard bridge from an oversized initial back
     * down to body text.
     */
    intro?: { lead: string; body: string };
    /** A short line under the chapter title, the way a book sets a quote. */
    epigraph?: string;
    /** A footnote, keyed to a superscript and set above the folio. */
    note?: string;
    /** A figure with a numbered caption. */
    figure?: {
      caption: string;
      steps: { label: string; note: string }[];
    };
    /**
     * The LEAD entry, set large. One dominant item with the rest smaller is
     * what gives a catalogue spread its hierarchy; entries all at one size are
     * a list, whatever the plates look like.
     */
    services?: PageService[];
    /** The first half of a numbered procedure. */
    steps?: PageStep[];
    /**
     * An engraved plate, printed on the verso.
     *
     * The file is a greyscale MASK, not a picture -- see tools/fetch-plates.sh.
     * The page paints the line colour and uses the file as a CSS mask, so the
     * engraving is struck in the same silver as the lit page edge in the
     * photograph rather than pasted on as a grey rectangle.
     */
    plate?: {
      src: string;
      /** width/height of the mask, so the box reserves the right space. */
      ratio: string;
      caption: string;
      credit: string;
    };
  };
  /** The supporting entries, set as a modular grid on the right-hand page. */
  services?: PageService[];
  /** The second half of a numbered procedure. */
  steps?: PageStep[];
  /** A defined-terms list, set as the body of the right-hand page. */
  termsTitle?: string;
  terms?: PageTerm[];
  /** A closing line under the terms. */
  termsFoot?: string;
  /** The founder spread. */
  founder?: {
    name: string;
    role: string;
    /** A path under public/, e.g. "/founder.jpg". */
    portrait?: string;
    bio: string[];
    principlesTitle: string;
    principles: string[];
  };
  /** The contact spread. */
  contact?: {
    rows: PageContact[];
    enquiryTitle: string;
    enquiryBody: string;
    cta: string;
  };
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
      intro: {
        lead: "Nivlak is a freelance studio.",
        body: "You work straight with the people who write your code. There are no account managers in the middle, no handover to a team you have not met, and no guessing what happens next.",
      },
      figure: {
        caption: "Fig. 1 — How the work runs",
        steps: [
          { label: "Talk", note: "free" },
          { label: "Scope", note: "fixed" },
          { label: "Build", note: "weekly" },
          { label: "Ship", note: "yours" },
        ],
      },
    },
    termsTitle: "NIV — The Meaning",
    terms: [
      {
        letter: "N",
        term: "Noble",
        body: "We act with integrity and build with a purpose greater than business.",
      },
      {
        letter: "I",
        term: "Intelligent",
        body: "We use technology with smart thinking to create real impact.",
      },
      {
        letter: "V",
        term: "Vision",
        body: "We look ahead and build solutions that create long term value.",
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
      plate: {
        src: "/plates/plate-code.webp",
        ratio: "586 / 620",
        caption: "Fig. 2 — Printing telegraph code, 1888",
        credit: "J. M. E. Baudot, US 388,244. Public domain.",
      },
      services: [
        {
          emblem: "code",
          title: "Web Application Development",
          body: "Build fast, secure and scalable web platforms tailored to your business.",
        },
      ],
    },
    services: [
      {
        emblem: "cloud",
        title: "SaaS Product Development",
        body: "Design and engineer cloud-native software products for sustainable growth.",
      },
      {
        emblem: "chip",
        title: "AI Automation Solutions",
        body: "Automate workflows and unlock intelligent business operations.",
      },
      {
        emblem: "mobile",
        title: "Mobile Application Development",
        body: "Create premium Android and iOS experiences that users love.",
      },
      {
        emblem: "megaphone",
        title: "Branding & Digital Marketing",
        body: "Build memorable brands with strategy, design and digital growth.",
      },
    ],
  },
  {
    number: "03",
    title: "Approach",
    facing: {
      headline: "From Vision to Reality.",
      subtitle: "Six steps, in the order they actually happen.",
      steps: [
        {
          emblem: "search",
          title: "Discover",
          body: "Understanding your business before writing a single line of code.",
        },
        {
          emblem: "target",
          title: "Strategize",
          body: "Planning scalable solutions aligned with your goals.",
        },
        {
          emblem: "pencil",
          title: "Design",
          body: "Crafting experiences that are intuitive and meaningful.",
        },
      ],
    },
    steps: [
      {
        emblem: "code",
        title: "Engineer",
        body: "Developing secure, scalable and future-ready products.",
      },
      {
        emblem: "rocket",
        title: "Launch",
        body: "Deploying with confidence and performance.",
      },
      {
        emblem: "chart",
        title: "Evolve",
        body: "Supporting continuous improvement and long-term growth.",
      },
    ],
  },
  {
    number: "04",
    title: "Work",
    facing: {
      headline: "Ideas Brought to Life.",
      subtitle: "Six kinds of work, and the shape each one takes.",
      services: [
        { emblem: "code", title: "Web Applications" },
        { emblem: "chip", title: "AI Platforms" },
      ],
    },
    services: [
      { emblem: "cloud", title: "SaaS Products" },
      { emblem: "mobile", title: "Mobile Apps" },
      { emblem: "megaphone", title: "Brand Experiences" },
      { emblem: "book", title: "Case Studies" },
    ],
  },
  {
    number: "05",
    title: "Perspectives",
    facing: {
      headline: "Ideas Worth Exploring.",
      subtitle: "What we read, argue about, and write down.",
      plate: {
        src: "/plates/plate-antenna.webp",
        ratio: "620 / 478",
        caption: "Fig. 3 — Fractal antenna, 2002",
        credit: "US 6,452,553 B1. Public domain.",
      },
      services: [
        {
          emblem: "chip",
          title: "AI & Automation",
          body: "Exploring how AI and automation create the future.",
        },
      ],
    },
    services: [
      {
        emblem: "cloud",
        title: "Technology",
        body: "Tracking the latest technologies shaping the digital world.",
      },
      {
        emblem: "code",
        title: "Software Engineering",
        body: "Insights on building scalable, secure and reliable systems.",
      },
      {
        emblem: "compass",
        title: "Design",
        body: "Thoughts on design that creates meaningful human experiences.",
      },
      {
        emblem: "chart",
        title: "Business",
        body: "Strategies and insights for sustainable business growth.",
      },
      {
        emblem: "telescope",
        title: "Future Insights",
        body: "Ideas and predictions for a smarter tomorrow.",
      },
    ],
  },
  {
    number: "06",
    title: "Founder",
    facing: {
      headline: "Meet the Founder.",
    },
    founder: {
      name: "Laxman S",
      role: "Founder & CEO",
      bio: [
        "Nivlak Technologies was founded with a simple belief: technology should create opportunities, solve meaningful problems, and leave a lasting impact.",
        "Driven by curiosity, continuous learning, and a passion for engineering, Laxman leads Nivlak with a long-term vision of building intelligent digital products that help businesses grow with confidence.",
      ],
      principlesTitle: "Leadership Principles",
      principles: [
        "Think Long-Term.",
        "Build With Purpose.",
        "Lead With Integrity.",
        "Never Stop Learning.",
        "Create Lasting Value.",
      ],
    },
  },
  {
    number: "07",
    title: "Connect",
    facing: {
      headline: "Let's Build What's Next.",
      subtitle: "Tell us what you are trying to build and where it is stuck.",
      plate: {
        src: "/plates/plate-telegraphy.webp",
        ratio: "431 / 620",
        caption: "Fig. 4 — Telegraphy, 1876",
        credit: "A. G. Bell, US 174,465. Public domain.",
      },
    },
    contact: {
      rows: [
        { emblem: "phone", value: "+91 97873 04869", href: "tel:+919787304869" },
        {
          emblem: "mail",
          value: "nivlak.work@gmail.com",
          href: "mailto:nivlak.work@gmail.com",
        },
        {
          emblem: "globe",
          value: "www.nivlak.com",
          href: "https://www.nivlak.com",
        },
        { emblem: "pin", value: "Nagercoil, Tamil Nadu, India" },
      ],
      enquiryTitle: "Business Enquiry",
      enquiryBody: "Let's start a conversation about your next digital product.",
      cta: "Start a Conversation",
    },
  },
];
