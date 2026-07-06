import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/interview-kits")({
  beforeLoad: () => {
    throw redirect({ to: "/hiring/interview-kits" });
  },
});
