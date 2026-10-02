// Cloudflare Worker entrypoint para servir assets estáticos con velocidad edge máxima
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Servir archivos estáticos del binding ASSETS
    const response = await env.ASSETS.fetch(request);

    // Si no se encuentra el archivo (404), retornar index.html para soportar navegación SPA (#admin, etc.)
    if (response.status === 404 && !url.pathname.includes('.')) {
      const indexRequest = new Request(new URL('/index.html', request.url), request);
      return env.ASSETS.fetch(indexRequest);
    }

    return response;
  }
};
