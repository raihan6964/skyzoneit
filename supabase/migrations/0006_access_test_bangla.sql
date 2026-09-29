-- Access test text in Bangla (notice + questions).
-- Grading reference accepts answers in Bangla, Banglish or English.

insert into public.app_settings (key, value)
values (
  'access_test',
  '{
    "notice": "এই প্রশ্নের উত্তর ভিডিওতে সরাসরি শব্দে শব্দে বলা হয়নি, কিন্তু ভিডিওতে বুঝিয়ে দেওয়া হয়েছে। তাই আপনি যা বুঝতে পারেন তার ভিত্তিতে উত্তর দিন।\n\nকিন্তু কোনোভাবেই গ্রুপের কেউ থেকে উত্তর জিজ্ঞেস করবেন না। যদি কেউকে ডিস্টার্ব করেন, উত্তর জিজ্ঞেস করেন, বা চিটিং করে উত্তর জানার চেষ্টা করেন — তাহলে গ্রুপ থেকে ব্যান করা হবে এবং কাজও দেওয়া হবে না।\n\nমনে রাখবেন: আপনি চাইলে কারো কাছে কাজটা একটু বুঝে নিতে পারেন, কিন্তু সরাসরি উত্তর জিজ্ঞেস করা যাবে না।",
    "questions": [
      { "id": "watched", "q": "আপনি কি ভিডিওটা মনোযোগ দিয়ে দেখেছেন?" },
      { "id": "part2", "q": "ভিডিওতে দেখানো দ্বিতীয় পার্টের নাম কি?" },
      { "id": "parts", "q": "ভিডিও মোট কয়টা পার্টের কথা বলা হয়েছে?" },
      { "id": "method", "q": "গেট ফ্রি রিভিউ মেথডটা কী — বুঝিয়ে বলুন।" },
      { "id": "min_withdraw", "q": "ওয়েবসাইটের ন্যূনতম উইথড্রয়াল কত টাকা?" }
    ],
    "correct": {
      "watched": "Must be a clear YES that they watched the video. Accept any affirmative in any language: হ্যাঁ, ha, ha ji, ji, he, hea, yes, দেখেছি, dekhechi, watched, etc. Maybe or unclear answers fail.",
      "part2": "Account creation. Accept any language or wording meaning the same: অ্যাকাউন্ট তৈরি, account creation, account create, account toiri, signup, sign up, register, রেজিস্টার, অ্যাকাউন্ট বানানো.",
      "parts": "3 parts. Accept: 3, ৩, three, tin, tinta, 3 ta, ৩টা.",
      "method": "Facebook group e post/marketing kore, shekhan theke manusher ke inbox/chat e niye, tai der kache review niye, tarpor oi review gulo website e submit kora. Key points: (a) Facebook or group e marketing/post (b) inbox/chat e niye jawa (c) manush theke review newa (d) website e submit kora. Same in Bangla: ফেসবুক গ্রুপে পোস্ট/মার্কেটিং করে, মানুষদের ইনবক্সে নিয়ে, তাদের কাছ থেকে রিভিউ নিয়ে, ওয়েবসাইটে সাবমিট করা। A casual answer in Bangla, Banglish or English substantially covering these points must pass.",
      "min_withdraw": "50 TK. Accept: 50, ৫০, 50 taka, ৫০ টাকা, 50tk, 50 tk, fifty."
    }
  }'::jsonb
)
on conflict (key) do update set value = excluded.value;
