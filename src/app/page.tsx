import Link from "next/link";
import {
  BadgeCheck,
  Banknote,
  Bot,
  CalendarClock,
  ClipboardCheck,
  CloudUpload,
  Search,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Daily review tasks",
    description:
      "Grab active app tasks, submit your review with a screenshot and track everything live from your phone.",
  },
  {
    icon: BadgeCheck,
    title: "Automatic verification",
    description:
      "Our scraper checks the Play Store / App Store the next day at your task's scheduled time and approves published reviews.",
  },
  {
    icon: Banknote,
    title: "Instant bKash withdrawal",
    description:
      "Balance is credited per approved review. Withdraw anytime with a minimum of only 50 TK straight to bKash.",
  },
  {
    icon: Bot,
    title: "AI review writer",
    description:
      "Stuck on words? Generate a unique, natural review with one click — copy it, and it clears instantly so it is never reused.",
  },
  {
    icon: CalendarClock,
    title: "Smart scheduling",
    description:
      "Admins set daily global limits and approval start times per app. Reviews are auto-approved in the background.",
  },
  {
    icon: Users,
    title: "Real-time CRM",
    description:
      "Admins manage users, submissions and withdrawals from one live dashboard with bulk actions and Sheets sync.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Sign up & get your Sky ID",
    description:
      "Create your account and instantly receive a unique sky-XXXX worker ID.",
  },
  {
    step: "02",
    title: "Complete app tasks",
    description:
      "Open the app from the store link, publish your review, then submit your name, Gmail and screenshot.",
  },
  {
    step: "03",
    title: "Get paid via bKash",
    description:
      "Reviews are verified automatically the next day. Approved reviews credit your balance — withdraw from 50 TK.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" render={<Link href="/login" />}>
              Log in
            </Button>
            <Button size="sm" render={<Link href="/signup" />}>
              Create account
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.585_0.163_237.323/0.14),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.55_0.2_277/0.11),transparent_55%)]" />
          <div className="hero-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_70%)]" />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="size-3.5" />
                Bangladesh&apos;s review task platform
              </span>
              <h1 className="mt-5 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                Get paid for every{" "}
                <span className="text-gradient-brand">app review</span> you
                publish
              </h1>
              <p className="mt-4 text-balance text-base text-muted-foreground sm:text-lg">
                Skyzone IT connects workers with app review tasks — submit a
                review, let our automated verifier confirm it on the store, and
                withdraw your earnings to bKash.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button size="lg" className="w-full sm:w-auto" render={<Link href="/signup" />}>
                  Start earning
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto"
                  render={<Link href="/login" />}
                >
                  I already have an account
                </Button>
              </div>
              <dl className="mt-10 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border bg-card p-4">
                  <dt className="text-xs text-muted-foreground">
                    Reward per review
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-primary">
                    Paid in TK
                  </dd>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <dt className="text-xs text-muted-foreground">
                    Minimum withdrawal
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-primary">
                    50 TK
                  </dd>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <dt className="text-xs text-muted-foreground">Payout method</dt>
                  <dd className="mt-1 text-lg font-semibold text-primary">
                    bKash
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Everything you need to earn
            </h2>
            <p className="mt-2 text-muted-foreground">
              A complete platform for workers and administrators.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-medium">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                How it works
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {STEPS.map((item) => (
                <div key={item.step} className="rounded-2xl border bg-card p-5 shadow-sm">
                  <span className="text-xl font-extrabold text-gradient-brand">
                    {item.step}
                  </span>
                  <h3 className="mt-2 font-medium">{item.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <div className="bg-brand-gradient relative overflow-hidden rounded-2xl px-6 py-12 text-center text-white shadow-[0_20px_50px_-20px_oklch(0.55_0.2_277_/_0.6)] sm:px-10">
            <div className="hero-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <CloudUpload className="relative mx-auto size-8 opacity-90" />
            <h2 className="relative mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to start earning?
            </h2>
            <p className="relative mx-auto mt-2 max-w-xl text-sm text-white/85 sm:text-base">
              Create your account today and get your unique Sky ID instantly.
              Works perfectly on mobile.
            </p>
            <div className="relative mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto" render={<Link href="/signup" />}>
                Create free account
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo className="h-5" />
          <p className="flex items-center gap-1.5">
            <Smartphone className="size-4" />
            <Search className="hidden size-4 sm:block" />
            Built for mobile-first workers © {new Date().getFullYear()} Skyzone IT
          </p>
        </div>
      </footer>
    </div>
  );
}
