"use client";
import Image from "next/image";
import Link from "next/link";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  return (
    <div>
      <div className="flex h-12 flex-row items-center justify-between px-2">
        <div className="flex items-center gap-4">
          {/* The mark is the same file the book cover is stamped with
              (tools/stamp-book-logo.py reads logo.jpeg), cropped to the N and
              re-encoded -- so the badge here and the embossing on the cover in
              the reveal are the same artwork rather than two versions of it.
              It carries its own dark ground, which is why it gets a rounded
              corner and no background of its own: it reads as a plate on the
              bar in either theme. */}
          <Link href="/" aria-label="Nivlak home" className="flex items-center">
            <Image
              src="/logo.webp"
              alt=""
              width={28}
              height={28}
              priority
              className="rounded-[6px]"
            />
          </Link>
          <nav className="flex gap-4 text-lg">
            {links.map(({ to, label }) => {
              return (
                <Link key={to} href={to}>
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
      <hr />
    </div>
  );
}
