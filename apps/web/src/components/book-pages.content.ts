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

/**
 * One project on the WORK stage: a plate, the facts under it, and the action
 * a reader can honestly take next.
 *
 * WHY THE FIELDS ARE FIXED HERE AND WERE NOT ON THE REGISTER THIS REPLACED
 *
 * 04 used to be a register -- five ledgers, three ruled rows each, labelled
 * per entry. That setting answers "which of these exists"; this one answers
 * "what does the work look like", and the difference is that a stage has ONE
 * window and every project has to fill the same one. A window whose labels
 * change with the project is not a window, so the fields are fixed: category,
 * title, description, services, platform. That is the brief's own set, and it
 * is the right one for a comparison a reader makes by clicking rather than by
 * reading down a page.
 *
 * WHY `status` SURVIVED THE CHANGE, AND IS REQUIRED
 *
 * None of these four is delivered client work; they are our own studies. A
 * portfolio that lets a concept read as a shipped product is lying quietly,
 * and the way it does it is by never having anywhere to say which is which.
 * This is that place. It prints on the same line as the category, at the same
 * size, so it cannot be skimmed past -- and `cta` is the same fact made
 * operable: see the note on it below.
 */
export type PageProject = {
  /** 01..04. On the index, and again over the plate. */
  number: string;
  /** The index's one word: WEB, AI, SAAS, MOBILE. Short enough for one line. */
  label: string;
  /** WEB APPLICATION, AI PLATFORM -- the kicker over the title. */
  category: string;
  /** NIVLAK LAB · CONCEPT. Stated, never implied. */
  status: string;
  /**
   * The work, as a run: Strategy · UX/UI · Engineering · Deployment.
   *
   * A list and not a joined string, because the page sets it the way 03 sets
   * a stage's `work` -- one <li> each, with the separators drawn rather than
   * typed, so nothing announces "middle dot" three times.
   */
  services: string[];
  /** Web, AI Platform, SaaS, Mobile. */
  platform: string;
  /**
   * The action, and the chapter of this book it turns to.
   *
   * The brief asks for "VIEW PROJECT ->" and there is nothing to view: these
   * are studies, no route exists, and inventing one would mean inventing the
   * results to put on it -- which the same brief forbids two lines further
   * down. So the action says what it actually does. It is a per-project field
   * rather than one house string precisely so that the day one of these gains
   * something a reader can open, that entry alone can say so.
   */
  cta: { label: string; chapter: number };
};

/**
 * A stage of a procedure, set as a PLATE with its descriptive letterpress.
 *
 * WHY THIS IS NOT `PageStep`, WHICH ALREADY EXISTS
 *
 * A step is a name and a sentence, and six of them run down a spread as a
 * ruled list -- which is what 03 was, and it was a summary rather than an
 * answer. A client reading it learned the order of the work and nothing about
 * what the work IS, what arrives at the end of a stage, or what changes
 * because it happened.
 *
 * A stage carries those three things as fields, because a page cannot ask a
 * question the content has no room to answer. `work` is what happens, and
 * `deliverable` and `outcome` are the two halves of what a client gets: the
 * artefact and the state of the world after it. Prose can hold all three and
 * buries them; three fields cannot, and the reader can compare stage 02's
 * against stage 05's without reading either one twice.
 *
 * WHY `deliverable` AND `outcome` ARE BOTH REQUIRED
 *
 * They are not the same claim and one of them is much easier to write. A
 * deliverable is a thing that exists and can be handed over; an outcome is
 * what it was for. A stage that can name the first but not the second is a
 * stage that produces paperwork, and this is the field that makes that
 * visible while the copy is being written rather than after it ships.
 */
export type PageStage = {
  /**
   * The plate's number, in roman.
   *
   * Roman, and not the FIG. 01 of the brief this chapter was drawn from, for
   * the reason the note above ROMAN_PARTS in book-sheets.tsx already gives:
   * illustrations are numbered in roman here so they cannot be confused with
   * the 01-07 of the chapters. That mattered more on this chapter than
   * anywhere else -- "FIG. 04" printed inside chapter 03 reads as a pointer to
   * chapter 04, which is one tab away in the thumb index and is a real
   * chapter. It also keeps these clear of the engraved Fig. 1-2, which are
   * diagrams rather than photographs and are a different series.
   */
  figure: string;
  /** What KIND of work the stage is -- RESEARCH & INSIGHT, SYSTEM BLUEPRINT. */
  label: string;
  /** The stage stated as one imperative sentence. */
  headline: string;
  /** What happens here, as a run of short phrases set with separators. */
  work: string[];
  /** The artefact that is handed over. */
  deliverable: string;
  /** What is true afterwards that was not true before. */
  outcome: string;
};

/**
 * The page that closes a chapter: what the whole run added up to, and the way
 * out of it.
 *
 * It exists because a procedure has an END and a catalogue does not. 02 can
 * stop after its last entry -- a list of what we build needs no summary, since
 * the reader has been comparing entries the whole way down. Six stages read in
 * order are a journey, and a journey that stops on its last leg leaves the
 * reader on the page rather than at the door.
 *
 * The arc and the deliverables it prints are DERIVED from the chapter's own
 * stages rather than written here, for the same reason nothing in this file
 * says which page an entry is on: a seventh stage should change one place.
 */
export type PageTailpiece = {
  arcTitle: string;
  valueTitle: string;
  /** What the process buys, in the client's words rather than ours. */
  value: string[];
  /**
   * The qualification a reader needs once they have counted six stages: that
   * they do not have to start at the first one. Set where a footnote goes,
   * doing a footnote's job -- see `colophon`.
   */
  note: string;
  cta: {
    eyebrow: string;
    headline: string;
    body: string;
    /** Both seek the timeline by CHAPTER index, the way the thumb index does. */
    primary: { label: string; chapter: number };
    secondary: { label: string; chapter: number };
  };
};

/** One entry in an illustrated catalogue: a plate and what it is. */
export type PageService = {
  /**
   * A line cut. Optional because an entry is illustrated ONCE: the catalogue
   * on 02 is set from photographs and gives its entries `image` instead, while
   * 05 has no photographs and stays with the engraved emblems. An entry
   * carrying both would print two pictures of the same idea side by side.
   *
   * 04 carries no emblems at all now. Its four projects are a photograph
   * each, set one at a time on a stage that fills the recto, and an emblem
   * beside one would be a second, smaller picture of the same thing.
   */
  emblem?: EmblemName;
  /** A photographic plate, set beside the entry rather than above it. */
  image?: PageFigure;
  title: string;
  /** Optional: a plate grid of titles alone is a legitimate setting. */
  body?: string;
  /**
   * The stage's facts, on a PROJECT entry. Its presence is what puts the whole
   * chapter into the project setting -- see isProjects in book-sheets.tsx --
   * the same way `image` is what puts one into the illustrated setting.
   *
   * A project carries `image` too, and for the same reason a stage does: the
   * plate IS the entry. isProjects is therefore asked before isIllustrated,
   * or four 16:9 photographs would be cut into thumbnails beside sentences
   * and stacked down two spreads, which is the layout this setting exists to
   * replace.
   */
  project?: PageProject;
  /**
   * The letterpress, on a PLATE-SECTION entry. Its presence is what puts the
   * chapter into the plate setting, the third of the three the data decides
   * between -- see isPlateSection in book-sheets.tsx.
   *
   * An entry carrying `stage` also carries `image`, and that is not the
   * catalogue setting arriving by the back door: isPlateSection is asked
   * FIRST, so a stage's photograph is set as a full-measure plate with its
   * description under it rather than as a 42% thumbnail beside a sentence.
   */
  stage?: PageStage;
  /**
   * The opinion, on a PERSPECTIVES entry. Its presence is what puts the
   * chapter into that setting -- one of the four things the data decides,
   * alongside `image`, `project` and `stage`.
   *
   * It does NOT make the chapter paginate: these entries carry no photograph
   * at all, so expandChapter still hands 05 back as the one
   * hand-composed spread it was authored as. The setting changes what the two
   * halves print, not how many there are -- which is the whole point of it
   * being compact.
   */
  perspective?: PagePerspective;
};

/**
 * One entry in a run of PERSPECTIVES: an opinion, and the short label the
 * index calls it by.
 *
 * WHY A `thesis` AND NOT JUST THE TITLE THAT WAS THERE
 *
 * 05 used to be six category names -- AI & Automation, Technology, Software
 * Engineering, Design, Business, Future Insights -- each under a sentence
 * saying it was interested in that category. "Tracking the latest technologies
 * shaping the digital world" is a description of a topic, not a view of it,
 * and a chapter called Perspectives whose entries hold no opinion is a
 * contents page for writing that does not exist.
 *
 * The category stays as `title`, because it is how a reader finds the entry.
 * The thesis is what the entry actually SAYS, and it is a claim someone could
 * disagree with -- which is the test. It is the largest thing on the page for
 * the same reason.
 */
export type PagePerspective = {
  /** The short form the index prints: AI, TECHNOLOGY, ENGINEERING. */
  label: string;
  /** The opinion itself, set large. A sentence, with a full stop. */
  thesis: string;
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
  /**
   * A line set under the tailpiece on the chapter's LAST page.
   *
   * Where a footnote would go, and doing a footnote's job -- the qualification
   * a reader needs and the running text should not stop for. It is printed on
   * the last page rather than the first because that is where the reader has
   * just finished counting the entries it qualifies.
   */
  colophon?: string;
  /** The second half of a numbered procedure. */
  steps?: PageStep[];
  /**
   * The page that closes a PLATE SECTION. Only a chapter set as one has a use
   * for it: see PageTailpiece, and the pagination at the foot of this file for
   * where it lands.
   */
  tailpiece?: PageTailpiece;
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
    /**
     * Where a reader recognises themselves before they write.
     *
     * These belong on the contact page and not at the end of 03, which is
     * where the brief put them. 03 answers "how does this work"; a reader
     * still deciding whether they are the right shape of client is asking
     * something else, and they ask it at the point of writing to us. Set as
     * questions rather than as segments because the reader is meant to answer
     * one, not to be sorted by it.
     */
    prompts?: string[];
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
    // the gap in the figure numbering; see the note above 03, which took the
    // last of it out.
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
  // 03 is the PLATE SECTION, the third of the three settings the data picks
  // between, and it is here because the other two would both have been wrong.
  //
  // WHAT IT WAS
  //
  // Six `steps` -- an emblem, a name and one sentence each -- three down the
  // verso and three down the recto against an engraved plate. It was accurate
  // and it answered nothing. A client who read it came away knowing the ORDER
  // of the work and not what any stage of it involves, what arrives at the end
  // of one, or what is different afterwards. "Deploying with confidence and
  // performance" is a caption, and captions are what you write when the page
  // has no room for an answer.
  //
  // WHY NOT THE CATALOGUE SETTING, WHICH ALREADY HANDLES PHOTOGRAPHS
  //
  // Because 02 is the catalogue and this would then be the second one, which
  // is the exact bug 04 was rebuilt to fix -- see the note above it. Two
  // chapters set the same way one spread apart stop reading as two chapters.
  // And the catalogue's plate is 42% of a text column, about 260px wide on a
  // 1440 viewport: these six photographs are a notebook of interview notes, a
  // strategy blueprint, a wireframe sheet, an architecture diagram, a
  // deployment pipeline and an analytics dashboard, and every one of them is
  // MADE of small type. At 260px none of it is readable and the plate becomes
  // a texture. The whole reason to use these photographs rather than emblems
  // is that a client can look at one and see the actual artefact.
  //
  // SO: ONE STAGE PER PAGE, PLATE ABOVE ITS LETTERPRESS
  //
  // The plate takes the full measure of the page and the three questions a
  // client is actually asking are answered under it in order -- what happens,
  // what you get, what is true afterwards. Eight pages: a half-title, the six
  // stages, and a tailpiece. The pagination at the foot of this file derives
  // that from the run; nothing here says which page a stage is on.
  //
  // The chapter carries no engraved plate any more. There is no page left for
  // one, and a Baudot code table beside a photograph of a deployment pipeline
  // is two answers to the same question -- the reason 02 dropped its own.
  //
  // Three of the five engravings have gone this way now: 03's when it gained
  // photographs, 05's when it became the perspectives, and 04's when its verso
  // took the index of projects. Each time the numbering closed up behind them,
  // which is the whole reason the engraved series is numbered separately from
  // the plates. The two left -- 01's flow chart and 07's telegraphy -- are
  // Fig. 1 and Fig. 2, where they began as Fig. 1 and Fig. 5.
  {
    number: "03",
    title: "Approach",
    facing: {
      headline: "From Vision to Reality.",
      epigraph: "Six stages, in the order they actually happen.",
      intro: {
        lead: "Every product begins with understanding.",
        body: "Not with assumptions, and not with a stack chosen before anyone knows what it is for. This chapter is the whole of the work: what happens at each stage, what you are handed at the end of it, and what changes because it happened.",
      },
    },
    services: [
      {
        image: {
          src: "/process/discover.webp",
          ratio: "1240 / 698",
          alt: "An open notebook of customer interview notes and business observations beside a magnifier, photographs and a folded plan.",
        },
        title: "Discover",
        body: "We learn how your business works, who your users are, and what problem actually needs solving — before anyone writes code. This is the cheapest stage at which to be wrong.",
        stage: {
          figure: "I",
          label: "Research & Insight",
          headline: "Understand before building.",
          work: [
            "Stakeholder discovery",
            "Business analysis",
            "User research",
            "Requirement gathering",
            "Opportunity mapping",
          ],
          deliverable: "Discovery Report",
          outcome:
            "A shared understanding of the problem, agreed before development begins.",
        },
      },
      {
        image: {
          src: "/process/strategize.webp",
          ratio: "1240 / 698",
          alt: "A product strategy blueprint on a drafting table: business goals, user needs and technology strategy feeding a system architecture, with a scale rule and a pencil beside it.",
        },
        title: "Strategize",
        body: "With the problem clear, we settle what to build and in what order: the architecture, the technology, and which features earn their place in the first release.",
        stage: {
          figure: "II",
          label: "System Blueprint",
          headline: "Build the right roadmap.",
          work: [
            "Product strategy",
            "Technical architecture",
            "Feature prioritization",
            "Technology selection",
            "Development roadmap",
          ],
          deliverable: "System Blueprint",
          outcome:
            "One document that connects the business goals to the technical decisions they imply.",
        },
      },
      {
        image: {
          src: "/process/design.webp",
          ratio: "1240 / 698",
          alt: "Wireframe sheets for a website and a phone laid out beside a component library, a type specimen and a colour palette.",
        },
        title: "Design",
        body: "Strategy becomes something you can click. Flows, wireframes, a visual system and a working prototype, drawn around your users rather than around our taste.",
        stage: {
          figure: "III",
          label: "Experience & Interface",
          headline: "Shape something people enjoy using.",
          work: [
            "User flows",
            "Wireframing",
            "UX and UI design",
            "Design systems",
            "Prototyping",
          ],
          deliverable: "Design System",
          outcome:
            "An interface you can click through and judge before a line of it is built.",
        },
      },
      {
        image: {
          src: "/process/engineer.webp",
          ratio: "1240 / 698",
          alt: "A monitor showing a service architecture diagram over an editor and a running terminal, beside a second screen of engineering documentation.",
        },
        title: "Engineer",
        body: "The plan becomes a product. The same people who scoped it build it, so nothing is lost in a handover — and it is built to be read, extended and handed on.",
        stage: {
          figure: "IV",
          label: "Building the System",
          headline: "Turn the plan into working software.",
          work: [
            "Frontend development",
            "Backend development",
            "API integration",
            "AI integration",
            "Database engineering",
            "Security and performance",
          ],
          deliverable: "Working Product",
          outcome:
            "A system that is secure, that scales, and that the next person to open it can read.",
        },
      },
      {
        image: {
          src: "/process/launch.webp",
          ratio: "1240 / 698",
          alt: "A production deployment pipeline on screen — build, test, staging, deploy, verify — beside service health, response times and deployment history.",
        },
        title: "Launch",
        body: "We test it, tune it and put it into production, then watch it. Going live is a procedure with a checklist, not an event you hope goes well.",
        stage: {
          figure: "V",
          label: "From Build to Production",
          headline: "Go live without holding your breath.",
          work: [
            "Quality assurance",
            "Deployment",
            "Performance testing",
            "Production configuration",
            "Monitoring",
          ],
          deliverable: "Live Platform",
          outcome:
            "The product in front of real users, with the instrumentation to know it is well.",
        },
      },
      {
        image: {
          src: "/process/evolve.webp",
          ratio: "1240 / 698",
          alt: "A product analytics dashboard showing growth, feature adoption and an iteration roadmap, above an open notebook working through the next release.",
        },
        title: "Evolve",
        body: "Launch is the beginning. Analytics, feedback and what people actually do with the product decide what gets built next, release after release.",
        stage: {
          figure: "VI",
          label: "Continuous Evolution",
          headline: "Keep improving what matters.",
          work: [
            "Product analytics",
            "User feedback",
            "Feature improvements",
            "Performance optimization",
            "Long-term support",
          ],
          deliverable: "Growth Roadmap",
          outcome:
            "Decisions about what to build next made from evidence rather than from opinion.",
        },
      },
    ],
    tailpiece: {
      arcTitle: "The whole of it",
      valueTitle: "What you get",
      value: [
        "Clarity",
        "Strategy",
        "Design",
        "Technology",
        "Launch",
        "Continuous improvement",
      ],
      note: "Not every project starts at the same stage. We can carry an idea from discovery through to launch, or step in at the one where your product is stuck.",
      cta: {
        eyebrow: "Ready when you are",
        headline: "Have an idea worth building?",
        body: "Whether you are starting from an idea, improving a product that already exists, or scaling one that is growing faster than it was built for, we will help you turn the next step into something real.",
        // Chapter indices into BOOK_PAGES, the same currency the thumb index
        // spends: 6 is 07 Connect, 3 is 04 Work. <Book> resolves both through
        // FIRST_SPREAD_OF_CHAPTER, so neither survives a chapter moving.
        primary: { label: "Start a project", chapter: 6 },
        secondary: { label: "Explore our work", chapter: 3 },
      },
    },
  },
  // 04 is the PROJECT STAGE: four studies, one 16:9 window, and an index that
  // changes which of them is in it. One spread, not two.
  //
  // WHY A STAGE AND NOT THE REGISTER IT REPLACED
  //
  // The register set five ledgers down two spreads -- a plate number, a title,
  // a status line and three ruled rows each -- with the photographs printed at
  // about 150px beside them. It answered "which of these exists" well and
  // answered "what does the work look like" not at all, because at 150px an
  // interface is a texture. These four images are pictures of SOFTWARE: panels,
  // tables, charts, a workflow read left to right. Being able to see that is
  // the only reason to print them, and it needs the full measure of a page.
  //
  // One window also costs one spread instead of two, which is 67vh of scroll
  // off the document for a chapter that reads better shorter.
  //
  // WHY THE HONESTY DID NOT COME OFF WITH THE LEDGERS
  //
  // The register carried the status because a portfolio that lets a concept
  // read as a shipped product is lying quietly. That is still true on a stage,
  // and the stage has fewer places to say it -- so `status` prints on the
  // category line, at the category's size, and the colophon under the index
  // says it again in a sentence. The action says it a third time: see the note
  // on PageProject.cta. Nothing here is client work and the page says so three
  // times, because the picture is large and pictures are believed first.
  //
  // WHAT IS STILL WRONG WITH IT, AND IS NOT A BUG IN THIS FILE
  //
  // These four entries are 02's first four services -- web, AI, SaaS, mobile --
  // named again two spreads later. That is the repetition the register was
  // built to remove and it is back, because the brief asks for these four by
  // name and in these words. It is survivable only because the two chapters are
  // now set nothing like each other and because the status line says these are
  // studies where 02's entries are offers. Give any of these four a specific
  // identity -- a name, a thing that exists -- and the overlap goes.
  {
    number: "04",
    title: "Work",
    facing: {
      headline: "Ideas Brought to Life.",
      subtitle:
        // Not "the plate opposite". Portrait collapses the spread onto one
        // sheet and sets the stage BELOW this line rather than across the
        // gutter from it, so "opposite" is wrong on every phone held upright.
        "Four studies from the workshop. Choose one; the plate changes with it.",
      // Not "a studio is what it has built", which is what this chapter said
      // when one of its five entries was a delivered build. All four are
      // studies now, and an epigraph arguing that only shipped work counts
      // would be the page contradicting its own colophon two inches away.
      epigraph: "Before a thing is built, it is drawn.",
      // No engraving. The verso carries the INDEX of the four projects -- see
      // ProjectIndex -- and a page cannot hold both: the index is what a
      // reader uses, and an 1888 code table under it was a good picture with
      // nothing to say about the four opposite it. The index moved here off
      // the recto, where it was four tracked words above the plate they were
      // meant to help you choose.
    },
    colophon:
      "All four are Nivlak Lab studies — our own concepts, built in-house. None is delivered client work, and the line under each plate says so.",
    services: [
      {
        title: "Digital Platforms, Engineered.",
        body: "Fast, responsive web applications designed around real users, business goals and scalable technology.",
        image: {
          src: "/work/web-application.webp",
          ratio: "16 / 9",
          alt: "A project dashboard: a sidebar of projects, tasks, time tracking and invoices, over summary cards, a progress chart and a project list.",
        },
        project: {
          number: "01",
          label: "Web",
          category: "Web Application",
          status: "Nivlak Lab · Concept",
          services: ["Strategy", "UX/UI", "Engineering", "Deployment"],
          platform: "Web",
          cta: { label: "Enquire about this", chapter: 6 },
        },
      },
      {
        title: "Intelligence, Engineered.",
        body: "AI-powered systems that transform data, automate workflows and turn complex processes into intelligent products.",
        image: {
          src: "/work/ai-platform.webp",
          ratio: "16 / 9",
          alt: "A workflow builder read left to right: data sources feeding model processing, then decision logic, then the actions each decision triggers.",
        },
        project: {
          number: "02",
          label: "AI",
          category: "AI Platform",
          status: "Nivlak Lab · Concept",
          services: ["AI", "Automation", "APIs", "Engineering"],
          platform: "AI Platform",
          cta: { label: "Enquire about this", chapter: 6 },
        },
      },
      {
        title: "Built to Scale.",
        body: "Connected software products built with scalable architecture, reliable infrastructure and thoughtful user experiences.",
        image: {
          src: "/work/saas-product.webp",
          ratio: "16 / 9",
          alt: "A subscription dashboard: revenue and customer panels beside a second screen of analytics and a customer list.",
        },
        project: {
          number: "03",
          label: "SaaS",
          category: "SaaS Product",
          status: "Nivlak Lab · Concept",
          services: ["Product", "Architecture", "Engineering", "Cloud"],
          platform: "SaaS",
          cta: { label: "Enquire about this", chapter: 6 },
        },
      },
      {
        title: "Designed for Everyday Use.",
        body: "Mobile experiences that combine intuitive interaction, strong product thinking and reliable engineering.",
        image: {
          src: "/work/mobile-application.webp",
          ratio: "16 / 9",
          alt: "Three phone screens from one app: a dashboard, an overview with a shortcuts grid, and a reports view.",
        },
        project: {
          number: "04",
          label: "Mobile",
          category: "Mobile Product",
          status: "Nivlak Lab · Concept",
          services: ["Product", "UX/UI", "Mobile Engineering"],
          platform: "Mobile",
          cta: { label: "Enquire about this", chapter: 6 },
        },
      },
    ],
  },
  // 05 is the PERSPECTIVES setting: an index of six opinions on the verso, and
  // whichever one the reader has chosen set large on the recto.
  //
  // WHAT IT WAS
  //
  // A lead entry and a five-cell modular grid, both set from category names --
  // AI & Automation, Technology, Software Engineering -- each under a line
  // saying the studio was interested in that category. It was a contents page
  // for writing that does not exist, and the five-cell grid left a quarter of
  // the recto empty because five does not divide by two.
  //
  // Every entry now carries a `thesis`: a claim someone could disagree with,
  // which is the test a perspective has to pass. The categories stay, as the
  // way a reader finds one.
  //
  // WHY THE PAGE CHANGES WHEN YOU CLICK IT, WHICH NOTHING ELSE IN THIS BOOK
  // DOES
  //
  // A volvelle -- the rotating paper disc bound into astronomical and medical
  // books for five centuries, where the reader turns a wheel and the page
  // shows a different answer in the same window. It is the one printed device
  // that swaps content in place without turning a leaf, and it is what this
  // spread is: a fixed window on the recto, six settings on the verso.
  //
  // So the interaction is not a web pattern borrowed onto a book page; it is
  // the book pattern the brief happened to be describing. It is also the only
  // place in the whole monograph where the reader chooses rather than turns,
  // which is the right place for it -- these are opinions, and you pick one.
  //
  // The engraved plate is gone. The verso is the index now and there is no
  // room for it; a fractal antenna beside six opinions about software was
  // never illustrating any of them.
  {
    number: "05",
    title: "Perspectives",
    facing: {
      headline: "Ideas Worth Exploring.",
      subtitle: "What we read, argue about, and write down.",
    },
    services: [
      {
        emblem: "chip",
        title: "AI & Automation",
        perspective: {
          label: "AI",
          thesis: "The next interface is intelligence.",
        },
        body: "AI is moving beyond chat. The opportunity is building software that understands context, makes decisions and takes meaningful action.",
      },
      {
        emblem: "cloud",
        title: "Technology",
        perspective: {
          label: "Technology",
          thesis: "Technology should disappear into the experience.",
        },
        body: "The best technology is powerful beneath the surface while remaining simple for the people who use it.",
      },
      {
        emblem: "code",
        title: "Software Engineering",
        perspective: {
          label: "Engineering",
          thesis: "Good software is built for change.",
        },
        body: "Architecture should not only solve today's problem. It should give products room to evolve tomorrow.",
      },
      {
        emblem: "compass",
        title: "Design",
        perspective: {
          label: "Design",
          thesis: "Design is how complexity becomes clear.",
        },
        body: "Great interfaces turn complicated systems into experiences that feel natural, understandable and purposeful.",
      },
      {
        emblem: "chart",
        title: "Business",
        perspective: {
          label: "Business",
          thesis: "Build technology around the problem.",
        },
        body: "The strongest digital products begin with a meaningful business problem rather than a technology looking for somewhere to be used.",
      },
      {
        emblem: "telescope",
        title: "Future Insights",
        perspective: {
          label: "Future",
          thesis: "The future belongs to adaptive products.",
        },
        body: "Products that learn from users, data and changing environments will define the next generation of digital experiences.",
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
        caption: "Fig. 2 — Telegraphy, 1876",
        credit: "A. G. Bell, US 174,465. Public domain.",
      },
    },
    contact: {
      rows: [
        {
          emblem: "phone",
          value: "+91 97873 04869",
          href: "tel:+919787304869",
        },
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
      enquiryBody:
        "Let's start a conversation about your next digital product. Any of these is a place to begin:",
      prompts: [
        "You have an idea.",
        "You have a product already.",
        "You need a redesign.",
        "You need engineering support.",
        "You need AI or automation.",
      ],
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
// A chapter is COMPUTED when its entries are a RUN the page has to make room
// for one after another -- 02's photographs, each with its caption beside it.
// A chapter is HAND-COMPOSED when its entries share one window: 04's four
// projects and 05's six perspectives are each reachable from an index that has
// to see all of them, so cutting them across spreads would put half the run
// where the index cannot send you. 05 also carries no photographs at all,
// which is the older half of the same test.
//
// Which is why the test is a question about the ENTRIES and not a list of
// chapter numbers. 04 has now crossed it twice -- onto the computed side by
// gaining records, and back off it by gaining a stage -- without this file
// ever learning its number.

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
 * The slots a paginated chapter gets. One shape, because the catalogue is the
 * only setting left that is cut by slot count at all: the plate section counts
 * pages instead (expandPlateChapter), and the project stage and the
 * perspectives are each one hand-composed spread.
 */
const SLOTS = {
  opener: OPENER_VERSO_SLOTS,
  verso: VERSO_SLOTS,
  recto: RECTO_SLOTS,
};

type PageSlots = typeof SLOTS;

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
function planSpreads(total: number, slots: PageSlots): number[] {
  const capacityOf = (spread: number) =>
    (spread === 0 ? slots.opener : slots.verso) + slots.recto;

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
  /**
   * Which half of this spread the chapter's closing page takes, on a PLATE
   * SECTION. Undefined everywhere else.
   *
   * Two values because the answer depends on the stage count and there is no
   * third option that is not a blank page. Six stages plus a half-title is
   * seven pages, so the tailpiece takes the eighth and the spread is full:
   * "recto". Seven stages would leave it opening a spread of its own, and a
   * closing page facing a blank one is the lopsided ending the catalogue's
   * even distribution exists to avoid -- so it takes both halves instead:
   * "spread", the arc on the verso and the way out on the recto.
   */
  tail?: "recto" | "spread";
};

/**
 * A PLATE SECTION, cut into spreads: one stage per page.
 *
 * There is no slot count here and no distribution to choose, which is the
 * difference between this and the catalogue. A catalogue entry is a picture
 * beside a paragraph and three of them share a page; a stage is a full-measure
 * plate over its own description and there is room for exactly one. So the
 * pagination is arithmetic rather than a policy:
 *
 *   page 0        the half-title -- the chapter head, its opening paragraph,
 *                 and the six stages listed in order, which is the contents of
 *                 the chapter and doubles as its navigation
 *   pages 1..n    the stages
 *   the last      the tailpiece
 *
 * Six stages make that eight pages, four spreads, no page left over. An ODD
 * stage count would leave the tailpiece opening a spread with a blank facing
 * it, so it takes the whole closing spread instead -- see `tail`. Both cases
 * are here because the second one is what happens the first time someone adds
 * a seventh stage, and a blank page is not a thing this book should be able to
 * print by accident.
 */
function expandPlateChapter(page: BookPage, chapter: number): BookSpread[] {
  const run = page.services ?? [];
  // The half-title, then the stages. The tailpiece takes what is left of the
  // last spread, which is one page when that lands on a recto and two when it
  // does not.
  const pagesBeforeTail = 1 + run.length;
  const tail: "recto" | "spread" = pagesBeforeTail % 2 === 1 ? "recto" : "spread";
  const spreads = Math.ceil((pagesBeforeTail + (tail === "recto" ? 1 : 2)) / 2);

  // Which stage a page carries, or none for the half-title and the tailpiece.
  const stageOn = (pageIndex: number) =>
    pageIndex >= 1 && pageIndex < pagesBeforeTail
      ? run.slice(pageIndex - 1, pageIndex)
      : [];

  return Array.from({ length: spreads }, (_, spread) => {
    const versoPage = spread * 2;
    const verso = stageOn(versoPage);
    const recto = stageOn(versoPage + 1);
    return {
      ...page,
      chapter,
      // The half-title is on spread 0 and nowhere else, so every later spread
      // is a continuation and takes none of the opener furniture -- the same
      // rule the catalogue follows, for the same reason.
      continued: spread > 0,
      lastOfChapter: spread === spreads - 1,
      // The chapter's run is one stage per page, so the first entry of a
      // spread is at its verso's page index minus the half-title. Clamped for
      // spread 0, whose verso carries no entry at all.
      servicesFrom: Math.max(0, versoPage - 1),
      tail: spread === spreads - 1 ? tail : undefined,
      facing: { ...(page.facing ?? { headline: page.title }), services: verso },
      services: recto,
    };
  });
}

function expandChapter(page: BookPage, chapter: number): BookSpread[] {
  const run = page.services ?? [];
  // Which setting this chapter is in, and so whether it is cut at all. A run
  // of bare engraved titles keeps the halves it was authored with.
  //
  // The plate section is asked FIRST, because its entries carry `image` too
  // and would otherwise be cut as a catalogue -- three to a page, at 42% of a
  // text column. Order here is the same claim isPlateSection makes in
  // book-sheets.tsx and the two have to agree: the question a run answers is
  // "what setting is this", and a run that answers it twice is a bug in one of
  // the two places, not a chapter with two settings.
  if (run.some((service) => service.stage)) {
    return expandPlateChapter(page, chapter);
  }
  // One hand-composed spread, uncut. Two settings land here and for the same
  // reason: a run that shares ONE window is not a run to be spread over pages.
  // The project stage keeps its four projects together because the index has
  // to reach all four from wherever it is printed; the perspectives keep their
  // six for the same reason. A run of bare engraved titles falls in too, and
  // keeps the halves it was authored with.
  //
  // The project test comes before the `image` test, not after: its entries
  // carry photographs, and the catalogue would have claimed them.
  if (
    run.some((service) => service.project) ||
    !run.some((service) => service.image)
  ) {
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

  const slots = SLOTS;
  let cursor = 0;
  const plan = planSpreads(run.length, slots);
  return plan.map((count, spread) => {
    // Halve each spread's share, but never past what the verso holds. The
    // recto can always take the rest: the verso's cap is the lower of the two
    // on the opening spread and equal to it after, so the remainder fits by
    // construction. That still holds when the opener's verso cap is zero --
    // planSpreads never gives spread 0 more than capacityOf(0), which is then
    // the recto's count alone.
    const versoCap = spread === 0 ? slots.opener : slots.verso;
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

/**
 * Which spread an entry of a chapter's run landed on.
 *
 * The process index at the head of 03 lists the chapter's six stages and
 * scrolls to one, and a stage is a PAGE rather than a chapter -- so the thumb
 * index's currency, a chapter number, cannot address it. This is the other
 * direction of the same lookup FIRST_SPREAD_OF_CHAPTER does, and it is derived
 * from the pagination for the same reason: the index has to keep working when
 * a stage is added and the spreads re-cut underneath it.
 */
export function spreadOfEntry(chapter: number, entry: number): number {
  const found = BOOK_SPREADS.findIndex((spread) => {
    if (spread.chapter !== chapter) return false;
    const held =
      (spread.facing?.services?.length ?? 0) + (spread.services?.length ?? 0);
    return entry >= spread.servicesFrom && entry < spread.servicesFrom + held;
  });
  return found < 0 ? (FIRST_SPREAD_OF_CHAPTER[chapter] ?? 0) : found;
}
