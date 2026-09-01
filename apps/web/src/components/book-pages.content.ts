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

/**
 * An engraved plate.
 *
 * The file is a greyscale MASK, not a picture -- see tools/fetch-plates.sh.
 * The page paints the line colour and uses the file as a CSS mask, so the
 * engraving is struck in the same silver as the lit page edge in the
 * photograph rather than pasted on as a grey rectangle.
 */
export type PagePlate = {
  src: string;
  /** width/height of the mask, so the box reserves the right space. */
  ratio: string;
  caption: string;
  credit: string;
};

/**
 * A photographic plate: one of the service renders in public/services.
 *
 * Unlike PagePlate this is a picture, not a mask -- it is printed in its own
 * colour. It can be, because tools/build-service-plates.sh keys the ground out
 * of the render, so what lands on the page is the artwork on transparency and
 * the page's own paper shows through around it. A framed rectangle would have
 * needed the keyline-and-caption treatment the engravings get; a cut-out does
 * not, and sits on the page the way the mark at the foot of 01 does.
 */
export type PageFigure = {
  src: string;
  /** width/height of the trimmed file, so the row reserves the right space. */
  ratio: string;
  alt: string;
};

/** One entry in an illustrated catalogue: a plate and what it is. */
export type PageService = {
  /**
   * A line cut. Optional because an entry is illustrated ONCE: the catalogue
   * on 02 is set from photographs and gives its entries `image` instead, while
   * 04 and 05 have no photographs and stay with the engraved emblems. An entry
   * carrying both would print two pictures of the same idea side by side.
   */
  emblem?: EmblemName;
  /** A photographic plate, set beside the entry rather than above it. */
  image?: PageFigure;
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
    /** An engraved plate, printed on the verso. */
    plate?: PagePlate;
  };
  /**
   * An engraved plate, printed on the RECTO instead of the verso.
   *
   * Which side a chapter's plate goes on is a question about that chapter's
   * copy, not a house rule: it belongs in the half with the empty lower
   * quarter. On 02 and 07 that is the verso. On 03 the verso is full to the
   * foot -- headline, subtitle and three steps -- while the recto holds three
   * steps and stops halfway, so the plate goes here.
   */
  plate?: PagePlate;
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
    // The one chapter set from photographs, and the one whose length is not
    // fixed: `services` is a single run, undivided, and the pagination below
    // decides how much of it lands on each page. Add an entry here and the
    // spread rebalances; add enough of them and it opens another spread. There
    // is deliberately nothing in this file that says which page an entry is on.
    //
    // It carries no engraved plate. There is no room for one once the pictures
    // are on the spread, and a Baudot code table beside a screenshot of a
    // dashboard is two answers to the same question. Removing it also closed
    // the gap in the figure numbering: the engravings on 03, 05 and 07 are now
    // Fig. 2, 3 and 4, where 03 and 05 were both Fig. 3 before.
    facing: {
      headline: "What We Build.",
      // Set as an epigraph rather than a subtitle: this page is a chapter
      // opening, and the line under a chapter title is quoted off the margin,
      // not run on as body text.
      epigraph: "Five ways in, all of them built by the people you meet.",
    },
    services: [
      {
        image: {
          src: "/services/web-application-development.webp",
          ratio: "900 / 499",
          alt: "A marketing site shown on a laptop, a code editor and a phone, linked by a signal trail to a globe.",
        },
        title: "Web Application Development",
        body: "Websites and web tools that load fast, stay secure, and keep working as more people use them.",
      },
      {
        image: {
          src: "/services/mobile-application-development.webp",
          ratio: "900 / 630",
          alt: "Phone screens for a shopping app above a row of stages: design system, prototyping, development, testing, deploy.",
        },
        title: "Mobile Application Development",
        body: "Android and iPhone apps that feel quick and simple — the kind people keep on the home screen.",
      },
      {
        image: {
          src: "/services/saas-product-development.webp",
          ratio: "900 / 568",
          alt: "A subscription dashboard showing revenue, customers and billing, beside a team access list and an infrastructure map.",
        },
        title: "SaaS Product Development",
        body: "Software your customers subscribe to. Built to run in the cloud and to take on more users without falling over.",
      },
      {
        image: {
          src: "/services/ai-automation-solutions.webp",
          ratio: "900 / 498",
          alt: "Emails, forms and documents feeding an AI decision engine, which files each one and reports the time saved.",
        },
        title: "AI Automation Solutions",
        body: "We hand the repetitive work to software, so your team spends the day on the parts that need a person.",
      },
      {
        image: {
          src: "/services/branding-digital-marketing.webp",
          ratio: "900 / 573",
          alt: "A logo being drawn, its type and colour palette, a content calendar, and a campaign performance chart.",
        },
        title: "Branding & Digital Marketing",
        body: "The look, the words and the campaigns that make people remember you — and come back.",
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
    plate: {
      src: "/plates/plate-process.webp",
      ratio: "417 / 620",
      caption: "Fig. 2 — Every step named, in order, ending in shipped",
      credit: "S. Gilman, Graphic Charts for the Business Man, 1920. Public domain.",
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

// ---------------------------------------------------------------------------
// PAGINATION: chapters in, spreads out
//
// BOOK_PAGES above is what someone WRITES -- one entry per chapter, and an
// illustrated chapter's entries as one undivided run. BOOK_SPREADS below is
// what the book PRINTS: one entry per turnable sheet, with that run cut across
// pages. Everything that lays out or animates reads BOOK_SPREADS; only the
// navigation reads BOOK_PAGES, because a chapter keeps one tab in the thumb
// index however many spreads it runs to.
//
// The split is derived rather than written because the whole point of the
// exercise is that adding a service is a one-line change. Hand-splitting it
// across `facing.services` and `services` -- which is how this file read
// before -- means every addition is really three edits: the entry, the page it
// moves onto, and the balance of everything after it.
//
// Only ILLUSTRATED chapters paginate. 04 and 05 set their entries as engraved
// grids whose two halves are composed by hand -- a lead plate on the verso, a
// modular grid on the recto -- and re-cutting those on a slot count would
// throw away a layout that was designed, not computed.

/**
 * How many illustrated entries fit on a page, measured at 1440x900.
 *
 * These are SLOTS on a real grid, not a rough capacity. Every catalogue page is
 * divided into PAGE_SLOTS equal rows and each entry is centred in one of them,
 * which is what makes entry II on the verso sit on the same line as entry V on
 * the recto. A chapter opening spends its first slot on the chapter head, so
 * its verso holds one entry fewer -- that is the whole of the difference
 * between OPENER_VERSO_SLOTS and VERSO_SLOTS.
 */
export const PAGE_SLOTS = 3;
const OPENER_VERSO_SLOTS = PAGE_SLOTS - 1;
const VERSO_SLOTS = PAGE_SLOTS;
const RECTO_SLOTS = PAGE_SLOTS;

/**
 * How many entries land on each spread of a chapter `total` entries long.
 *
 * Two rules, and the second is the one that matters. Use as few spreads as the
 * slots allow -- and then spread the entries EVENLY over them rather than
 * filling each in turn. Greedy filling is what produces the bad case: six
 * entries would set as five and then one, and a spread carrying a single entry
 * against three-quarters of a blank page reads as a mistake rather than as a
 * chapter ending. Evenly, six sets as three and three.
 *
 * The remainder goes to the LATER spreads because the first one is the
 * smallest: its verso is a chapter opening and gives up a page's worth of
 * space to the title, the epigraph and the sinkage above them.
 */
function planSpreads(total: number): number[] {
  const capacityOf = (spread: number) =>
    (spread === 0 ? OPENER_VERSO_SLOTS : VERSO_SLOTS) + RECTO_SLOTS;

  let spreads = 1;
  let capacity = capacityOf(0);
  while (capacity < total) capacity += capacityOf(spreads++);

  const base = Math.floor(total / spreads);
  const extra = total % spreads;
  return Array.from({ length: spreads }, (_, i) =>
    i >= spreads - extra ? base + 1 : base,
  );
}

/** One turnable sheet: a spread of the printed book. */
export type BookSpread = BookPage & {
  /** Index into BOOK_PAGES -- which chapter this spread belongs to. */
  chapter: number;
  /**
   * A spread that continues a chapter rather than opening it. Its verso is
   * more entries, not a chapter opening, so it takes none of the opener
   * furniture: no headpiece, no title, no epigraph, no sinkage.
   */
  continued: boolean;
  /**
   * The last spread of its chapter -- which is where the tailpiece goes.
   *
   * Not derivable from `continued`: that says "this is not the first", and a
   * chapter of one spread is both the first and the last. Asking `!continued`
   * for it would drop the ornament off every single-spread chapter in the book.
   */
  lastOfChapter: boolean;
  /**
   * Where this spread's entries start in the chapter's run. The numbering and
   * the left/right alternation are facts about the CHAPTER, so they have to
   * carry across the gutter and across spreads rather than restarting.
   */
  servicesFrom: number;
};

function expandChapter(page: BookPage, chapter: number): BookSpread[] {
  const run = page.services ?? [];
  // The engraved chapters keep the halves they were authored with.
  if (!run.some((service) => service.image)) {
    return [
      {
        ...page,
        chapter,
        continued: false,
        lastOfChapter: true,
        servicesFrom: 0,
      },
    ];
  }

  let cursor = 0;
  const plan = planSpreads(run.length);
  return plan.map((count, spread) => {
    // Halve each spread's share, but never past what the verso holds. The
    // recto can always take the rest: the verso's cap is the lower of the two
    // on the opening spread and equal to it after, so the remainder fits by
    // construction.
    const versoCap = spread === 0 ? OPENER_VERSO_SLOTS : VERSO_SLOTS;
    const versoCount = Math.min(versoCap, Math.ceil(count / 2));
    const from = cursor;
    const verso = run.slice(from, from + versoCount);
    const recto = run.slice(from + versoCount, from + count);
    cursor += count;

    return {
      ...page,
      chapter,
      continued: spread > 0,
      lastOfChapter: spread === plan.length - 1,
      servicesFrom: from,
      facing: {
        // Carried so a continuation spread still has a left-hand page to print
        // on; <FacingCopy> prints none of the opener devices when `continued`.
        ...(page.facing ?? { headline: page.title }),
        services: verso,
      },
      services: recto,
    };
  });
}

/** The book as it is printed: one entry per sheet. */
export const BOOK_SPREADS: BookSpread[] = BOOK_PAGES.flatMap(expandChapter);

/** Which chapter each spread belongs to, for the thumb index's active state. */
export const CHAPTER_OF_SPREAD: number[] = BOOK_SPREADS.map((s) => s.chapter);

/** Where each chapter opens, for a click on its tab. */
export const FIRST_SPREAD_OF_CHAPTER: number[] = BOOK_PAGES.map((_, chapter) =>
  BOOK_SPREADS.findIndex((s) => s.chapter === chapter),
);
