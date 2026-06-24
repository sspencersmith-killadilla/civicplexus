import { createFileRoute } from "@tanstack/react-router";
import { marked } from "marked";
import userGuide from "@/../docs/USER_GUIDE.md?raw";
import selfHostGuide from "@/../docs/SELF_HOSTING_GUIDE.md?raw";

type Doc = { title: string; body: string; downloadName: string };

const DOCS: Record<string, Doc> = {
  "user-guide": { title: "CivicPlexus — User Guide", body: userGuide, downloadName: "civicplexus-user-guide.md" },
  "self-hosting": { title: "CivicPlexus — Self-Hosting Guide", body: selfHostGuide, downloadName: "civicplexus-self-hosting-guide.md" },
};

function renderPage(doc: Doc, slug: string): string {
  const html = marked.parse(doc.body, { gfm: true, breaks: false }) as string;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${doc.title}</title>
<meta name="description" content="${doc.title}" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#fbf9f4; --surface:#ffffff; --ink:#1a1a1a; --muted:#5b5b5b;
    --rule:#e7e2d6; --accent:#1f3a5f; --accent-soft:#eaf0f7; --code-bg:#f3efe6;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);
    font-family:Inter,system-ui,sans-serif;line-height:1.65;font-size:16px;-webkit-font-smoothing:antialiased}
  a{color:var(--accent);text-decoration:none;border-bottom:1px solid color-mix(in oklab,var(--accent) 35%,transparent)}
  a:hover{border-bottom-color:var(--accent)}
  header.topbar{position:sticky;top:0;z-index:10;background:color-mix(in oklab,var(--bg) 90%,transparent);
    backdrop-filter:blur(8px);border-bottom:1px solid var(--rule)}
  .topbar-inner{max-width:1100px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;gap:24px;flex-wrap:wrap}
  .brand{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:18px;letter-spacing:-.01em;color:var(--ink);border:0}
  nav.docnav{display:flex;gap:6px;flex:1;flex-wrap:wrap}
  nav.docnav a{padding:6px 12px;border-radius:999px;border:1px solid var(--rule);font-size:14px;color:var(--muted);background:var(--surface)}
  nav.docnav a[aria-current="page"]{color:var(--accent);border-color:var(--accent);background:var(--accent-soft)}
  .download{font-size:14px;padding:8px 14px;border:1px solid var(--ink);border-radius:8px;background:var(--ink);color:var(--bg)}
  .download:hover{opacity:.9}
  main{max-width:1100px;margin:0 auto;padding:32px 24px 96px;display:grid;grid-template-columns:260px 1fr;gap:48px}
  aside.toc{position:sticky;top:84px;align-self:start;max-height:calc(100vh - 110px);overflow:auto;
    border-left:1px solid var(--rule);padding:4px 0 4px 16px;font-size:13.5px}
  aside.toc .toc-title{font-family:Fraunces,Georgia,serif;font-size:14px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin:0 0 10px}
  aside.toc ul{list-style:none;padding:0;margin:0}
  aside.toc li{margin:2px 0}
  aside.toc li.lvl-3{padding-left:14px;font-size:13px;color:var(--muted)}
  aside.toc a{display:block;padding:4px 8px;border-radius:6px;color:var(--muted);border:0;line-height:1.35}
  aside.toc a:hover{background:var(--accent-soft);color:var(--accent)}
  article{min-width:0;background:var(--surface);border:1px solid var(--rule);border-radius:14px;padding:56px 64px;
    box-shadow:0 1px 0 rgba(0,0,0,.02),0 30px 60px -40px rgba(20,30,60,.18)}
  article h1,article h2,article h3,article h4{font-family:Fraunces,Georgia,serif;letter-spacing:-.015em;line-height:1.2;color:var(--ink)}
  article h1{font-size:40px;margin:0 0 8px}
  article h2{font-size:26px;margin:48px 0 12px;padding-top:18px;border-top:1px solid var(--rule)}
  article h2:first-of-type{border-top:0;padding-top:0}
  article h3{font-size:19px;margin:28px 0 8px}
  article h4{font-size:16px;margin:20px 0 6px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-family:Inter,sans-serif;font-weight:600}
  article p,article li{font-size:15.5px}
  article ul,article ol{padding-left:22px}
  article li{margin:4px 0}
  article hr{border:0;border-top:1px solid var(--rule);margin:36px 0}
  article blockquote{margin:20px 0;padding:14px 18px;border-left:3px solid var(--accent);background:var(--accent-soft);border-radius:0 8px 8px 0;color:#243b5c}
  article code{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:.88em;background:var(--code-bg);padding:2px 6px;border-radius:4px}
  article pre{background:#0f172a;color:#e2e8f0;padding:18px 20px;border-radius:10px;overflow:auto;font-size:13.5px;line-height:1.55}
  article pre code{background:transparent;color:inherit;padding:0;font-size:inherit}
  article table{width:100%;border-collapse:collapse;margin:18px 0;font-size:14.5px;display:block;overflow:auto}
  article th,article td{border:1px solid var(--rule);padding:10px 12px;text-align:left;vertical-align:top}
  article thead th{background:#f6f2e8;font-family:Fraunces,Georgia,serif;font-weight:600}
  article img{max-width:100%;border-radius:8px}
  .lede{color:var(--muted);font-size:17px;margin:0 0 28px}
  .anchor{color:inherit;border:0;margin-left:8px;opacity:0;font-size:.7em;vertical-align:middle}
  h2:hover .anchor,h3:hover .anchor{opacity:.6}
  footer.docfoot{max-width:1100px;margin:0 auto;padding:24px;color:var(--muted);font-size:13px;text-align:center}
  @media (max-width:880px){
    main{grid-template-columns:1fr;padding:20px 16px 64px;gap:24px}
    aside.toc{position:static;max-height:none;border-left:0;border-top:1px solid var(--rule);padding:16px 0 0}
    article{padding:28px 22px;border-radius:10px}
    article h1{font-size:30px}
    article h2{font-size:22px}
  }
</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/">CivicPlexus Docs</a>
    <nav class="docnav" aria-label="Documentation">
      <a href="/api/public/docs/user-guide" ${slug === "user-guide" ? 'aria-current="page"' : ""}>User Guide</a>
      <a href="/api/public/docs/self-hosting" ${slug === "self-hosting" ? 'aria-current="page"' : ""}>Self-Hosting Guide</a>
    </nav>
    <a class="download" href="/api/public/docs/${slug}.md">Download .md</a>
  </div>
</header>
<main>
  <aside class="toc" id="toc"><p class="toc-title">On this page</p><ul id="toc-list"></ul></aside>
  <article id="content">${html}</article>
</main>
<footer class="docfoot">CivicPlexus — HRIS for cities &amp; counties.</footer>
<script>
(function(){
  var article=document.getElementById('content');
  var list=document.getElementById('toc-list');
  var heads=article.querySelectorAll('h2, h3');
  var used={};
  heads.forEach(function(h){
    var slug=(h.textContent||'').toLowerCase().trim()
      .replace(/[^a-z0-9\\s-]/g,'').replace(/\\s+/g,'-').slice(0,80)||'section';
    if(used[slug]) slug=slug+'-'+(++used[slug]); else used[slug]=1;
    h.id=slug;
    var a=document.createElement('a');
    a.className='anchor';a.href='#'+slug;a.textContent='#';
    h.appendChild(a);
    var li=document.createElement('li');
    li.className='lvl-'+(h.tagName==='H2'?2:3);
    var link=document.createElement('a');
    link.href='#'+slug;link.textContent=h.textContent.replace(/#$/,'').trim();
    li.appendChild(link);list.appendChild(li);
  });
})();
</script>
</body>
</html>`;
}

export const Route = createFileRoute("/api/public/docs/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = params.file;
        const wantsMarkdown = /\.md$/i.test(raw);
        const slug = raw.replace(/\.md$/i, "");
        const doc = DOCS[slug];
        if (!doc) return new Response("Not found", { status: 404 });
        if (wantsMarkdown) {
          return new Response(doc.body, {
            status: 200,
            headers: {
              "content-type": "text/markdown; charset=utf-8",
              "content-disposition": `attachment; filename="${doc.downloadName}"`,
              "cache-control": "public, max-age=300",
            },
          });
        }
        return new Response(renderPage(doc, slug), {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
