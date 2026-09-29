import { requireUser, unwrap, withApi } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { gradeAccessTest } from "@/lib/groq";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessTestSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

type AccessTestConfig = {
  notice: string;
  questions: { id: string; q: string }[];
  correct: Record<string, string>;
};

async function loadConfig(): Promise<AccessTestConfig> {
  const admin = createAdminClient();
  const row = unwrap<{ value: AccessTestConfig }>(
    await admin
      .from("app_settings")
      .select("value")
      .eq("key", "access_test")
      .single()
  );
  if (
    !row.value ||
    !Array.isArray(row.value.questions) ||
    !row.value.questions.length ||
    !row.value.correct
  ) {
    throw new ApiError("Access test is not configured", 503);
  }
  return row.value;
}

export async function GET() {
  return withApi(async () => {
    await requireUser({ allowUnverified: true });
    const config = await loadConfig();
    return Response.json({
      notice: config.notice,
      questions: config.questions,
    });
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const { profile } = await requireUser({ allowUnverified: true });

    if (profile.access_test_passed) {
      return Response.json({ passed: true, already: true });
    }

    const body = await request.json().catch(() => null);
    const parsed = accessTestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        parsed.error.issues[0]?.message ?? "Invalid input",
        400
      );
    }

    const config = await loadConfig();
    const grade = await gradeAccessTest(config.correct, parsed.data.answers);

    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({
        access_test_passed: grade.pass,
        access_test_attempts: profile.access_test_attempts + 1,
      })
      .eq("id", profile.id);
    if (error) throw new ApiError(error.message, 400);

    return Response.json({
      passed: grade.pass,
      attempts: profile.access_test_attempts + 1,
    });
  });
}
