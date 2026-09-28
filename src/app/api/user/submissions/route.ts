import type { NextRequest } from "next/server";
import { withApi, requireUser, unwrap } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { uploadImageToImgbb } from "@/lib/imgbb";
import { submissionSchema } from "@/lib/validations";
import type { Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function GET(request: NextRequest) {
  return withApi(async () => {
    const { supabase } = await requireUser();
    const status = request.nextUrl.searchParams.get("status");

    let query = supabase
      .from("submissions")
      .select("*, task:tasks(app_name, banner_url, platform)")
      .order("submitted_at", { ascending: false })
      .limit(200);

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return Response.json({ submissions: data ?? [] });
  });
}

export async function POST(request: NextRequest) {
  return withApi(async () => {
    const { supabase, profile } = await requireUser();

    const body = await request.json();
    const parsed = submissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const task_id = typeof body.task_id === "string" ? body.task_id : "";
    if (!task_id) throw new ApiError("task_id is required");

    const imageBase64 =
      typeof body.image_base64 === "string" ? body.image_base64.trim() : "";
    if (!imageBase64) throw new ApiError("Review screenshot is required");

    const byteLength = Math.floor((imageBase64.length * 3) / 4);
    if (byteLength > MAX_IMAGE_BYTES) {
      throw new ApiError("Screenshot must be smaller than 5MB");
    }

    const screenshotUrl = await uploadImageToImgbb(
      imageBase64,
      `review-${profile.sky_id}-${Date.now()}`
    );

    const submission = unwrap(
      await supabase.rpc("create_submission", {
        p_task_id: task_id,
        p_reviewer_name: parsed.data.reviewer_name,
        p_reviewer_gmail: parsed.data.reviewer_gmail,
        p_screenshot_url: screenshotUrl,
      })
    );

    return Response.json({ submission: submission as Submission }, { status: 201 });
  });
}
