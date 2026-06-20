import { AdminDashboard } from "./admin-dashboard";

// Thin server entry — the layout already enforced platform-admin
// access. The dashboard is a client component that loads companies
// and plans from /api/admin/* so there's a single data source.
export default function AdminPage() {
  return <AdminDashboard />;
}
