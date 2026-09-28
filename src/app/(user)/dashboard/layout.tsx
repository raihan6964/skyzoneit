import { UserShell } from "@/components/user/user-shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <UserShell>{children}</UserShell>;
}
