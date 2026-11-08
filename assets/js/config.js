/* ==========================================================================
   NBA ARISE — configuração da API NBA 2K (https://www.nba2kapi.com)

   A API exige uma chave no cabeçalho X-API-Key (plano gratuito: 500
   requisições por hora). Gere a sua em https://www.nba2kapi.com/dashboard
   e cole abaixo, entre as aspas de "apiKey".

   ATENÇÃO: como o site é estático, tudo o que está neste arquivo fica visível
   para quem abrir o site. Para um projeto acadêmico local isso é aceitável;
   para publicar na internet, prefira o proxy de proxy/cloudflare-worker.js:
   nele a chave fica guardada no servidor. Nesse caso, troque "baseUrl" pelo
   endereço do seu proxy e deixe "apiKey" vazio.

   era: "curr" (elenco atual, padrão da API), "class" (times clássicos),
        "allt" (todos os tempos) ou "all" (todas as eras).
   ========================================================================== */
window.NBA_API_CONFIG = {
  baseUrl: 'https://api.nba2kapi.com',
  apiKey: '',
  era: 'curr'
};