// The pages of the book, in the order they turn.
//
// Split out from the components because this is the part that gets rewritten:
// they own the turn, this owns the words.
//
// 01 Company is real copy. Everything from 02 on is placeholder -- the right
// length and the right register for the layout, but nothing in it is a claim
// anyone has checked. Replace it.

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
   * Only the opening spread has this. Every later page leaves its left half to
   * the back of the sheet that turned before it, which carries a running foot
   * and nothing else -- that is how a book works, and it is also what stops two
   * columns of type competing for the reader on every single spread.
   */
  facing?: {
    headline: string;
    subtitle: string;
  };
  /** A defined-terms list, set as the body of the right-hand page. */
  termsTitle?: string;
  terms?: PageTerm[];
};

export const BOOK_PAGES: BookPage[] = [
  {
    number: "01",
    title: "Company",
    facing: {
      headline: "We Architect the Future.",
      subtitle: "Building the Future with Intelligence.",
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
        body: "We look ahead and build solutions that create long-term value.",
      },
    ],
  },
  {
    number: "02",
    title: "Solutions",
    body: "What we build, and who it is built for. Systems that hold up under real load and real people, delivered end to end rather than handed over as a diagram.",
    points: ["Product engineering", "Platform and infrastructure", "Applied AI"],
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
