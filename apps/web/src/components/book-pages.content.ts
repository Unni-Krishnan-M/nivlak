// The six pages of the book, in the order they turn.
//
// Split out from <BookPages> because this is the part that gets rewritten: the
// component owns the turn, this owns the words. `body` is placeholder copy --
// it is the right length and the right register for the layout, and nothing in
// it is a claim anyone has checked. Replace it.

export type BookPage = {
  /** The numeral printed above the title, e.g. "02". The reveal is 01. */
  number: string;
  title: string;
  body: string;
  /** Short lines set under the body, as a list on the page. Optional. */
  points?: string[];
};

export const BOOK_PAGES: BookPage[] = [
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
