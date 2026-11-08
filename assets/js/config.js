/* ==========================================================================
   NBA ARISE — configuração da API NBA 2K (https://www.nba2kapi.com)

   COMO OS JOGADORES SÃO CARREGADOS
   • SEM chave (padrão): o catálogo usa o endpoint público GET /api/public/players,
     que não exige chave, devolve a lista em páginas (cursor) e aceita até 60
     requisições por minuto por IP. O site segue todas as páginas até o fim.
   • COM chave: o catálogo usa GET /api/players/bulk (a lista inteira em 1
     requisição) e, se isso falhar, GET /api/players com paginação. A chave
     também libera a ficha completa de cada jogador (GET /api/players/slug/:slug).
     Gere a sua em https://www.nba2kapi.com/dashboard e cole em "apiKey".

   ATENÇÃO: como o site é estático, tudo o que está neste arquivo fica visível
   para quem abrir o site. Para um projeto acadêmico local isso é aceitável;
   para publicar na internet NÃO coloque a chave aqui: use o proxy de
   proxy/cloudflare-worker.js (a chave fica guardada no servidor), troque
   "baseUrl" pelo endereço do seu proxy e deixe "apiKey" vazio.

   Abra o site por um servidor http (ex.: "python -m http.server" e depois
   http://localhost:8000). Abrir o arquivo direto (file://) faz o navegador
   bloquear a chamada à API (CORS).

   era: "curr" (elenco atual, padrão), "class" (times clássicos),
        "allt" (todos os tempos) ou "all" (as três listas juntas).
   ========================================================================== */
window.NBA_API_CONFIG = {
  baseUrl: 'https://api.nba2kapi.com',
  apiKey: '',
  era: 'curr'
};