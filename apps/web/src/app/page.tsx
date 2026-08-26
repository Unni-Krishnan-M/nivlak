import { BookPages } from "@/components/book-pages";
import { BookScrollReveal } from "@/components/book-scroll-reveal";

// The landing page is the book and nothing else -- no header, no panels. The
// reveal pins itself while the book opens; <BookPages> pins itself straight
// after, holding the open spread still while six content pages turn over it.
export default function Home() {
  return (
    <>
      <BookScrollReveal />
      <BookPages />
    </>
  );
}
