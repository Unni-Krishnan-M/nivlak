"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { BOOK_PAGES } from "@/components/book-pages.content";

/**
 * The project inquiry.
 *
 * It asks about the PROJECT before it asks who is asking: six questions about
 * the work, then a name, then an address to reply to. The order is the whole
 * design. A contact form that opens with "your email" is asking a stranger to
 * pay before they have seen anything; by question seven the visitor has spent
 * two minutes describing their own problem, and giving an address to hear back
 * about it is the natural next thing rather than the price of entry.
 *
 * WHY IT IS NOT PRINTED IN THE BOOK. Every other thing on this page is a page
 * of a photographed book -- a sheet 887px tall whose recto is 434px wide, on a
 * pinned scrub. Eight steps of large selectable buttons do not go on that
 * sheet; question four alone is seven options, and chapter 07 already clips at
 * 390x844 with nothing but its contact details on it. So this opens OVER the
 * book, in the top layer, as its own surface. It is set in the book's ink --
 * navy stock, silver type, the display serif for the questions, hairline rules
 * -- so it reads as the studio's desk rather than as a form from another site.
 *
 * That is also why the standing rule in CLAUDE.md against putting anything
 * behind a gesture does not apply here. That rule is about CONTENT: a reader
 * who never clicks must still learn what the studio thinks and how it works,
 * which is why 03's and 05's windows were both removed. Question six of an
 * inquiry is not content a reader is owed -- it is a step in an action they
 * have chosen to take. What the chapter has to say without being operated is
 * printed on the spread: the headline, what the studio can help with, and four
 * ways to make contact directly.
 *
 * Native <dialog> and showModal(), not a div with a z-index. It buys the focus
 * trap, Escape, the inert background, the top layer -- which is what puts it
 * clear of the pinned section's transforms without a portal -- and the correct
 * AT semantics, all of which are a lot of code to get wrong by hand.
 */

// -- the questions ----------------------------------------------------------

type Answers = {
  building: string;
  problem: string;
  stage: string;
  needs: string[];
  timeline: string;
  scale: string;
  name: string;
  company: string;
  email: string;
  phone: string;
};

const EMPTY: Answers = {
  building: "",
  problem: "",
  stage: "",
  needs: [],
  timeline: "",
  scale: "",
  name: "",
  company: "",
  email: "",
  phone: "",
};

type ChoiceKey = "building" | "stage" | "timeline" | "scale";
type FieldKey = "name" | "company" | "email" | "phone";

type Field = {
  key: FieldKey;
  label: string;
  type: "text" | "email" | "tel";
  required: boolean;
  autoComplete: string;
};

type Step =
  | {
      kind: "choice";
      key: ChoiceKey;
      question: string;
      summary: string;
      options: string[];
      required?: boolean;
      note?: string;
    }
  | {
      kind: "text";
      key: "problem";
      question: string;
      summary: string;
      placeholder: string;
    }
  | {
      kind: "multi";
      key: "needs";
      question: string;
      summary: string;
      options: string[];
      hint: string;
    }
  | {
      kind: "fields";
      question: string;
      fields: Field[];
      description?: string;
    };

/**
 * Eight steps, and the count is printed as `03 / 08` rather than as a bar with
 * no numbers on it: a visitor deciding whether to start deserves to know how
 * long it is before they start, not to discover it.
 *
 * Only four answers are REQUIRED -- what they are building, what problem it
 * solves, a name and an address. Stage, needs, timeline and scale are each
 * useful and none of them is worth losing an inquiry over, which is also why
 * scale offers "Not sure yet" instead of a number: a client who does not yet
 * know their budget is not a client to turn away at question six.
 */
const STEPS: Step[] = [
  {
    kind: "choice",
    key: "building",
    question: "What are you building?",
    summary: "Building",
    required: true,
    options: [
      "Web Application",
      "AI Platform",
      "SaaS Product",
      "Mobile Product",
      "Business Automation",
      "Something Else",
    ],
  },
  {
    kind: "text",
    key: "problem",
    question: "What problem are you trying to solve?",
    summary: "The problem",
    placeholder: "Tell us what you're trying to improve, build or change.",
  },
  {
    kind: "choice",
    key: "stage",
    question: "What stage are you at?",
    summary: "Stage",
    options: [
      "Just an Idea",
      "Planning",
      "Designing",
      "Already Building",
      "Existing Product",
    ],
  },
  {
    kind: "multi",
    key: "needs",
    question: "What do you need from Nivlak?",
    summary: "Needs",
    hint: "Select all that apply.",
    options: [
      "Product Strategy",
      "UX / UI Design",
      "Web Development",
      "AI Integration",
      "Backend / APIs",
      "Mobile Development",
      "Full Product Development",
    ],
  },
  {
    kind: "choice",
    key: "timeline",
    question: "When would you like to start?",
    summary: "Timeline",
    options: [
      "As Soon As Possible",
      "Within 1 Month",
      "1–3 Months",
      "3–6 Months",
      "Just Exploring",
    ],
  },
  {
    kind: "choice",
    key: "scale",
    question: "What is the project scale?",
    summary: "Scale",
    note: "An estimate is enough. Nothing here is a quote.",
    options: [
      "Small Project",
      "Growing Product",
      "Large Platform",
      "Enterprise / Complex System",
      "Not Sure Yet",
    ],
  },
  {
    kind: "fields",
    question: "Who are we speaking with?",
    fields: [
      {
        key: "name",
        label: "Your name",
        type: "text",
        required: true,
        autoComplete: "name",
      },
      {
        key: "company",
        label: "Company / organization",
        type: "text",
        required: false,
        autoComplete: "organization",
      },
    ],
  },
  {
    kind: "fields",
    question: "Where should we contact you?",
    description: "We'll use this only to respond to your project inquiry.",
    fields: [
      {
        key: "email",
        label: "Email",
        type: "email",
        required: true,
        autoComplete: "email",
      },
      {
        key: "phone",
        label: "Phone / WhatsApp",
        type: "tel",
        required: false,
        autoComplete: "tel",
      },
    ],
  },
];

const LAST = STEPS.length - 1;

// The one address the book prints, read from the book rather than typed again
// here -- the fallback below mails a real person, and two copies of an address
// is how one of them goes stale.
const CONTACT = BOOK_PAGES.find((page) => page.contact)?.contact;
const MAIL_TO =
  CONTACT?.rows
    .find((row) => row.href?.startsWith("mailto:"))
    ?.href?.slice("mailto:".length) ?? "nivlak.work@gmail.com";

// -- state ------------------------------------------------------------------

const STORE_KEY = "nivlak.inquiry.v1";

/**
 * Kept for the session and not for ever. A visitor who reloads mid-inquiry
 * should not start again; a visitor who comes back next week should not be
 * handed a half-finished form they have forgotten writing. Every access is
 * guarded: private windows, blocked site data and some embedded webviews throw
 * on the accessor itself rather than returning null.
 */
function load(): { answers: Answers; step: number } | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { answers?: Partial<Answers>; step?: number };
    return {
      answers: { ...EMPTY, ...parsed.answers, needs: parsed.answers?.needs ?? [] },
      step: Math.min(Math.max(parsed.step ?? 0, 0), LAST),
    };
  } catch {
    return null;
  }
}

function save(answers: Answers, step: number) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ answers, step }));
  } catch {
    // Nothing to do and nothing worth telling the visitor: the inquiry still
    // works, it just will not survive a reload.
  }
}

function clear() {
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    // As above.
  }
}

// Deliberately loose. The only thing worth rejecting at the keyboard is an
// address that cannot be one -- no @, no dot after it, whitespace inside.
// Anything stricter rejects real addresses, and the real check is the reply.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(step: Step, answers: Answers): Partial<Record<string, string>> {
  if (step.kind === "choice" && step.required && !answers[step.key]) {
    return { [step.key]: "Choose one to continue." };
  }
  if (step.kind === "text" && !answers.problem.trim()) {
    return { problem: "A sentence is enough — it is what we read first." };
  }
  if (step.kind === "fields") {
    const errors: Record<string, string> = {};
    for (const field of step.fields) {
      const value = answers[field.key].trim();
      if (field.required && !value) errors[field.key] = "This one we need.";
      else if (field.type === "email" && value && !EMAIL.test(value))
        errors[field.key] = "That address looks incomplete.";
    }
    return errors;
  }
  return {};
}

/** The inquiry as a person would read it: for the summary and for the mail. */
function lines(answers: Answers): [string, string][] {
  const out: [string, string][] = [];
  for (const step of STEPS) {
    if (step.kind === "fields") continue;
    const value =
      step.kind === "multi" ? answers.needs.join(", ") : answers[step.key];
    if (value) out.push([step.summary, value]);
  }
  if (answers.name) out.push(["Name", answers.name]);
  if (answers.company) out.push(["Company", answers.company]);
  if (answers.email) out.push(["Email", answers.email]);
  if (answers.phone) out.push(["Phone", answers.phone]);
  return out;
}

function mailHref(answers: Answers) {
  const subject = `Project inquiry — ${answers.name || "Nivlak"}`;
  const body = lines(answers)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
  return `mailto:${MAIL_TO}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

// -- the surface ------------------------------------------------------------

const OPTION_BASE =
  "flex w-full cursor-pointer items-center gap-[1em] border border-white/18 px-[1.15em] py-[0.95em] text-start transition-colors duration-200 hover:border-white/45 hover:bg-white/[0.04] motion-reduce:transition-none";
const OPTION_ON =
  "peer-checked:border-[#dce7f7]/80 peer-checked:bg-[#dce7f7]/[0.09] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#dce7f7]/70";
const FIELD =
  "w-full border border-white/18 bg-transparent px-[0.9em] py-[0.7em] text-[clamp(0.85rem,1.05vw,1rem)] text-slate-100 transition-colors duration-200 outline-none placeholder:text-slate-400/45 focus:border-[#dce7f7]/70 motion-reduce:transition-none";
const LABEL =
  "mb-[0.6em] block text-[clamp(0.52rem,0.72vw,0.64rem)] tracking-[0.3em] text-slate-400/80 uppercase";

export function ProjectInquiry({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ids = useId();

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [sending, setSending] = useState(false);
  // null = still filling it in. Otherwise: was it actually delivered?
  const [sent, setSent] = useState<null | { delivered: boolean }>(null);

  // Restored once, on the client, so the server render and the first client
  // render agree -- reading sessionStorage in the initial state would be a
  // hydration mismatch on every reload that has one.
  useEffect(() => {
    const saved = load();
    if (saved) {
      setAnswers(saved.answers);
      setStep(saved.step);
    }
  }, []);

  useEffect(() => {
    if (!sent) save(answers, step);
  }, [answers, step, sent]);

  // showModal() rather than the `open` attribute: only the method puts the
  // dialog in the top layer, and only the top layer escapes the pinned
  // section's transforms and stacking context.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Reopening after a finished inquiry starts a new one. Not on CLOSE, which
  // would be worse: when the inquiry was not delivered the confirmation is
  // carrying the written mail, and closing it by accident must not throw that
  // away before it has been sent.
  useEffect(() => {
    if (!open || !sent) return;
    setSent(null);
    setAnswers(EMPTY);
    setStep(0);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on opening
  }, [open]);

  // The scrub runs on window scroll, so a wheel over the backdrop would turn
  // pages behind the dialog and leave the reader somewhere else when it
  // closes. Locking the ELEMENT rather than the body keeps the scroll position
  // itself untouched, which is what ScrollTrigger reads on refresh.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  // Escape and the backdrop both close it, and both come through `cancel` or a
  // click on the dialog itself -- the panel inside stops neither, so the test
  // is whether the click landed on the <dialog> box rather than in the panel.
  const close = useCallback(() => {
    setErrors({});
    onClose();
  }, [onClose]);

  // The question, not the close button. showModal() focuses the first
  // focusable descendant of the dialog, and on this panel that is the X --
  // which announces "close" to a screen reader as the first thing a visitor
  // hears after choosing to start a project. Runs on every step change too,
  // which is the standard wizard pattern and the reason there is no aria-live
  // region: moving focus to the new heading announces it once, where a live
  // region wrapping the step would re-read all seven options with it.
  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
  }, [step, open, sent]);

  const current = STEPS[step]!;

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  async function submit() {
    setSending(true);
    try {
      const response = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(answers),
      });
      const data = (await response.json().catch(() => null)) as {
        delivered?: boolean;
      } | null;
      setSent({ delivered: response.ok && data?.delivered === true });
    } catch {
      // A network failure is not a delivered inquiry, and saying so is the
      // whole point of carrying two confirmation screens.
      setSent({ delivered: false });
    } finally {
      setSending(false);
      clear();
    }
  }

  function advance(event: React.FormEvent) {
    event.preventDefault();
    const found = validate(current, answers);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setErrors({});
    if (step === LAST) void submit();
    else setStep(step + 1);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${ids}-title`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
      className="m-0 max-h-none max-w-none border-0 bg-transparent p-0 text-slate-200 backdrop:bg-[#050b14]/92 open:flex open:h-[100dvh] open:w-[100vw] open:items-center open:justify-center sm:open:p-[max(3vh,20px)]"
    >
      {/* The panel. One column, its own scroll, so a long step on a short
          screen scrolls inside the paper rather than moving the book. */}
      <div
        className="flex h-full w-full flex-col overflow-y-auto overscroll-contain border-white/12 bg-[#0d1c30] font-[family-name:var(--font-text)] sm:h-auto sm:max-h-full sm:w-[min(100%,880px)] sm:border"
        style={{ scrollbarWidth: "thin" }}
      >
        {sent ? (
          <Confirmation
            answers={answers}
            delivered={sent.delivered}
            titleId={`${ids}-title`}
            onClose={close}
          />
        ) : (
          <form onSubmit={advance} className="flex min-h-full flex-col" noValidate>
            <header className="flex shrink-0 items-start justify-between gap-[2em] border-b border-white/10 px-[clamp(1.25rem,3.4vw,2.75rem)] py-[clamp(1rem,2.2vh,1.5rem)]">
              <div className="min-w-0">
                <h2
                  id={`${ids}-title`}
                  className="text-[clamp(0.55rem,0.78vw,0.7rem)] tracking-[0.34em] text-slate-400/80 uppercase"
                >
                  Tell us about the project
                </h2>
                {step === 0 ? (
                  <p className="mt-[0.7em] max-w-[46ch] text-[clamp(0.75rem,1.02vw,0.92rem)] leading-relaxed text-slate-300/75">
                    Start with the idea. You don&apos;t need to have everything
                    figured out.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close the project inquiry"
                className="-me-[0.4em] -mt-[0.3em] shrink-0 cursor-pointer p-[0.4em] text-[1.25rem] leading-none text-slate-400/70 transition-colors duration-200 outline-none hover:text-white focus-visible:text-white motion-reduce:transition-none"
              >
                <span aria-hidden>&times;</span>
              </button>
            </header>

            <Progress step={step} />

            <div className="flex-1 px-[clamp(1.25rem,3.4vw,2.75rem)] py-[clamp(1.25rem,3vh,2.25rem)]"
            >
              <h3
                ref={headingRef}
                tabIndex={-1}
                className="font-[family-name:var(--font-display)] text-[clamp(1.45rem,2.9vw,2.35rem)] leading-[1.08] font-light text-balance text-white outline-none"
              >
                {current.question}
              </h3>

              {current.kind === "multi" ? (
                <p className="mt-[0.6em] text-[clamp(0.7rem,0.95vw,0.85rem)] text-slate-400/70">
                  {current.hint}
                </p>
              ) : null}
              {current.kind === "choice" && current.note ? (
                <p className="mt-[0.6em] text-[clamp(0.7rem,0.95vw,0.85rem)] text-slate-400/70">
                  {current.note}
                </p>
              ) : null}
              {current.kind === "fields" && current.description ? (
                <p className="mt-[0.6em] max-w-[44ch] text-[clamp(0.7rem,0.95vw,0.85rem)] leading-relaxed text-slate-400/70">
                  {current.description}
                </p>
              ) : null}

              <div className="mt-[clamp(1.1rem,2.4vh,1.8rem)]">
                {current.kind === "choice" ? (
                  <Options
                    name={`${ids}-${current.key}`}
                    options={current.options}
                    selected={[answers[current.key]]}
                    type="radio"
                    onPick={(option) => set(current.key, option)}
                  />
                ) : null}

                {current.kind === "multi" ? (
                  <Options
                    name={`${ids}-needs`}
                    options={current.options}
                    selected={answers.needs}
                    type="checkbox"
                    onPick={(option) =>
                      set(
                        "needs",
                        answers.needs.includes(option)
                          ? answers.needs.filter((item) => item !== option)
                          : [...answers.needs, option],
                      )
                    }
                  />
                ) : null}

                {current.kind === "text" ? (
                  <>
                    <label className="sr-only" htmlFor={`${ids}-problem`}>
                      {current.question}
                    </label>
                    <textarea
                      id={`${ids}-problem`}
                      value={answers.problem}
                      onChange={(event) => set("problem", event.target.value)}
                      placeholder={current.placeholder}
                      rows={6}
                      aria-invalid={errors.problem ? true : undefined}
                      className={`${FIELD} min-h-[9em] resize-y leading-relaxed`}
                    />
                    <Error message={errors.problem} />
                  </>
                ) : null}

                {current.kind === "fields" ? (
                  <div className="grid gap-[clamp(1rem,2.2vh,1.5rem)] sm:grid-cols-2">
                    {current.fields.map((field) => (
                      <div key={field.key}>
                        <label className={LABEL} htmlFor={`${ids}-${field.key}`}>
                          {field.label}
                          {field.required ? null : (
                            <span className="ms-[0.8em] tracking-[0.18em] text-slate-500/70 normal-case">
                              optional
                            </span>
                          )}
                        </label>
                        <input
                          id={`${ids}-${field.key}`}
                          type={field.type}
                          value={answers[field.key]}
                          autoComplete={field.autoComplete}
                          required={field.required}
                          aria-invalid={errors[field.key] ? true : undefined}
                          onChange={(event) => set(field.key, event.target.value)}
                          className={FIELD}
                        />
                        <Error message={errors[field.key]} />
                      </div>
                    ))}
                  </div>
                ) : null}

                {current.kind === "choice" ? (
                  <Error message={errors[current.key]} />
                ) : null}
              </div>
            </div>

            {/* CONTINUE is the filled panel and BACK is a quiet line, which is
                the hierarchy the whole flow depends on: at a glance there is
                one thing to do. */}
            <footer className="sticky bottom-0 flex shrink-0 items-center justify-between gap-[1.5em] border-t border-white/10 bg-[#0d1c30] px-[clamp(1.25rem,3.4vw,2.75rem)] py-[clamp(0.9rem,2vh,1.4rem)]">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setErrors({});
                    setStep(step - 1);
                  }}
                  className="cursor-pointer text-[clamp(0.56rem,0.78vw,0.68rem)] tracking-[0.3em] text-slate-400/70 uppercase transition-colors duration-200 outline-none hover:text-slate-200 focus-visible:text-white motion-reduce:transition-none"
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={sending}
                className="group inline-flex cursor-pointer items-center gap-[0.9em] bg-[#dce7f7] px-[clamp(1.2rem,2.6vw,2rem)] py-[clamp(0.75rem,1.7vh,1.05rem)] text-[clamp(0.58rem,0.82vw,0.72rem)] font-medium tracking-[0.28em] text-[#0b1728] uppercase transition-opacity duration-200 outline-none hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dce7f7] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
              >
                {step === LAST ? (sending ? "Sending" : "Send inquiry") : "Continue"}
                <span
                  aria-hidden
                  className="text-[1.15em] transition-transform duration-200 group-hover:translate-x-[0.2em] motion-reduce:transition-none"
                >
                  &rarr;
                </span>
              </button>
            </footer>
          </form>
        )}
      </div>
    </dialog>
  );
}

/**
 * `03 / 08` over a hairline. The numerals are the part that matters -- a bar
 * on its own says "some of the way" and a visitor deciding whether to go on
 * wants to know how many are left, not what fraction is done.
 */
function Progress({ step }: { step: number }) {
  return (
    <div className="shrink-0 px-[clamp(1.25rem,3.4vw,2.75rem)] pt-[clamp(0.9rem,2vh,1.3rem)]">
      <p
        className="mb-[0.7em] text-[clamp(0.52rem,0.72vw,0.62rem)] tracking-[0.3em] text-slate-400/60 tabular-nums"
        aria-label={`Step ${step + 1} of ${STEPS.length}`}
      >
        <span aria-hidden>
          {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
        </span>
      </p>
      <div aria-hidden className="h-px w-full bg-white/12">
        <div
          className="h-px bg-[#dce7f7]/70 transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Real radios and checkboxes with the control itself off-screen, not buttons
 * with `aria-checked` hand-written on them. The browser then gives arrow-key
 * movement within the group, the roving tab stop, the form association and
 * the announcement for nothing. What the brief asks to avoid is a TINY radio,
 * and the target here is the whole row.
 */
function Options({
  name,
  options,
  selected,
  type,
  onPick,
}: {
  name: string;
  options: string[];
  selected: string[];
  type: "radio" | "checkbox";
  onPick: (option: string) => void;
}) {
  return (
    <div className="grid gap-[0.6em] sm:grid-cols-2">
      {options.map((option, i) => {
        const on = selected.includes(option);
        return (
          <label key={option} className={`${OPTION_BASE} group relative`}>
            <input
              type={type}
              name={name}
              value={option}
              checked={on}
              onChange={() => onPick(option)}
              className="peer sr-only"
            />
            {/* The mark. A filled square rather than a tick, because the book
                rules and numbers everything and has no tick in it. */}
            <span
              aria-hidden
              className={`grid size-[0.95em] shrink-0 place-items-center border transition-colors duration-200 motion-reduce:transition-none ${
                on ? "border-[#dce7f7] bg-[#dce7f7]" : "border-white/30"
              }`}
            />
            <span className="min-w-0 flex-1 text-[clamp(0.66rem,0.9vw,0.8rem)] leading-snug tracking-[0.16em] text-slate-200 uppercase">
              {option}
            </span>
            <span
              aria-hidden
              className="shrink-0 text-[clamp(0.5rem,0.66vw,0.58rem)] tracking-[0.2em] text-slate-500/60 tabular-nums"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            {/* peer-checked cannot reach a parent, so the selected state is
                painted by an overlay that CAN be a sibling of the input. */}
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-0 border border-transparent ${OPTION_ON}`}
            />
          </label>
        );
      })}
    </div>
  );
}

function Error({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-[0.7em] text-[clamp(0.68rem,0.9vw,0.8rem)] text-[#e6b3ac]">
      {message}
    </p>
  );
}

/**
 * Two confirmations, and which one shows is a fact about what happened rather
 * than a mood. If the route handler reported the inquiry delivered, this says
 * so. If it did not -- no delivery configured on the deployment, or the
 * request never landed -- it says THAT, and hands over a mail already written,
 * because telling somebody their inquiry is on its way when it is sitting in a
 * dead POST is the one failure this flow must not have.
 */
function Confirmation({
  answers,
  delivered,
  titleId,
  onClose,
}: {
  answers: Answers;
  delivered: boolean;
  titleId: string;
  onClose: () => void;
}) {
  const summary = lines(answers);
  const heading = useRef<HTMLHeadingElement>(null);
  // The form has just unmounted from under the visitor's focus, which would
  // otherwise land on <body> and leave a screen reader with nothing to read.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div className="flex min-h-full flex-col px-[clamp(1.25rem,3.4vw,2.75rem)] py-[clamp(1.5rem,4vh,3rem)]">
      <p className="text-[clamp(0.55rem,0.78vw,0.7rem)] tracking-[0.34em] text-slate-400/80 uppercase">
        {delivered ? "Inquiry received" : "Not sent yet"}
      </p>
      <h2
        ref={heading}
        id={titleId}
        tabIndex={-1}
        className="mt-[0.5em] font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.2vw,2.6rem)] leading-[1.06] font-light text-white outline-none"
      >
        {delivered ? "We've got the idea." : "One step left."}
      </h2>
      <p className="mt-[0.9em] max-w-[52ch] text-[clamp(0.78rem,1.05vw,0.95rem)] leading-relaxed text-slate-300/80">
        {delivered
          ? "Thanks for telling us about your project. We'll review the details and get back to you through the contact information you provided."
          : "Your answers are below, already written into an email. Send it and it reaches us the same way — nothing has been submitted from this page."}
      </p>

      {!delivered ? (
        <a
          href={mailHref(answers)}
          className="group mt-[1.6em] inline-flex w-fit items-center gap-[0.9em] bg-[#dce7f7] px-[clamp(1.2rem,2.6vw,2rem)] py-[clamp(0.75rem,1.7vh,1.05rem)] text-[clamp(0.58rem,0.82vw,0.72rem)] font-medium tracking-[0.28em] text-[#0b1728] uppercase transition-opacity duration-200 outline-none hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dce7f7] motion-reduce:transition-none"
        >
          Send by email
          <span
            aria-hidden
            className="text-[1.15em] transition-transform duration-200 group-hover:translate-x-[0.2em] motion-reduce:transition-none"
          >
            &rarr;
          </span>
        </a>
      ) : null}

      <dl className="mt-[2em] grid grid-cols-[minmax(0,10em)_1fr] gap-x-[1.5em] border-t border-white/10">
        {summary.map(([label, value]) => (
          <div key={label} className="col-span-2 grid grid-cols-subgrid border-b border-white/8 py-[0.85em]">
            <dt className="text-[clamp(0.5rem,0.68vw,0.6rem)] tracking-[0.28em] text-slate-400/70 uppercase">
              {label}
            </dt>
            <dd className="min-w-0 text-[clamp(0.72rem,0.98vw,0.88rem)] leading-relaxed break-words text-slate-200">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={onClose}
        className="group mt-auto inline-flex w-fit items-center gap-[0.8em] self-start border-b border-white/25 pt-[2em] pb-[0.4em] text-[clamp(0.56rem,0.78vw,0.68rem)] tracking-[0.3em] text-slate-200 uppercase transition-colors duration-200 outline-none hover:border-white/60 hover:text-white focus-visible:border-white focus-visible:text-white motion-reduce:transition-none"
      >
        Back to Nivlak
        <span
          aria-hidden
          className="transition-transform duration-200 group-hover:translate-x-[0.2em] motion-reduce:transition-none"
        >
          &rarr;
        </span>
      </button>
    </div>
  );
}
