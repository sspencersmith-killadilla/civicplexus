import {
  LayoutDashboard, Users, ListChecks, Briefcase, FileText, FileSignature, FolderLock,
  Server, Bell, BarChart3, Package, GraduationCap, ShieldQuestion, HeartHandshake,
  ScrollText, DoorOpen, Settings, History, BookOpen, UserPlus, ClipboardList,
  MessagesSquare, Target, Megaphone, ClipboardCheck, ShieldAlert, BriefcaseBusiness,
  CheckSquare, Compass, CalendarDays, FileSignature as PafIcon, User as MeIcon,
  DollarSign, Scale, BarChart2, FileStack, Banknote, DatabaseBackup, Landmark,
  ShieldCheck, BadgeCheck, ToggleLeft, UserCog, Network,
  Clock,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/hooks/use-current-user";

export type FeatureDef = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
  /** stable key used in module_settings */
  key: string;
};

export type ModuleDef = {
  key: string;
  label: string;
  items: FeatureDef[];
};

const featureKey = (to: string) => `feature.${to}`;
const moduleKey = (slug: string) => `module.${slug}`;

const def = (
  to: string,
  label: string,
  icon: LucideIcon,
  roles: AppRole[],
): FeatureDef => ({ to, label, icon, roles, key: featureKey(to) });

export const MODULE_REGISTRY: ModuleDef[] = [
  { key: moduleKey("overview"), label: "Overview", items: [
    def("/dashboard", "Dashboard", LayoutDashboard, ["hr_admin", "hiring_manager", "it_admin", "employee", "candidate"]),
    def("/my-hr", "My HR", MeIcon, ["hr_admin", "hiring_manager", "it_admin", "employee", "candidate", "supervisor"]),
    def("/notifications", "Notifications", Bell, ["hr_admin", "hiring_manager", "it_admin", "employee", "candidate"]),
    def("/preboarding", "My Onboarding", FileText, ["candidate", "employee"]),
    def("/help", "Help & Docs", BookOpen, ["hr_admin", "hiring_manager", "it_admin", "employee", "candidate"]),
  ]},
  { key: moduleKey("time-leave"), label: "Time & Leave", items: [
    def("/timekeeping", "Time Clock", Clock, ["hr_admin", "hiring_manager", "supervisor", "employee"]),
    def("/shift-patterns", "Shift Patterns", CalendarDays, ["hr_admin"]),
    def("/leave", "Leave Requests", CalendarDays, ["hr_admin", "hiring_manager", "supervisor", "employee"]),
    def("/paf", "Personnel Actions", PafIcon, ["hr_admin", "hiring_manager", "supervisor"]),
  ]},
  { key: moduleKey("people"), label: "People", items: [
    def("/employees", "Employees", Users, ["hr_admin", "hiring_manager"]),
    def("/positions", "Positions", ClipboardList, ["hr_admin", "hiring_manager", "supervisor"]),
    def("/hire-requests", "Hire Requests", UserPlus, ["hr_admin", "supervisor", "hiring_manager"]),
    def("/interview-kits", "Interview Kits", Video, ["hr_admin", "hiring_manager"]),
    def("/offboarding", "Offboarding", DoorOpen, ["hr_admin"]),
    def("/benefits", "Benefits", HeartHandshake, ["hr_admin"]),
    def("/equipment", "Equipment & PPE", Package, ["hr_admin", "hiring_manager"]),
    def("/id-badge-templates", "ID Badge Templates", BadgeCheck, ["hr_admin"]),
      def("/org-chart", "Org Chart", Network, ["hr_admin", "hiring_manager", "supervisor", "it_admin", "employee"]),
  ]},
  { key: moduleKey("workflow"), label: "Workflow", items: [
    def("/worker-types", "Worker Types", Briefcase, ["hr_admin"]),
    def("/templates", "Templates", ListChecks, ["hr_admin"]),
    def("/forms", "Forms Library", FileSignature, ["hr_admin"]),
    def("/provisioning", "IT Provisioning", Server, ["it_admin", "hr_admin"]),
    def("/docs-generator", "Docs Generator", FileStack, ["hr_admin"]),
    def("/doc-templates", "Doc Templates", FileStack, ["hr_admin"]),
  ]},
  { key: moduleKey("coaching"), label: "Coaching", items: [
    def("/one-on-ones", "1-on-1s", MessagesSquare, ["hr_admin", "hiring_manager", "supervisor", "employee"]),
    def("/one-on-one-templates", "1-on-1 Templates", MessagesSquare, ["hr_admin"]),
    def("/goals", "Goals", Target, ["hr_admin", "hiring_manager", "supervisor", "employee"]),
    def("/reviews", "Reviews", ClipboardCheck, ["hr_admin", "hiring_manager", "supervisor", "employee"]),
    def("/review-cycles", "Review Cycles", CalendarDays, ["hr_admin"]),
    def("/cascades", "Cascades", Megaphone, ["hr_admin", "hiring_manager", "supervisor"]),
  ]},
  { key: moduleKey("compliance"), label: "Compliance", items: [
    def("/training", "Training & Certs", GraduationCap, ["hr_admin", "hiring_manager", "supervisor"]),
    def("/lms-imports", "LMS Imports", GraduationCap, ["hr_admin"]),
    def("/screenings", "Screenings", ShieldQuestion, ["hr_admin"]),
    def("/policies", "Policies", ScrollText, ["hr_admin", "hiring_manager", "employee", "candidate"]),
    def("/policy-campaigns", "Ack Campaigns", Megaphone, ["hr_admin"]),
    def("/grievances", "Grievances", ShieldAlert, ["hr_admin", "hiring_manager", "supervisor", "employee", "candidate"]),
    def("/documents", "Documents", FolderLock, ["hr_admin", "it_admin", "hiring_manager", "employee", "candidate"]),
    def("/reports", "Reports", BarChart3, ["hr_admin"]),
    def("/osha", "OSHA 300/300A", ShieldAlert, ["hr_admin"]),
    def("/flsa-audit", "FLSA Audit", Scale, ["hr_admin"]),
    def("/eeo-snapshot", "EEO Snapshot", BarChart2, ["hr_admin"]),
    def("/audit", "Audit Log", History, ["hr_admin"]),
  ]},
  { key: moduleKey("texas-compliance"), label: "Texas Compliance", items: [
    def("/compliance/new-hire", "New-Hire Reporting (TWC)", BadgeCheck, ["hr_admin"]),
    def("/compliance/tmrs", "TMRS Monthly", Landmark, ["hr_admin"]),
    def("/compliance/tcole", "TCOLE Tracking", ShieldCheck, ["hr_admin"]),
  ]},
  { key: moduleKey("compensation"), label: "Compensation", items: [
    def("/comp-grades", "Pay Grades", DollarSign, ["hr_admin"]),
    def("/comp-market", "Market Ranges", BarChart2, ["hr_admin"]),
    def("/comp-cycles", "Comp Cycles", CalendarDays, ["hr_admin", "hiring_manager", "supervisor"]),
    def("/payroll", "Payroll", Banknote, ["hr_admin"]),
    def("/payroll/profiles", "Payroll Export Profiles", FileStack, ["hr_admin"]),
    def("/cba", "Union Contracts (CBA)", Scale, ["hr_admin"]),
    def("/hr-finance", "HR / Finance", BarChart2, ["hr_admin"]),
  ]},
  { key: moduleKey("hiring"), label: "Hiring", items: [
    def("/jobs", "Requisitions", BriefcaseBusiness, ["hr_admin", "hiring_manager", "supervisor"]),
    def("/offers", "Offers", FileSignature, ["hr_admin", "hiring_manager"]),
    def("/email-templates", "Email Templates", ScrollText, ["hr_admin"]),
    def("/approvals", "Approvals", CheckSquare, ["hr_admin", "hiring_manager", "supervisor"]),
    def("/internal-careers", "Internal Careers", Compass, ["hr_admin", "hiring_manager", "supervisor", "employee"]),
  ]},
  { key: moduleKey("admin"), label: "Admin", items: [
    def("/settings", "Settings", Settings, ["hr_admin"]),
    def("/admin-org-settings", "Roles & AI", ShieldCheck, ["hr_admin"]),
    def("/admin-migration", "Data Migration", DatabaseBackup, ["hr_admin"]),
    def("/admin-modules", "Modules & Features", ToggleLeft, ["hr_admin"]),
    def("/admin-identity", "Identity & SSO", ShieldCheck, ["hr_admin"]),
    def("/admin-demo", "Demo Account", UserCog, ["hr_admin"]),
  ]},
];

/** Map a route pathname to its feature key, walking parent paths. */
export function featureKeyForPath(pathname: string): string | null {
  // exact match first
  for (const m of MODULE_REGISTRY) {
    for (const f of m.items) {
      if (f.to === pathname) return f.key;
    }
  }
  // longest-prefix match for nested / dynamic routes (e.g. /jobs/123)
  let best: { key: string; len: number } | null = null;
  for (const m of MODULE_REGISTRY) {
    for (const f of m.items) {
      if (pathname === f.to || pathname.startsWith(f.to + "/")) {
        if (!best || f.to.length > best.len) best = { key: f.key, len: f.to.length };
      }
    }
  }
  return best?.key ?? null;
}

export function parentModuleKey(featureKey: string): string | null {
  for (const m of MODULE_REGISTRY) {
    if (m.items.some((f) => f.key === featureKey)) return m.key;
  }
  return null;
}