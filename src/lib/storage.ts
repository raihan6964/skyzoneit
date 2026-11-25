import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/error";
import { uploadImageToImgbb } from "@/lib/imgbb";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "screenshots";

function cleanBase64(input: string): string {
  // Accept both raw base64 and data URLs (data:image/jpeg;base64,....).
  const value = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const cleaned = value.trim().replace(/\s/g, "");
  if (!cleaned) throw new ApiError("Screenshot is empty");
  return cleaned;
}

function toBytes(value: string): Uint8Array {
  const buffer = Buffer.from(value, "base64");
  if (!buffer.length) throw new ApiError("Invalid screenshot data");
  return new Uint8Array(buffer);
}

function contentTypeOf(bytes: Uint8Array): { mime: string; ext: string } {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { mime: "image/png", ext: "png" };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { mime: "image/gif", ext: "gif" };
  }
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return { mime: "image/jpeg", ext: "jpg" };
}

/**
 * Store an image in Supabase Storage (public `screenshots` bucket) and return
 * its public URL. Falls back to imgBB if Supabase Storage is unavailable, so
 * existing deployments keep working without an immediate migration.
 */
export async function uploadImage(
  base64: string,
  name?: string
): Promise<string> {
  const encoded = cleanBase64(base64);
  const bytes = toBytes(encoded);
  const { mime, ext } = contentTypeOf(bytes);
  const safeName =
    (name ?? "upload").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 50) || "upload";
  const path = `${safeName}-${randomUUID()}.${ext}`;

  try {
    const supabase = createAdminClient();

    // Create the bucket on first use if it doesn't exist yet. Service role
    // bypasses RLS, so no extra policy is required for the upload itself.
    const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "10MB",
    });
    if (bucketError && !/already exists|duplicate/i.test(bucketError.message)) {
      console.warn("[storage] ensure bucket:", bucketError.message);
    }

    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;

    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (error) {
    console.error("[storage] Supabase upload failed:", error);
  }

  // Fallback: keep the previous provider as a safety net.
  if (process.env.IMGBB_API_KEY) {
    try {
      return await uploadImageToImgbb(encoded, safeName);
    } catch (error) {
      console.error("[storage] imgBB fallback failed:", error);
    }
  }

  throw new ApiError("Image upload failed — please try again", 502);
}
