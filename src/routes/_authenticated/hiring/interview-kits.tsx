import { createFileRoute } from "@tanstack/react-router";
import { KitsPage } from "@/components/interview-kits-page";

export const Route = createFileRoute("/_authenticated/hiring/interview-kits")({ component: KitsPage });