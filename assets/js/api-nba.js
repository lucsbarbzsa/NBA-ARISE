/* ==========================================================================
   NBA ARISE — camada de dados da API NBA 2K (https://www.nba2kapi.com)
   - listar():  GET /api/players (todas as páginas) → lista já normalizada.
   - detalhe(): GET /api/players/slug/:slug → ficha completa do jogador.
   - Cache: a lista fica 1 h no localStorage e cada ficha 1 h no
     sessionStorage, para não gastar o limite de requisições da API.
   - Nada aqui inventa dados: o que a API não devolver fica vazio e as telas
     simplesmente não mostram o campo.
   A configuração (chave, endereço, era) está em assets/js/config.js.
   ========================================================================== */
(function () {
  'use strict';

  var PADRAO = { baseUrl: 'https://api.nba2kapi.com', apiKey: '', era: 'curr', tempoLimiteMs: 20000, cacheMinutos: 60, porPagina: 100, maxPaginas: 60 };
  var CFG = {};
  (function () {
    var u = window.NBA_API_CONFIG || {};
    for (var k in PADRAO) CFG[k] = (u[k] !== undefined && u[k] !== null && u[k] !== '') ? u[k] : PADRAO[k];
    CFG.baseUrl = String(CFG.baseUrl).replace(/\/+$/, '');
  })();

  var CHAVE_LISTA = 'nbaarise_api_jogadores';
  var PREFIXO_FICHA = 'nbaarise_api_ficha_';
  var emAndamento = null;
  var memoriaFichas = {};

  /* ---------- erros ---------- */
  function erro(codigo, mensagem, status) {
    var e = new Error(mensagem);
    e.codigo = codigo; e.mensagem = mensagem; e.status = status || 0;
    return e;
  }

  /* ---------- requisição ---------- */
  function usaApiOficial() { return /\/\/api\.nba2kapi\.com(\/|$)/i.test(CFG.baseUrl); }

  function requisitar(caminho, params) {
    if (!CFG.apiKey && usaApiOficial()) {
      return Promise.reject(erro('SEM_CHAVE', 'A chave da API ainda não foi configurada. Gere uma chave gratuita em nba2kapi.com/dashboard e cole em assets/js/config.js.'));
    }
    var q = [];
    for (var k in (params || {})) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    }
    var url = CFG.baseUrl + caminho + (q.length ? '?' + q.join('&') : '');
    var cabecalhos = { 'Accept': 'application/json' };
    if (CFG.apiKey) cabecalhos['X-API-Key'] = CFG.apiKey;

    var ctl = window.AbortController ? new AbortController() : null;
    var timer = window.setTimeout(function () { if (ctl) ctl.abort(); }, CFG.tempoLimiteMs);

    return fetch(url, { method: 'GET', headers: cabecalhos, signal: ctl ? ctl.signal : undefined }).then(function (resp) {
      window.clearTimeout(timer);
      if (resp.ok) {
        return resp.json().then(function (json) {
          if (json && json.success === false) {
            var m = json.error && (json.error.message || json.error);
            throw erro('API', 'A API informou uma falha' + (typeof m === 'string' ? ': ' + m : '.'), resp.status);
          }
          return json;
        }, function () { throw erro('RESPOSTA_INVALIDA', 'A API respondeu em um formato inesperado.', resp.status); });
      }
      if (resp.status === 401 || resp.status === 403) throw erro('CHAVE_INVALIDA', 'A API recusou a chave (erro ' + resp.status + '). Confira se a chave em assets/js/config.js está correta e ativa.', resp.status);
      if (resp.status === 404) throw erro('NAO_ENCONTRADO', 'A API não encontrou o que foi pedido (erro 404).', 404);
      if (resp.status === 429) {
        var espera = resp.headers && resp.headers.get && resp.headers.get('Retry-After');
        throw erro('LIMITE', 'O limite de requisições da API foi atingido (500 por hora no plano gratuito).' + (espera ? ' Tente de novo em ' + espera + ' s.' : ' Aguarde um pouco e tente de novo.'), 429);
      }
      if (resp.status >= 500) throw erro('SERVIDOR', 'A API está com problemas no momento (erro ' + resp.status + '). Tente novamente em instantes.', resp.status);
      throw erro('HTTP', 'A API respondeu com o erro ' + resp.status + '.', resp.status);
    }, function (err) {
      window.clearTimeout(timer);
      if (err && err.name === 'AbortError') throw erro('TEMPO', 'A API demorou demais para responder. Tente novamente.');
      throw erro('REDE', 'Não foi possível falar com a API. Verifique sua conexão com a internet. Se a conexão estiver boa, o navegador pode ter bloqueado a chamada (CORS): nesse caso use o proxy de proxy/cloudflare-worker.js.');
    });
  }

  function extrairLista(json) {
    if (Array.isArray(json)) return json;
    if (!json) return null;
    if (Array.isArray(json.data)) return json.data;
    if (json.data && Array.isArray(json.data.players)) return json.data.players;
    if (Array.isArray(json.players)) return json.players;
    if (Array.isArray(json.results)) return json.results;
    return null;
  }
  function paginacao(json) { return (json && json.meta && json.meta.pagination) || {}; }

  /* ---------- normalização (campos opcionais são procurados pelo nome) ---------- */
  var IGNORAR_NA_BUSCA = { attributes: 1, badges: 1, hotzones: 1 };

  function chaveLimpa(k) { return String(k).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function achatar(obj, prefixo, prof, saida) {
    if (!obj || typeof obj !== 'object' || prof > 3) return saida;
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === null || v === undefined) return;
      var limpa = chaveLimpa(k), caminho = prefixo ? prefixo + '.' + k : k;
      if (typeof v === 'object') {
        if (!Array.isArray(v) && !IGNORAR_NA_BUSCA[limpa]) achatar(v, caminho, prof + 1, saida);
        return;
      }
      saida.push({ chave: limpa, caminho: caminho, valor: v });
    });
    return saida;
  }
  function achar(entradas, padroes, aceita) {
    for (var i = 0; i < padroes.length; i++) {
      for (var j = 0; j < entradas.length; j++) {
        if (padroes[i].test(entradas[j].chave) && (!aceita || aceita(entradas[j]))) return entradas[j];
      }
    }
    return null;
  }
  function simples(e) { return (typeof e.valor === 'string' || typeof e.valor === 'number') && String(e.valor).trim() !== ''; }
  function ehUrlDeImagem(e) {
    if (typeof e.valor !== 'string') return false;
    if (/^(team|logo|flag|country|brand)/.test(e.chave) || /logo|flag/.test(e.chave)) return false;
    return /^(https?:)?\/\//i.test(e.valor) || /^\/[^\s]/.test(e.valor) || /^data:image\//i.test(e.valor);
  }
  function resolverUrl(u) {
    if (/^data:image\//i.test(u) || /^https?:\/\//i.test(u)) return u;
    try { return new URL(u, CFG.baseUrl + '/').href; } catch (e) { return u; }
  }
  function slugificar(t) {
    return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function posicoesDe(p) {
    var bruto = p.positions || p.position || p.pos || [];
    var lista = Array.isArray(bruto) ? bruto : String(bruto).split(/[\/,;|\s]+/);
    var vistos = {}, r = [];
    lista.forEach(function (x) {
      var s = String(x === null || x === undefined ? '' : x).trim().toUpperCase();
      if (s && !vistos[s]) { vistos[s] = 1; r.push(s); }
    });
    return r;
  }

  /* leve = true: não guarda a lista de campos já usados (só a ficha precisa dela) */
  function normalizar(p, leve) {
    if (!p || typeof p !== 'object') return null;
    var nome = String(p.name || p.fullName || p.playerName || '').trim();
    if (!nome) return null;
    var slug = String(p.slug || '').trim() || slugificar(nome);
    var equipe = typeof p.team === 'string' ? p.team : ((p.team && (p.team.name || p.team.fullName)) || '');
    var entradas = achatar(p, '', 0, []);
    var foto = achar(entradas, [/^(photo|image|img|headshot|picture|avatar|portrait)(url|link|src)?$/, /(photo|headshot|picture|avatar|portrait)/, /(image|img)/, /thumb/], ehUrlDeImagem);
    var altura = achar(entradas, [/^height$/, /^height/, /height/], simples);
    var peso = achar(entradas, [/^weight$/, /^weight/, /weight/], simples);
    var camisa = achar(entradas, [/^(jersey|jerseynumber|jerseyno|shirtnumber|shirt)$/, /jersey/, /^(number|num)$/], simples);
    var geral = typeof p.overall === 'number' ? p.overall : (isFinite(parseFloat(p.overall)) ? parseFloat(p.overall) : null);
    var j = {
      slug: slug,
      nome: nome,
      equipe: String(equipe || '').trim(),
      era: p.teamType ? String(p.teamType) : '',
      geral: geral,
      posicoes: posicoesDe(p),
      altura: altura ? String(altura.valor).trim() : '',
      peso: peso ? String(peso.valor).trim() : '',
      camisa: camisa ? String(camisa.valor).trim() : '',
      foto: foto ? resolverUrl(foto.valor) : ''
    };
    if (!leve) {
      j.usados = ['name', 'fullName', 'playerName', 'slug', 'team', 'teamType', 'overall', 'positions', 'position', 'pos'];
      [foto, altura, peso, camisa].forEach(function (e) { if (e) j.usados.push(e.caminho); });
    }
    return j;
  }

  /* ---------- cache da lista ---------- */
  function origemCache() { return CFG.baseUrl + '|' + CFG.era; }
  function lerCacheLista() {
    try {
      var c = JSON.parse(localStorage.getItem(CHAVE_LISTA));
      if (c && c.v === 1 && c.origem === origemCache() && Array.isArray(c.dados)) return c;
    } catch (e) { /* sem cache */ }
    return null;
  }
  function gravarCacheLista(dados) {
    try { localStorage.setItem(CHAVE_LISTA, JSON.stringify({ v: 1, t: Date.now(), origem: origemCache(), dados: dados })); }
    catch (e) { /* armazenamento cheio ou bloqueado: segue sem cache */ }
  }
  function fresco(c) { return !!c && (Date.now() - c.t) < CFG.cacheMinutos * 60000; }

  /* ---------- lista ---------- */
  function baixarTudo(aoProgredir) {
    var acumulado = [], vistos = {}, cursores = {};
    function pagina(cursor, n) {
      return requisitar('/api/players', { era: CFG.era, limit: CFG.porPagina, cursor: cursor }).then(function (json) {
        var lista = extrairLista(json);
        if (!lista) throw erro('RESPOSTA_INVALIDA', 'A API respondeu em um formato inesperado (a lista de jogadores não foi encontrada).');
        lista.forEach(function (p) {
          var j = normalizar(p, true);
          if (j && !vistos[j.slug]) { vistos[j.slug] = 1; acumulado.push(j); }
        });
        var pg = paginacao(json);
        if (aoProgredir) aoProgredir(acumulado.length, typeof pg.total === 'number' ? pg.total : null);
        var prox = (pg.nextCursor === undefined || pg.nextCursor === null || pg.nextCursor === '') ? null : String(pg.nextCursor);
        if (prox && lista.length && !cursores[prox] && n < CFG.maxPaginas) { cursores[prox] = 1; return pagina(prox, n + 1); }
        return acumulado;
      });
    }
    return pagina(undefined, 1);
  }

  /* devolve { jogadores, desatualizado, aviso } — usa o cache enquanto for válido */
  function listar(op) {
    op = op || {};
    var cache = lerCacheLista();
    if (fresco(cache) && !op.forcar) return Promise.resolve({ jogadores: cache.dados, desatualizado: false });
    if (emAndamento) return emAndamento;
    emAndamento = baixarTudo(op.aoProgredir).then(function (jogs) {
      if (jogs.length) gravarCacheLista(jogs);
      return { jogadores: jogs, desatualizado: false };
    }).catch(function (err) {
      if (cache && cache.dados.length) return { jogadores: cache.dados, desatualizado: true, aviso: err.mensagem };
      throw err;
    }).then(function (r) { emAndamento = null; return r; }, function (e) { emAndamento = null; throw e; });
    return emAndamento;
  }

  /* dados básicos de um jogador já guardados no cache da lista (mesmo vencido) */
  function daLista(slug) {
    var c = lerCacheLista();
    if (!c) return null;
    for (var i = 0; i < c.dados.length; i++) if (c.dados[i].slug === slug) return c.dados[i];
    return null;
  }

  /* ---------- ficha individual ---------- */
  function lerFicha(slug) {
    var m = memoriaFichas[slug];
    if (m && fresco(m)) return m;
    try {
      var s = JSON.parse(sessionStorage.getItem(PREFIXO_FICHA + slug));
      if (s && s.origem === origemCache() && fresco(s)) { memoriaFichas[slug] = s; return s; }
    } catch (e) { /* sem cache */ }
    return null;
  }
  function gravarFicha(slug, bruto) {
    var reg = { t: Date.now(), origem: origemCache(), bruto: bruto };
    memoriaFichas[slug] = reg;
    try { sessionStorage.setItem(PREFIXO_FICHA + slug, JSON.stringify(reg)); } catch (e) { /* ignora */ }
  }

  /* devolve { bruto, basico } */
  function detalhe(slug) {
    slug = String(slug || '').trim();
    if (!slug) return Promise.reject(erro('NAO_ENCONTRADO', 'Nenhum jogador foi informado.'));
    function montar(bruto) {
      var basico = normalizar(bruto, false);
      if (!basico) throw erro('RESPOSTA_INVALIDA', 'A API respondeu em um formato inesperado (ficha do jogador).');
      return { bruto: bruto, basico: basico };
    }
    var guardada = lerFicha(slug);
    if (guardada) return Promise.resolve(montar(guardada.bruto));
    var params = CFG.era !== 'curr' && CFG.era !== 'all' ? { teamType: CFG.era } : {};
    return requisitar('/api/players/slug/' + encodeURIComponent(slug), params).then(function (json) {
      var d = json && json.data !== undefined ? json.data : json;
      if (Array.isArray(d)) d = d[0];
      if (!d || typeof d !== 'object') throw erro('NAO_ENCONTRADO', 'A API não devolveu dados para este jogador.');
      gravarFicha(slug, d);
      return montar(d);
    }).catch(function (e) {
      if (e && e.codigo === 'NAO_ENCONTRADO') throw erro('NAO_ENCONTRADO', 'Jogador não encontrado na API.', 404);
      throw e;
    });
  }

  function limparCache() {
    try { localStorage.removeItem(CHAVE_LISTA); } catch (e) { /* ignora */ }
    memoriaFichas = {};
    try {
      Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf(PREFIXO_FICHA) === 0) sessionStorage.removeItem(k); });
    } catch (e) { /* ignora */ }
  }

  window.NBAApi = { config: CFG, listar: listar, detalhe: detalhe, daLista: daLista, normalizar: normalizar, limparCache: limparCache };
})();