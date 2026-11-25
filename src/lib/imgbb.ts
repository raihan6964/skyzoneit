import { ApiError } from "@/lib/error";

export async function uploadImageToImgbb(
  base64: string,
  name?: string
): Promise<string> {
  const key = process.env.IMGBB_API_KEY;
  if (!key) {
    throw new ApiError(
      "Image upload is not configured (missing IMGBB_API_KEY)",
      503
    );
  }

  const form = new FormData();
  form.append("image", base64);
  if (name) form.append("name", name);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[imgbb] upload rejected:",
      response.status,
      detail.slice(0, 500)
    );
    throw new ApiError("Image upload failed", 502);
  }

  const json = (await response.json()) as {
    data?: { display_url?: string; url?: string };
  };
  const url = json.data?.display_url || json.data?.url;
  if (!url) {
    console.error("[imgbb] upload returned no URL:", JSON.stringify(json).slice(0, 500));
    throw new ApiError("Image upload failed", 502);
  }
  return url;
}
