import { withApi, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/error";
import { uploadImageToImgbb } from "@/lib/imgbb";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  return withApi(async () => {
    await requireUser();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiError("No file provided");
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new ApiError("Only JPG, PNG, WEBP or GIF images are allowed");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new ApiError("Image must be smaller than 5MB");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const url = await uploadImageToImgbb(
      base64,
      file.name?.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 50) || "upload"
    );

    return Response.json({ url });
  });
}
