"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Question = { id: string; q: string };

const LONG_IDS = new Set(["method"]);

export default function AccessTestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [passed, setPassed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/access-test");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "টেস্ট লোড করা যায়নি");
        if (cancelled) return;
        setNotice(data.notice || "");
        setQuestions(Array.isArray(data.questions) ? data.questions : []);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "টেস্ট লোড করা যায়নি"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setFailedIds((prev) => prev.filter((item) => item !== id));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    setFailedIds([]);
    try {
      const res = await fetch("/api/access-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "জমা দিতে সমস্যা হয়েছে");

      if (data.passed) {
        setPassed(true);
        toast.success("টেস্ট পাস — অ্যাক্সেস পেয়ে গেছেন!");
        setTimeout(() => {
          router.replace("/dashboard");
          router.refresh();
        }, 1500);
        return;
      }

      setAttempts(data.attempts ?? 0);
      setFailedIds(Array.isArray(data.failed) ? data.failed : []);
      setFormError("কিছু উত্তর ভুল হয়েছে — লাল চিহ্নিত প্রশ্নগুলো দেখে আবার চেষ্টা করুন।");
      toast.error("কিছু উত্তর ভুল হয়েছে — আবার চেষ্টা করুন।");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "কিছু একটা সমস্যা হয়েছে"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.585_0.163_237.323/0.12),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,oklch(0.55_0.2_277/0.10),transparent_55%)]" />
      <div className="hero-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_65%)]" />
      <div className="relative w-full max-w-xl">
        <div className="mb-6 flex justify-center">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-lg sm:p-7">
          <div className="bg-brand-gradient absolute inset-x-0 top-0 h-1" />
          {children}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">টেস্ট লোড হচ্ছে...</p>
      </div>
    );
  }

  if (passed) {
    return shell(
      <div className="space-y-4 py-6 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">
            টেস্ট পাস — অ্যাক্সেস পেয়ে গেছেন!
          </h1>
          <p className="text-sm text-muted-foreground">
            আপনার ড্যাশবোর্ড আনলক হয়ে গেছে। রিডাইরেক্ট হচ্ছে...
          </p>
        </div>
        <Button render={<Link href="/dashboard" />}>ড্যাশবোর্ডে যান</Button>
      </div>
    );
  }

  return shell(
    <div className="space-y-5">
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          অ্যাক্সেস টেস্ট
        </h1>
        <p className="text-sm text-muted-foreground">
          নতুন জনের স্ক্রিনিং — ভিডিও দেখেছেন কিনা সেটা বোঝার জন্য ৫টি প্রশ্ন।
          একবার পাস করলে আবার দিতে হবে না।
        </p>
      </div>

      {notice && (
        <div className="rounded-xl border border-amber-500/60 bg-amber-500/15 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-4 shrink-0" />
            <span>স্ক্রিনিং টেস্ট — গুরুত্বপূর্ণ নিয়ম</span>
          </div>
          <div className="space-y-2 text-[13px] leading-relaxed text-amber-900/90 dark:text-amber-100/90">
            {notice.split("\n\n").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {questions.map((question, index) => {
          const isFailed = failedIds.includes(question.id);
          return (
            <div key={question.id} className="space-y-1.5">
              <Label htmlFor={question.id} className="flex items-center gap-1.5">
                <span>
                  {index + 1}. {question.q}
                </span>
                {isFailed && (
                  <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">
                    ভুল
                  </span>
                )}
              </Label>
              {LONG_IDS.has(question.id) ? (
                <Textarea
                  id={question.id}
                  rows={3}
                  placeholder="বুঝিয়ে বলুন..."
                  className={
                    isFailed ? "border-destructive focus-visible:border-destructive" : undefined
                  }
                  value={answers[question.id] ?? ""}
                  onChange={(event) => updateAnswer(question.id, event.target.value)}
                  required
                />
              ) : (
                <Input
                  id={question.id}
                  placeholder="আপনার উত্তর লিখুন..."
                  className={
                    isFailed ? "border-destructive focus-visible:border-destructive" : undefined
                  }
                  value={answers[question.id] ?? ""}
                  onChange={(event) => updateAnswer(question.id, event.target.value)}
                  required
                />
              )}
            </div>
          );
        })}

        {attempts > 0 && (
          <p className="text-xs text-muted-foreground">
            চেষ্টা: {attempts}
          </p>
        )}

        {formError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive">
            {formError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              AI দিয়ে চেক হচ্ছে...
            </>
          ) : (
            <>
              <Send className="size-4" />
              উত্তর জমা দিন
            </>
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          উত্তর AI দিয়ে চেক করা হবে — অর্থ মিললেই পাস (বাংলা / বাংলিশ /
          ইংরেজি — যেকোনো ভাষায় লিখুন)।
        </p>
      </form>
    </div>
  );
}
