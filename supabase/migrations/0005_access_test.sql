-- ============================================================================
-- Access test: 5-question screening for new users, graded by AI (Groq).
-- Users who never pass cannot reach the dashboard / any user API.
-- ============================================================================

alter table public.profiles
  add column if not exists access_test_passed   boolean not null default false,
  add column if not exists access_test_attempts integer not null default 0;

-- Users who signed up before this test existed keep their access.
update public.profiles set access_test_passed = true where not access_test_passed;

insert into public.app_settings (key, value)
values (
  'access_test',
  '{
    "notice": "Ei question er answer video te direct word-to-word bola hoyni, kintu video te bojhaiya deya hoyeche. Tai apni ja bujhte parsen tar basis e answer din.\n\nKintu kono vabei group er keo theke answer jigges korben na. Jodi keo ke disturb koren, ba answer jigges kore, ba cheating kore answer janar chesta koren, tahole group theke banned kora hobe ar kaj o deya hobe na.\n\nMone rakhben: apni chaile karor kache kaj ta ektu bojhe nite parben, but direct answer jigges kora jabe na.",
    "questions": [
      { "id": "watched", "q": "Apni ki video ta monojog diye dekhechen?" },
      { "id": "part2", "q": "Video te dekhano second part er nam ki?" },
      { "id": "parts", "q": "Video total koita part er kotha bola hoise?" },
      { "id": "method", "q": "Get free review method ta ki, bojhaiya koren." },
      { "id": "min_withdraw", "q": "Website er minimum withdrawal koto TK?" }
    ],
    "correct": {
      "watched": "The user must clearly say YES that they watched the video. Any affirmative counts (hea, ha, ha ji, ji, yes, dekhechi, etc).",
      "part2": "Account creation. Accept any wording meaning the same: account creation, account create, account toiri, signup, sign up, register, account banano.",
      "parts": "3 parts. Accept: 3, three, tin.",
      "method": "Facebook group e post/marketing kore, shekhan theke manusher ke inbox/chat e niye, tai der kache review niye, tarpor oi review gulo website e submit kora. Key points: (a) Facebook or group e marketing/post (b) inbox/chat e niye jawa (c) manush theke review newa (d) website e submit kora. A casual answer substantially covering these points must pass.",
      "min_withdraw": "50 TK. Accept: 50, 50 taka, 50tk, 50 tk."
    }
  }'::jsonb
)
on conflict (key) do update set value = excluded.value;

-- Correct answers must not be readable by regular/authenticated users.
drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings
  for select to authenticated
  using (public.is_admin() or key <> 'access_test');
