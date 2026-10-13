type PagesEnv = {
  WAVE_TUNE_API_ORIGIN?: string;
};

function proxyError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const onRequest = async ({ request, env }: { request: Request; env: PagesEnv }) => {
  const incoming = new URL(request.url);
  const configuredOrigin = env.WAVE_TUNE_API_ORIGIN?.trim();
  if (!configuredOrigin) {
    return proxyError(
      503,
      "The Wave Tune API origin is not configured. Set WAVE_TUNE_API_ORIGIN to the Render service origin in Cloudflare Pages, then redeploy.",
    );
  }

  let backend: URL;
  try {
    backend = new URL(configuredOrigin);
  } catch {
    return proxyError(503, "WAVE_TUNE_API_ORIGIN must be a valid Render service origin.");
  }
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname);
  if ((backend.protocol !== "https:" && !(backend.protocol === "http:" && localHost))
    || backend.username || backend.password || backend.pathname !== "/" || backend.search || backend.hash) {
    return proxyError(503, "WAVE_TUNE_API_ORIGIN must be an HTTPS origin without a path, query, or credentials.");
  }

  const target = new URL(`${incoming.pathname}${incoming.search}`, backend.origin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
    });
  } catch {
    return proxyError(
      502,
      "The Wave Tune API could not be reached. Confirm the Render service is running and WAVE_TUNE_API_ORIGIN points to it.",
    );
  }
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
};
