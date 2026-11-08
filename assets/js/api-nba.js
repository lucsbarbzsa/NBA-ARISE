/* ==========================================================================
   NBA ARISE — camada de dados da API NBA 2K (https://www.nba2kapi.com)
   - listar():  baixa a lista COMPLETA (todas as páginas) já normalizada.
       • sem chave:  GET /api/public/players (endpoint público, sem chave,
                     60 requisições/min por IP) seguindo o cursor até o fim;
       • com chave:  GET /api/players/bulk (1 requisição só) e, se falhar,
                     GET /api/players paginado (limit=100 + cursor) e, por
                     último, o endpoint público.
   - detalhe(): GET /api/players/slug/:slug → ficha completa (exige chave).
   - Cache: a lista fica 1 h no localStorage e cada ficha 1 h no
     sessionStorage, para não gastar o limite de requisições da API.
   - Nada aqui inventa dados: o que a API não devolver fica vazio e as telas
     simplesmente não mostram o campo.
   A configuração (chave, endereço, era) está em assets/js/config.js.
   ========================================================================== */
(function () {
  'use strict';

  var PADRAO = { baseUrl: 'https://api.nba2kapi.com', apiKey: '', era: 'curr', tempoLimiteMs: 20000, cacheMinutos: 60, porPagina: 100, maxPaginas: 80 };
  var CFG = {};
  (function () {
    var u = window.NBA_API_CONFIG || {};
    for (var k in PADRAO) CFG[k] = (u[k] !== undefined && u[k] !== null && u[k] !== '') ? u[k] : PADRAO[k];
    CFG.baseUrl = String(CFG.baseUrl).replace(/\/+$/, '');
  })();

  /* "all" = elenco atual + times clássicos + todos os tempos (3 listas, cada uma com seu teamType) */
  var ERAS_ALVO = (CFG.era === 'all') ? ['curr', 'class', 'allt'] : [String(CFG.era || 'curr')];

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
  function esperar(ms) { return new Promise(function (r) { window.setTimeout(r, ms); }); }

  /* ---------- requisição ---------- */
  function usaApiOficial() { return /\/\/api\.nba2kapi\.com(\/|$)/i.test(CFG.baseUrl); }

  /* op.publico = endpoint sem chave: não manda nenhum cabeçalho personalizado
     (assim o navegador nem faz a checagem prévia de CORS). */
  function requisitar(caminho, params, op) {
    op = op || {};
    if (!op.publico && !CFG.apiKey && usaApiOficial()) {
      return Promise.reject(erro('SEM_CHAVE', 'Esta consulta exige uma chave da API (gratuita em nba2kapi.com/dashboard, para colar em assets/js/config.js).'));
    }
    var q = [];
    for (var k in (params || {})) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    }
    var url = CFG.baseUrl + caminho + (q.length ? '?' + q.join('&') : '');
    var cabecalhos = { 'Accept': 'application/json' };
    if (CFG.apiKey && !op.publico) cabecalhos['X-API-Key'] = CFG.apiKey;

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
      if (resp.status === 401 || resp.status === 403) throw erro('CHAVE_INVALIDA', 'A API recusou o acesso (erro ' + resp.status + '). Se você usa uma chave, confira se ela em assets/js/config.js está correta e ativa.', resp.status);
      if (resp.status === 404) throw erro('NAO_ENCONTRADO', 'A API não encontrou o que foi pedido (erro 404).', 404);
      if (resp.status === 429) {
        var espera = resp.headers && resp.headers.get && parseInt(resp.headers.get('Retry-After'), 10);
        var e429 = erro('LIMITE', 'O limite de requisições da API foi atingido.' + (espera ? ' Tente de novo em ' + espera + ' s.' : ' Aguarde um pouco e tente de novo.'), 429);
        e429.espera = isFinite(espera) ? espera : 0;
        throw e429;
      }
      if (resp.status >= 500) throw erro('SERVIDOR', 'A API está com problemas no momento (erro ' + resp.status + '). Tente novamente em instantes.', resp.status);
      throw erro('HTTP', 'A API respondeu com o erro ' + resp.status + '.', resp.status);
    }, function (err) {
      window.clearTimeout(timer);
      if (err && err.name === 'AbortError') throw erro('TEMPO', 'A API demorou demais para responder. Tente novamente.');
      throw erro('REDE', 'Não foi possível falar com a API. Verifique sua conexão com a internet. Se a conexão estiver boa, o navegador pode ter bloqueado a chamada (CORS) — abra o site por um servidor http (ex.: localhost) em vez de abrir o arquivo direto, ou use o proxy de proxy/cloudflare-worker.js.');
    });
  }

  function extrairLista(json) {
    if (Array.isArray(json)) return json;
    if (!json) return null;
    if (Array.isArray(json.data)) return json.data;
    if (json.data && Array.isArray(json.data.players)) return json.data.players;
    if (json.data && Array.isArray(json.data.items)) return json.data.items;
    if (Array.isArray(json.players)) return json.players;
    if (Array.isArray(json.results)) return json.results;
    return null;
  }
  /* a paginação pode vir em json.pagination, json.meta.pagination ou json.meta */
  function paginacao(json) {
    if (!json) return {};
    return json.pagination || (json.meta && json.meta.pagination) || json.meta || (json.data && json.data.pagination) || {};
  }

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
    u = String(u).trim();
    if (/^data:image\//i.test(u) || /^https?:\/\//i.test(u)) return u;
    if (/^\/\//.test(u)) return 'https:' + u;
    try { return new URL(u, CFG.baseUrl + '/').href; } catch (e) { return u; }
  }
  function slugificar(t) {
    return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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

  /* ----- foto: a API entrega "playerImage"; se existir um ID da NBA (ou ele aparecer
     na própria URL da foto), a CDN oficial de headshots serve de segunda opção ----- */
  var CDN_HEADSHOT = 'https://cdn.nba.com/headshots/nba/latest/1040x760/';
  function idNbaDe(entradas, foto) {
    var e = achar(entradas, [/^(nbaid|nbaplayerid|nbapersonid|nbacomid|personid|playerid)$/], function (x) { return /^\d{3,8}$/.test(String(x.valor).trim()); });
    if (e) return String(e.valor).trim();
    var m = foto && /headshots\/nba\/[^/]+\/[^/]+\/(\d{3,8})\.png/i.exec(foto);
    return m ? m[1] : '';
  }

  /* ----- atributos resumidos (só o que a API trouxe; nada é inventado) ----- */
  function numerosDe(obj, prof, saida) {
    if (!obj || typeof obj !== 'object' || prof > 2) return saida;
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 99) { var c = chaveLimpa(k); if (saida[c] === undefined) saida[c] = v; }
      else if (v && typeof v === 'object' && !Array.isArray(v)) numerosDe(v, prof + 1, saida);
    });
    return saida;
  }
  function primeiro(mapa, padroes) {
    var chaves = Object.keys(mapa);
    for (var i = 0; i < padroes.length; i++) for (var j = 0; j < chaves.length; j++) if (padroes[i].test(chaves[j])) return mapa[chaves[j]];
    return null;
  }
  function resumoAtributos(attrs) {
    var m = numerosDe(attrs, 0, {}), r = {};
    var arr = primeiro(m, [/^(threepointshot|threeball|threept|threes?)$/, /^(three|3pt)/]);
    var per = primeiro(m, [/^perimeter(defense|d)$/, /^perimeterdef/]), inte = primeiro(m, [/^interior(defense|d)$/, /^interiordef/]);
    var pas = primeiro(m, [/^passiq$/, /^passaccuracy$/, /^pass/]);
    var vel = primeiro(m, [/^speed$/, /^speedwithball$/]);
    if (arr !== null) r.arremesso = arr;
    if (per !== null || inte !== null) r.defesa = Math.round(((per === null ? inte : per) + (inte === null ? per : inte)) / 2);
    if (pas !== null) r.passe = pas;
    if (vel !== null) r.velocidade = vel;
    return r;
  }

  /* leve = true: não guarda a lista de campos já usados (só a ficha precisa dela).
     era = teamType da lista de onde veio o jogador. */
  function normalizar(p, leve, era) {
    if (!p || typeof p !== 'object') return null;
    var nome = String(p.name || p.fullName || p.playerName || '').trim();
    if (!nome) return null;
    var slug = String(p.slug || '').trim() || slugificar(nome);
    var equipe = typeof p.team === 'string' ? p.team : ((p.team && (p.team.name || p.team.fullName)) || '');
    var tipoEra = p.teamType ? String(p.teamType) : (era || '');
    var entradas = achatar(p, '', 0, []);
    var foto = (typeof p.playerImage === 'string' && p.playerImage.trim()) ? { valor: p.playerImage, caminho: 'playerImage' } :
      achar(entradas, [/^(photo|image|img|headshot|picture|avatar|portrait)(url|link|src)?$/, /(photo|headshot|picture|avatar|portrait)/, /(image|img)/, /thumb/], ehUrlDeImagem);
    var altura = achar(entradas, [/^height$/, /^height/, /height/], simples);
    var peso = achar(entradas, [/^weight$/, /^weight/, /weight/], simples);
    var camisa = achar(entradas, [/^(jersey|jerseynumber|jerseyno|shirtnumber|shirt)$/, /jersey/, /^(number|num)$/], simples);
    var geral = typeof p.overall === 'number' ? p.overall : (isFinite(parseFloat(p.overall)) ? parseFloat(p.overall) : null);
    var urlFoto = foto ? resolverUrl(foto.valor) : '';
    var idNba = idNbaDe(entradas, urlFoto);
    var fotos = [];
    if (urlFoto) fotos.push(urlFoto);
    if (idNba) { var cdn = CDN_HEADSHOT + idNba + '.png'; if (fotos.indexOf(cdn) === -1) fotos.push(cdn); }
    /* o mesmo jogador pode aparecer em mais de uma era/equipe: o ID separa as versões */
    var id = (!tipoEra || tipoEra === 'curr') ? slug : slug + '~' + tipoEra + '~' + slugificar(equipe);
    var j = {
      id: id,
      slug: slug,
      nome: nome,
      equipe: String(equipe || '').trim(),
      era: tipoEra,
      geral: geral,
      posicoes: posicoesDe(p),
      altura: altura ? String(altura.valor).trim() : '',
      peso: peso ? String(peso.valor).trim() : '',
      camisa: camisa ? String(camisa.valor).trim() : '',
      foto: fotos[0] || '',
      fotos: fotos,
      atributos: resumoAtributos(p.attributes)
    };
    if (!leve) {
      j.usados = ['name', 'fullName', 'playerName', 'slug', 'team', 'teamType', 'overall', 'positions', 'position', 'pos', 'playerImage'];
      [foto, altura, peso, camisa].forEach(function (e) { if (e && e.caminho) j.usados.push(e.caminho); });
    }
    return j;
  }

  /* ---------- cache da lista ---------- */
  function origemCache() { return CFG.baseUrl + '|' + ERAS_ALVO.join(','); }
  function lerCacheLista() {
    try {
      var c = JSON.parse(localStorage.getItem(CHAVE_LISTA));
      if (c && c.v === 2 && c.origem === origemCache() && Array.isArray(c.dados)) return c;
    } catch (e) { /* sem cache */ }
    return null;
  }
  function gravarCacheLista(dados, total) {
    try { localStorage.setItem(CHAVE_LISTA, JSON.stringify({ v: 2, t: Date.now(), origem: origemCache(), dados: dados, total: total || null })); }
    catch (e) { /* armazenamento cheio ou bloqueado: segue sem cache */ }
  }
  function fresco(c) { return !!c && (Date.now() - c.t) < CFG.cacheMinutos * 60000; }

  /* ---------- lista ---------- */
  /* Baixa TODAS as páginas de um endpoint paginado por cursor.
     - se a API recusar o tamanho da página (400), tenta 50 e depois 25;
     - se bater no limite de requisições (429), espera o tempo pedido (até 65 s) e continua. */
  function baixarPaginas(caminho, params, op, aoPagina) {
    var tamanho = CFG.porPagina, cursores = {}, tentativas429 = 0, totalInformado = null;
    function pagina(cursor, n) {
      var p = {}; for (var k in params) p[k] = params[k];
      p.limit = tamanho; if (cursor) p.cursor = cursor;
      return requisitar(caminho, p, op).then(function (json) {
        var lista = extrairLista(json);
        if (!lista) throw erro('RESPOSTA_INVALIDA', 'A API respondeu em um formato inesperado (a lista de jogadores não foi encontrada).');
        var pg = paginacao(json);
        if (typeof pg.total === 'number') totalInformado = pg.total;
        aoPagina(lista, totalInformado);
        var prox = (pg.nextCursor === undefined || pg.nextCursor === null || pg.nextCursor === '') ? null : String(pg.nextCursor);
        if (prox && pg.hasMore !== false && lista.length && !cursores[prox] && n < CFG.maxPaginas) {
          cursores[prox] = 1;
          return pagina(prox, n + 1);
        }
        return totalInformado;
      }, function (err) {
        if (err.codigo === 'HTTP' && err.status === 400 && tamanho > 25 && !cursor) { tamanho = tamanho > 50 ? 50 : 25; return pagina(cursor, n); }
        if (err.codigo === 'LIMITE' && tentativas429 < 3 && (err.espera || 5) <= 65) {
          tentativas429++;
          return esperar(((err.espera || 5) + 1) * 1000).then(function () { return pagina(cursor, n); });
        }
        throw err;
      });
    }
    return pagina(undefined, 1);
  }

  /* o 1º método que funcionar vence; só tenta o próximo quando o erro indica "caminho errado" (não rede/limite) */
  function primeiroQueFunciona(metodos) {
    var i = 0, ultimo = null;
    function tentar() {
      if (i >= metodos.length) return Promise.reject(ultimo);
      var m = metodos[i++];
      return m().catch(function (err) {
        ultimo = err;
        if (['HTTP', 'NAO_ENCONTRADO', 'RESPOSTA_INVALIDA', 'CHAVE_INVALIDA', 'SEM_CHAVE', 'API'].indexOf(err.codigo) === -1) throw err;
        return tentar();
      });
    }
    return tentar();
  }

  function baixarEra(era, acumular) {
    var params = era ? { teamType: era } : {};
    function resultado(lista, total) { acumular(lista, era, total); }
    function viaPublico() { return baixarPaginas('/api/public/players', params, { publico: true }, resultado); }
    function viaPaginado() { return baixarPaginas('/api/players', params, {}, resultado); }
    function viaBulk() {
      return requisitar('/api/players/bulk', params, {}).then(function (json) {
        var lista = extrairLista(json);
        if (!lista) throw erro('RESPOSTA_INVALIDA', 'A API respondeu em um formato inesperado (a lista de jogadores não foi encontrada).');
        var pg = paginacao(json);
        acumular(lista, era, typeof pg.total === 'number' ? pg.total : lista.length);
        return pg.total;
      });
    }
    var oficial = usaApiOficial();
    if (oficial && !CFG.apiKey) return viaPublico();
    return primeiroQueFunciona(oficial ? [viaBulk, viaPaginado, viaPublico] : [viaBulk, viaPaginado]);
  }

  function baixarTudo(aoProgredir) {
    var acumulado = [], vistos = {}, informados = {}, avisos = [];
    function acumular(lista, era, total) {
      lista.forEach(function (p) {
        var j = normalizar(p, true, era);
        if (j && !vistos[j.id]) { vistos[j.id] = 1; acumulado.push(j); }
      });
      if (typeof total === 'number') informados[era] = total;
      if (aoProgredir) aoProgredir(acumulado.length, null);
    }
    var seq = Promise.resolve();
    ERAS_ALVO.forEach(function (era, idx) {
      seq = seq.then(function () {
        return baixarEra(era, acumular).catch(function (err) {
          if (idx === 0 || !acumulado.length) throw err;           /* a 1ª lista é obrigatória; as outras são opcionais */
          avisos.push('A lista "' + era + '" não pôde ser carregada (' + err.mensagem + ')');
        });
      });
    });
    return seq.then(function () {
      var total = null;
      ERAS_ALVO.forEach(function (e) { if (typeof informados[e] === 'number') total = (total || 0) + informados[e]; });
      return { jogadores: acumulado, total: total, avisos: avisos };
    });
  }

  /* devolve { jogadores, desatualizado, aviso, total } — usa o cache enquanto for válido */
  function listar(op) {
    op = op || {};
    var cache = lerCacheLista();
    if (fresco(cache) && !op.forcar) return Promise.resolve({ jogadores: cache.dados, desatualizado: false, total: cache.total });
    if (emAndamento) return emAndamento;
    emAndamento = baixarTudo(op.aoProgredir).then(function (r) {
      if (!r.jogadores.length) throw erro('VAZIO', 'A API respondeu, mas não devolveu nenhum jogador.');
      gravarCacheLista(r.jogadores, r.total);
      return { jogadores: r.jogadores, desatualizado: false, total: r.total, aviso: r.avisos.join(' ') };
    }).catch(function (err) {
      if (cache && cache.dados.length) return { jogadores: cache.dados, desatualizado: true, aviso: err.mensagem, total: cache.total };
      throw err;
    }).then(function (r) { emAndamento = null; return r; }, function (e) { emAndamento = null; throw e; });
    return emAndamento;
  }

  /* jogadores já guardados no cache da lista (mesmo vencido), sem nenhuma requisição */
  function doCache() { var c = lerCacheLista(); return c ? c.dados : []; }
  function daLista(id) {
    var l = doCache();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  /* ---------- ficha individual ---------- */
  function lerFicha(id) {
    var m = memoriaFichas[id];
    if (m && fresco(m)) return m;
    try {
      var s = JSON.parse(sessionStorage.getItem(PREFIXO_FICHA + id));
      if (s && s.origem === origemCache() && fresco(s)) { memoriaFichas[id] = s; return s; }
    } catch (e) { /* sem cache */ }
    return null;
  }
  function gravarFicha(id, bruto) {
    var reg = { t: Date.now(), origem: origemCache(), bruto: bruto };
    memoriaFichas[id] = reg;
    try { sessionStorage.setItem(PREFIXO_FICHA + id, JSON.stringify(reg)); } catch (e) { /* ignora */ }
  }

  /* id = "slug" (elenco atual) ou "slug~era~equipe"; devolve { bruto, basico } */
  function detalhe(id) {
    id = String(id || '').trim();
    if (!id) return Promise.reject(erro('NAO_ENCONTRADO', 'Nenhum jogador foi informado.'));
    var partes = id.split('~'), slug = partes[0], era = partes[1] || 'curr';
    function montar(bruto) {
      var basico = normalizar(bruto, false, era);
      if (!basico) throw erro('RESPOSTA_INVALIDA', 'A API respondeu em um formato inesperado (ficha do jogador).');
      basico.id = id;
      return { bruto: bruto, basico: basico };
    }
    var guardada = lerFicha(id);
    if (guardada) return Promise.resolve(montar(guardada.bruto));
    var params = era !== 'curr' ? { teamType: era } : {};
    return requisitar('/api/players/slug/' + encodeURIComponent(slug), params).then(function (json) {
      var d = json && json.data !== undefined ? json.data : json;
      if (Array.isArray(d)) d = d[0];
      if (!d || typeof d !== 'object') throw erro('NAO_ENCONTRADO', 'A API não devolveu dados para este jogador.');
      gravarFicha(id, d);
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

  window.NBAApi = { config: CFG, listar: listar, detalhe: detalhe, daLista: daLista, doCache: doCache, normalizar: normalizar, limparCache: limparCache };
})();