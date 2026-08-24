import Header from "@/components/header";

// Everything except the landing page. The header used to live in the root
// layout, but the landing page is a full-bleed pinned canvas with nothing else
// on it, so the nav moved down here rather than being hidden from up there.
export default function ChromeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr]">
      <Header />
      {children}
    </div>
  );
}
