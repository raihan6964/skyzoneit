import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Vercel's Supabase integration may inject SUPABASE_URL / SUPABASE_ANON_KEY
    // (or the new publishable/secret key names) instead of the NEXT_PUBLIC_*
    // names. Normalize everything here so the browser bundle always gets the
    // right value at build time.
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      "",
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SERVICE_ROLE_KEY ||
      "",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "i.imgur.com" },
      { protocol: "https", hostname: "play-lh.googleusercontent.com" },
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
    ],
  },
};

export default nextConfig;
