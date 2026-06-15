import { createFileRoute } from "@tanstack/react-router";
import userGuide from "@/../docs/USER_GUIDE.md?raw";
import selfHostGuide from "@/../docs/SELF_HOSTING_GUIDE.md?raw";

const FILES: Record<string, string> = {
  "user-guide.md": userGuide,
  "self-hosting.md": selfHostGuide,
};

export const Route = createFileRoute("/api/public/docs/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const body = FILES[params.file];
        if (!body) return new Response("Not found", { status: 404 });
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
