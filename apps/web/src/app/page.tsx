import { BookScrollReveal } from "@/components/book-scroll-reveal";

// The landing page is the reveal and nothing else -- no header, no panels, no
// content below the fold. <BookScrollReveal> pins itself for the length of the
// scroll and its own pin spacer is the whole height of the document.
export default function Home() {
  return <BookScrollReveal />;
}
