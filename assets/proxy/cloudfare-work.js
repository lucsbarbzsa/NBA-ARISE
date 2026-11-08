/* ==========================================================================
   NBA ARISE — proxy OPCIONAL para a NBA 2K API (Cloudflare Workers)
   Use quando: (1) o navegador bloquear a chamada direta por CORS, ou
               (2) o site for publicado e a chave não puder ficar no JavaScript.

   Como usar:
   1. Crie um Worker em https://dash.cloudflare.com e cole este arquivo.
   2. Em Settings > Variables, crie o segredo NBA2K_API_KEY com a sua chave.
      (Opcional: ORIGEM_PERMITIDA com o endereço do seu site, ex.: https://meusite.com)
   3. Em assets/js/config.js, troque baseUrl pelo endereço do Worker e deixe
      apiKey vazio.
   O proxy só repassa GET /api/players... (inclui /bulk e /slug) e /api/public/players, e guarda as respostas por 1 hora.
   ========================================================================== */
export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ORIGEM_PERMITIDA || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Método não permitido', { status: 405, headers: cors });

    const url = new URL(request.url);
    const permitido = url.pathname.startsWith('/api/players') || url.pathname.startsWith('/api/public/players');
    if (!permitido) return new Response('Não encontrado', { status: 404, headers: cors });

    const cab = { 'Accept': 'application/json' };
    if (env.NBA2K_API_KEY && !url.pathname.startsWith('/api/public/')) cab['X-API-Key'] = env.NBA2K_API_KEY;
    const resposta = await fetch('https://api.nba2kapi.com' + url.pathname + url.search, {
      headers: cab,
      cf: { cacheEverything: true, cacheTtl: 3600 }
    });
    const cabecalhos = new Headers(resposta.headers);
    Object.keys(cors).forEach((k) => cabecalhos.set(k, cors[k]));
    return new Response(resposta.body, { status: resposta.status, headers: cabecalhos });
  }
};