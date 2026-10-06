import { redirect } from "next/navigation";

// Legacy My Courses dashboard retired in Phase E — home is now the Palace Overview.
export default function DashboardRedirect() {
  redirect("/home");
}
