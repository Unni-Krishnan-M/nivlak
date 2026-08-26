import { Book } from "@/components/book";

// The landing page is the book and nothing else -- no header, no panels. One
// pinned section carries the whole thing: the book opens, then six pages turn
// over the frame it lands on. See book.tsx for why that is one section and not
// two.
export default function Home() {
  return <Book />;
}
