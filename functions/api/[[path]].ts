type PagesEnv = {
  WAVE_TUNE_API_ORIGIN?: string;
};

export const onRequest = async ({ request, env }: { request: Request; env: PagesEnv }) => {
  const incoming = new URL(request.url);
  const backendOrigin = (env.WAVE_TUNE_API_ORIGIN || "https://wave-tune.onrender.com").replace(/\/+$/, "");
  const target = new URL(`${incoming.pathname}${incoming.search}`, backendOrigin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target, {
    method,
    headers,
    body,
    redirect: "manual",
  });
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
};
