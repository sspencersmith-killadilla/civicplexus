import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/review-cycles/$id")({
  component: () => <Outlet />,
});