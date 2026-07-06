import { createFileRoute } from "@tanstack/react-router";
import { KitsPage } from "@/routes/_authenticated/interview-kits";

export const Route = createFileRoute("/_authenticated/hiring/interview-kits")({ component: KitsPage });