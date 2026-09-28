import type { Platform } from "@/lib/types";

export interface PackageInfo {
  package_name: string;
  platform: Platform;
}

const ANDROID_ID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
const IOS_ID = /^id\d+$/;

export function extractPackageInfo(input: string): PackageInfo | null {
  const value = input.trim();
  if (!value) return null;

  let match = value.match(/play\.google\.com\/store\/apps\/details\?[^#]*\bid=([a-zA-Z0-9._]+)/);
  if (match) return { package_name: match[1], platform: "android" };

  match = value.match(/[?&]id=([a-zA-Z0-9._]+)/);
  if (match && value.includes("play.google.com"))
    return { package_name: match[1], platform: "android" };

  match = value.match(/apps\.apple\.com\/[^/]+\/[^/]*?\/?id(\d+)/);
  if (match) return { package_name: `id${match[1]}`, platform: "ios" };

  if (ANDROID_ID.test(value)) return { package_name: value, platform: "android" };
  if (IOS_ID.test(value)) return { package_name: value, platform: "ios" };

  return null;
}
