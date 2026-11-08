/* ==========================================================================
   NBA ARISE — cartas, catálogo, detalhes, Meu time (camada compartilhada)
   - Jogadores da NBA vêm da API NBA 2K (assets/js/api-nba.js → window.NBAApi).
   - As cartas cadastradas em "Nova carta" ficam no localStorage, neste
     navegador (chave "nbaarise_cartas").
   - O Meu time (adicionar/remover) fica em assets/js/time.js → window.NBATime.
   - Os 12 jogadores de assets/js/jogadores.js só aparecem como DEMONSTRAÇÃO,
     quando a API está indisponível e não há cache.
   - Todas as páginas usam o mesmo "item" de carta (itemApi / itemCustom /
     itemDemo) e a mesma função de desenho (cartaHtml), então uma carta é
     idêntica no Catálogo, no Meu time, na Roleta e nos Detalhes.
   - A foto escolhida em "Nova carta" é lida, reduzida e guardada como texto
     (data URL) junto com a carta.
   Cada bloco de página só roda se a página tiver o elemento correspondente.
   ========================================================================== */
(function () {
  'use strict';

  var CHAVE = 'nbaarise_cartas';
  var POSICOES = { PG: 'Armador', SG: 'Ala-armador', SF: 'Ala', PF: 'Ala-pivô', C: 'Pivô' };
  var RARIDADES = ['Comum', 'Rara', 'Lendária'];

  function $(id) { return document.getElementById(id); }
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function normalizar(t) {
    return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  /* ---------- dados ---------- */
  function fixas() { return Array.isArray(window.JOGADORES) ? window.JOGADORES : []; }
  function personalizadas() {
    try {
      var l = JSON.parse(localStorage.getItem(CHAVE));
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }
  function todas() { return fixas().concat(personalizadas()); }
  function gravar(lista) {
    try { localStorage.setItem(CHAVE, JSON.stringify(lista)); return true; }
    catch (e) { return false; }
  }

  /* ---------- imagem ---------- */
  function imagemProvisoria(nome) {
    var ini = nome.split(' ').filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase();
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360' width='640' height='360'>" +
      "<rect width='640' height='360' fill='#141d16'/>" +
      "<path d='M0 360L220 0h90L90 360zM260 360L480 0h90L350 360z' fill='#182319'/>" +
      "<text x='320' y='235' fill='#223127' font-family='Arial Narrow,Arial,sans-serif' font-size='190' font-weight='700' text-anchor='middle'>" + esc(ini) + "</text>" +
      "<text x='320' y='320' fill='#7d8a80' font-family='Arial,sans-serif' font-size='16' text-anchor='middle'>FOTO PENDENTE · " + esc(nome.toUpperCase()) + "</text></svg>";
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function imagemDe(c) {
    return (typeof c.imagem === 'string' && c.imagem.indexOf('data:image/') === 0)
      ? { src: c.imagem, alt: 'Imagem da carta de ' + c.nome }
      : { src: imagemProvisoria(c.nome), alt: 'Imagem provisória da carta de ' + c.nome };
  }

  /* lê o arquivo, reduz para no máximo 640 px e devolve um texto (JPEG) */
  function processarImagem(arquivo) {
    return new Promise(function (resolver, rejeitar) {
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(arquivo.type) === -1) {
        return rejeitar(new Error('A imagem precisa ser JPG, PNG ou WEBP.'));
      }
      if (arquivo.size > 8 * 1024 * 1024) return rejeitar(new Error('A imagem é grande demais (máximo de 8 MB).'));
      var url = URL.createObjectURL(arquivo), img = new Image();
      img.onload = function () {
        var escala = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * escala));
        c.height = Math.max(1, Math.round(img.naturalHeight * escala));
        var x = c.getContext('2d');
        x.fillStyle = '#141d16'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolver(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rejeitar(new Error('Não foi possível ler essa imagem.')); };
      img.src = url;
    });
  }

  /* ---------- validação e gravação ---------- */
  function inteiro(v, min, max) {
    if (!/^\d+$/.test(String(v).trim())) return null;
    var n = parseInt(v, 10);
    return (n >= min && n <= max) ? n : null;
  }
  function validar(d, ignorarId) {
    var nome = d.nome.trim(), equipe = d.equipe.trim();
    if (!nome || !equipe || !d.posicao || !String(d.numero).trim() || !d.raridade ||
        [d.geral, d.arremesso, d.defesa, d.passe, d.velocidade].some(function (v) { return !String(v).trim(); })) {
      return { erro: 'Preencha todos os campos obrigatórios.' };
    }
    if (nome.length < 2) return { erro: 'O nome do jogador precisa ter pelo menos 2 caracteres.' };
    if (!POSICOES[d.posicao]) return { erro: 'Escolha uma posição válida.' };
    if (RARIDADES.indexOf(d.raridade) === -1) return { erro: 'Escolha uma raridade válida.' };
    var numero = inteiro(d.numero, 1, 999);
    if (numero === null) return { erro: 'O número da carta deve ser um inteiro de 1 a 999.' };
    var attrs = {};
    var nomes = { geral: 'Overall', arremesso: 'Arremesso', defesa: 'Defesa', passe: 'Passe', velocidade: 'Velocidade' };
    for (var k in nomes) {
      var n = inteiro(d[k], 0, 99);
      if (n === null) return { erro: nomes[k] + ' deve ser um número inteiro de 0 a 99.' };
      attrs[k] = n;
    }
    var existentes = todas();
    for (var i = 0; i < existentes.length; i++) {
      if (ignorarId && existentes[i].id === ignorarId) continue;
      if (normalizar(existentes[i].nome) === normalizar(nome)) return { erro: 'Já existe uma carta de ' + existentes[i].nome + ' na coleção.' };
      if (existentes[i].numero === numero) return { erro: 'O número ' + numero + ' já é usado por outra carta (' + existentes[i].nome + ').' };
    }
    return { ok: true, nome: nome, equipe: equipe, numero: numero, attrs: attrs };
  }

  function salvar(d, imagem) {
    var v = validar(d);
    if (!v.ok) return v;
    var carta = {
      id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36),
      numero: v.numero, nome: v.nome, completo: v.nome, sigla: d.posicao, posicao: POSICOES[d.posicao],
      equipe: v.equipe, geral: v.attrs.geral, arremesso: v.attrs.arremesso, defesa: v.attrs.defesa,
      passe: v.attrs.passe, velocidade: v.attrs.velocidade, raridade: d.raridade,
      descricao: (d.descricao || '').trim().slice(0, 500), imagem: imagem || null, personalizada: true
    };
    var lista = personalizadas(); lista.push(carta);
    if (!gravar(lista)) return { erro: 'Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado. Tente uma imagem menor ou sem imagem.' };
    return { ok: true, carta: carta };
  }
  function excluir(id) {
    var lista = personalizadas().filter(function (c) { return c.id !== id; });
    var ok = gravar(lista);
    if (ok && window.NBATime) window.NBATime.remover(id);   /* carta apagada some do Meu time */
    return ok;
  }
  /* edição: muda os dados da carta mantendo id e imagem (a menos que venha uma imagem nova) */
  function atualizar(id, d, imagemNova) {
    var v = validar(d, id);
    if (!v.ok) return v;
    var lista = personalizadas(), atual = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) { atual = lista[i]; break; }
    if (!atual) return { erro: 'Essa carta não existe mais.' };
    atual.numero = v.numero; atual.nome = v.nome; atual.completo = v.nome; atual.sigla = d.posicao; atual.posicao = POSICOES[d.posicao];
    atual.equipe = v.equipe; atual.geral = v.attrs.geral; atual.arremesso = v.attrs.arremesso; atual.defesa = v.attrs.defesa;
    atual.passe = v.attrs.passe; atual.velocidade = v.attrs.velocidade; atual.raridade = d.raridade;
    atual.descricao = (d.descricao || '').trim().slice(0, 500);
    if (imagemNova) atual.imagem = imagemNova;
    if (!gravar(lista)) return { erro: 'Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado. Tente uma imagem menor.' };
    if (window.NBATime && window.NBATime.tem(id)) window.NBATime.atualizarItem(id, paraTime(itemCustom(atual)));
    return { ok: true, carta: atual };
  }
  function cartaPorId(id) {
    var l = personalizadas();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }


  /* ======================================================================
     ITENS DE CARTA — um único formato para API, cartas do usuário e demonstração
       { id, tipo:'api'|'custom'|'demo', nome, equipe, posicoes:[], geral,
         fotos:[], stats:[[ROTULO, valor]], rotulo, href, extra:{} }
     ====================================================================== */
  var ERAS = { curr: 'Elenco atual', 'class': 'Times clássicos', allt: 'Todos os tempos' };
  var ROTULOS = { attributes: 'Atributos', badges: 'Badges', hotzones: 'Zonas quentes', tendencies: 'Tendências', total: 'Total' };

  function nomesPosicoes(pos) { return pos.map(function (p) { return POSICOES[p] || p; }).join(' / '); }
  function num3(n) { var t = String(n); while (t.length < 2) t = '0' + t; return t; }

  function itemApi(j) {
    var stats = [['ALTURA', j.altura], ['PESO', j.peso], ['CAMISA', j.camisa]];
    var a = j.atributos || {};
    stats.push(['ARREMESSO', a.arremesso], ['DEFESA', a.defesa], ['PASSE', a.passe], ['VELOCIDADE', a.velocidade]);
    return {
      id: j.id, tipo: 'api', nome: j.nome, equipe: j.equipe, posicoes: j.posicoes.slice(), geral: j.geral,
      fotos: (j.fotos && j.fotos.length) ? j.fotos.slice() : (j.foto ? [j.foto] : []),
      stats: stats.filter(function (x) { return x[1] !== '' && x[1] !== null && x[1] !== undefined; }),
      rotulo: nomesPosicoes(j.posicoes) + (j.era && j.era !== 'curr' ? ' · ' + (ERAS[j.era] || j.era) : ''),
      href: 'detalhes.html?jogador=' + encodeURIComponent(j.id), extra: {}
    };
  }
  function statsCustom(c) {
    return [['ARREMESSO', c.arremesso], ['DEFESA', c.defesa], ['PASSE', c.passe], ['VELOCIDADE', c.velocidade]];
  }
  function itemCustom(c) {
    return {
      id: c.id, tipo: 'custom', nome: c.nome, equipe: c.equipe, posicoes: [c.sigla], geral: c.geral,
      fotos: (typeof c.imagem === 'string' && c.imagem.indexOf('data:image/') === 0) ? [c.imagem] : [],
      stats: statsCustom(c),
      rotulo: 'COLEÇÃO 01 / CARTA ' + num3(c.numero) + ' · SUA CARTA',
      href: 'detalhes.html#' + c.id,
      extra: { completo: c.completo || c.nome, raridade: c.raridade, descricao: c.descricao, posicaoNome: c.posicao }
    };
  }
  function itemDemo(d) {
    return {
      id: 'demo-' + d.id, tipo: 'demo', nome: d.nome, equipe: d.equipe, posicoes: [d.sigla], geral: d.geral, fotos: [],
      stats: statsCustom(d),
      rotulo: 'DEMONSTRAÇÃO · CARTA ' + num3(d.numero),
      href: 'detalhes.html#demo-' + d.id,
      extra: { completo: d.completo || d.nome, raridade: '', descricao: '', posicaoNome: d.posicao }
    };
  }
  function demoItens() { return fixas().map(itemDemo); }

  /* cópia que vai para o Meu time. Cartas do usuário não levam a imagem (texto grande):
     ela é buscada na carta original na hora de desenhar, então edições aparecem lá também. */
  function paraTime(item) {
    var c = JSON.parse(JSON.stringify(item));
    if (c.tipo === 'custom') c.fotos = [];
    return c;
  }
  /* devolve o item pronto para desenhar, ou null se a carta do usuário foi apagada */
  function materializar(snap) {
    if (snap.tipo === 'custom') { var c = cartaPorId(snap.id); return c ? itemCustom(c) : null; }
    return snap;
  }

  /* ---------- desenho das cartas ---------- */
  function imagemItem(item) {
    return item.fotos.length
      ? { src: item.fotos[0], alt: 'Foto de ' + item.nome }
      : { src: imagemProvisoria(item.nome), alt: 'Imagem provisória de ' + item.nome };
  }
  function statsItemHtml(item) {
    if (!item.stats.length) return '';
    return '<dl class="stats">' + item.stats.map(function (i) { return '<div><dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd></div>'; }).join('') + '</dl>';
  }
  function botoesTimeHtml(item) {
    var id = esc(item.id), nome = esc(item.nome);
    return '<button type="button" data-add="' + id + '" aria-label="Adicionar ' + nome + ' ao time">Adicionar ao time</button>';
  }
  function acoesHtml(item, ctx) {
    var id = esc(item.id), nome = esc(item.nome);
    if (ctx === 'time') {
      return '<div class="acoes"><button type="button" class="secundario" data-rem="' + id + '" aria-label="Remover ' + nome + ' do time">Remover do time</button></div>';
    }
    var h = '<div class="acoes">' + botoesTimeHtml(item) +
      '<button type="button" class="secundario" data-rem="' + id + '" data-so-no-time hidden aria-label="Remover ' + nome + ' do time">Remover do time</button>';
    if (ctx === 'catalogo' && item.tipo === 'custom') {
      h += '<a class="botao secundario" href="editar-carta.html?carta=' + id + '" aria-label="Editar carta de ' + nome + '">Editar</a>' +
        '<button type="button" class="secundario" data-excluir="' + id + '" aria-label="Excluir carta de ' + nome + '">Excluir</button>';
    }
    return h + '</div>';
  }
  function cartaHtml(item, ctx) {
    var im = imagemItem(item), id = esc(item.id), fotos = item.fotos.length > 1 ? ' data-fotos="' + esc(JSON.stringify(item.fotos)) + '"' : '';
    return '<article class="carta carta-' + esc(item.tipo) + (item.tipo !== 'custom' ? ' carta-api' : '') + '" id="carta-' + id + '" data-id="' + id + '">' +
      '<div class="carta-topo"><span>' + esc(item.posicoes.join(' · ')) + '</span>' + (item.geral !== null && item.geral !== undefined ? '<strong>' + esc(item.geral) + ' <small>GER</small></strong>' : '') + '</div>' +
      '<img src="' + esc(im.src) + '" alt="' + esc(im.alt) + '" data-nome="' + esc(item.nome) + '"' + fotos + ' width="640" height="360" loading="lazy" referrerpolicy="no-referrer">' +
      '<div class="carta-corpo">' + (item.rotulo ? '<p class="numero">' + esc(item.rotulo) + '</p>' : '') + '<h3>' + esc(item.nome) + '</h3>' +
      (item.equipe ? '<p class="clube">' + esc(item.equipe) + '</p>' : '') + statsItemHtml(item) +
      '<a class="link-detalhe" href="' + esc(item.href) + '">Ver detalhes <span aria-hidden="true">↗</span></a>' +
      acoesHtml(item, ctx) + '</div></article>';
  }

  /* se a foto não carregar: tenta a próxima opção (ex.: CDN oficial da NBA) e, por fim, a ilustração provisória */
  function tratarFalhaDeImagem(container) {
    container.addEventListener('error', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG' || img.getAttribute('data-falhou')) return;
      var lista = [];
      try { lista = JSON.parse(img.getAttribute('data-fotos') || '[]'); } catch (x) { lista = []; }
      var prox = (parseInt(img.getAttribute('data-idx') || '0', 10) || 0) + 1;
      if (prox < lista.length) { img.setAttribute('data-idx', String(prox)); img.src = lista[prox]; return; }
      img.setAttribute('data-falhou', '1');
      img.src = imagemProvisoria(img.getAttribute('data-nome') || 'Jogador');
    }, true);
  }

  /* ---------- aviso rápido (toast) ---------- */
  var tempoAviso = null;
  function avisar(texto, tipo) {
    var el = $('toast');
    if (!el) {
      el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.className = 'toast ' + (tipo || 'ok') + ' visivel';
    el.textContent = texto;
    window.clearTimeout(tempoAviso);
    tempoAviso = window.setTimeout(function () { el.classList.remove('visivel'); }, 3200);
  }

  /* ---------- botões "Adicionar ao time" / "Remover do time" (iguais em todas as páginas) ---------- */
  function atualizarBotoesTime(raiz) {
    if (!window.NBATime) return;
    raiz = raiz || document;
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-add]'), function (b) {
      var no = window.NBATime.tem(b.getAttribute('data-add'));
      b.classList.toggle('adicionado', no);
      b.setAttribute('aria-disabled', no ? 'true' : 'false');
      b.textContent = no ? 'Adicionado ao time' : 'Adicionar ao time';
    });
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-so-no-time]'), function (b) {
      b.hidden = !window.NBATime.tem(b.getAttribute('data-rem'));
    });
  }
  /* buscar(id) devolve o item de carta correspondente (a página sabe quais cartas tem) */
  function ligarBotoesTime(container, buscar) {
    container.addEventListener('click', function (e) {
      var alvo = e.target.closest ? e.target.closest('[data-add],[data-rem]') : null;
      if (!alvo || !window.NBATime) return;
      var id = alvo.getAttribute('data-add') || alvo.getAttribute('data-rem'), item = buscar(id);
      if (alvo.hasAttribute('data-add')) {
        if (!item) return avisar('Não foi possível encontrar esse jogador.', 'erro');
        var r = window.NBATime.adicionar(paraTime(item));
        if (r.ok) avisar(item.nome + ' foi adicionado ao seu time. (' + window.NBATime.contar() + ' no time)', 'ok');
        else if (r.motivo === 'repetido') avisar(item.nome + ' já está no seu time. Para tirá-lo, use "Remover do time".', 'erro');
        else if (r.motivo === 'armazenamento') avisar('Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado.', 'erro');
        else avisar('Não foi possível adicionar esse jogador.', 'erro');
      } else {
        var snap = window.NBATime.listar().filter(function (x) { return x.id === id; })[0];
        if (window.NBATime.remover(id)) avisar(((item && item.nome) || (snap && snap.nome) || 'Jogador') + ' foi removido do seu time.', 'ok');
      }
    });
    window.addEventListener('nbatime:mudou', function () { atualizarBotoesTime(container); });
    atualizarBotoesTime(container);
  }

  /* ======================================================================
     DETALHES
     ====================================================================== */
  function rotulo(chave) {
    var k = String(chave), limpa = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ROTULOS[limpa]) return ROTULOS[limpa];
    var t = k.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function primitivo(v) { return v === null || ['string', 'number', 'boolean'].indexOf(typeof v) !== -1; }
  function vazio(v) {
    if (v === null || v === undefined || v === '') return true;
    if (Array.isArray(v)) return !v.length;
    return typeof v === 'object' && !Object.keys(v).length;
  }
  function valorHtml(v) {
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    var s = String(v);
    return /^https?:\/\/[^\s]+$/i.test(s) ? '<a href="' + esc(s) + '" target="_blank" rel="noopener noreferrer">' + esc(s) + '</a>' : esc(s);
  }
  function fichaHtml(pares) {
    return '<dl class="ficha">' + pares.map(function (p) { return '<div><dt>' + esc(p[0]) + '</dt><dd>' + p[1] + '</dd></div>'; }).join('') + '</dl>';
  }
  function secaoGenerica(titulo, valor, caminho, usados, nivel) {
    if (nivel > 4 || vazio(valor) || primitivo(valor) || usados.indexOf(caminho) !== -1) return '';
    if (Array.isArray(valor)) {
      var itens = valor.slice(0, 80).map(function (it) {
        if (primitivo(it)) return vazio(it) ? '' : valorHtml(it);
        return Object.keys(it).filter(function (k) { return primitivo(it[k]) && !vazio(it[k]); })
          .map(function (k) { return '<strong>' + esc(rotulo(k)) + ':</strong> ' + valorHtml(it[k]); }).join(' · ');
      }).filter(Boolean);
      return itens.length ? '<h3>' + esc(titulo) + '</h3><ul class="lista-api">' + itens.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>' : '';
    }
    var prims = [], filhos = [], html = '';
    Object.keys(valor).forEach(function (k) {
      var v = valor[k];
      if (vazio(v) || usados.indexOf(caminho + '.' + k) !== -1) return;
      (primitivo(v) ? prims : filhos).push(k);
    });
    if (prims.length) {
      html += '<h3>' + esc(titulo) + '</h3>';
      if (prims.every(function (k) { return typeof valor[k] === 'number'; })) {
        html += '<dl class="stats">' + prims.map(function (k) { return '<div><dt>' + esc(rotulo(k).toUpperCase()) + '</dt><dd>' + esc(valor[k]) + '</dd></div>'; }).join('') + '</dl>';
      } else {
        html += fichaHtml(prims.map(function (k) { return [rotulo(k), valorHtml(valor[k])]; }));
      }
    }
    filhos.forEach(function (k) { html += secaoGenerica(titulo + ' · ' + rotulo(k), valor[k], caminho + '.' + k, usados, nivel + 1); });
    return html;
  }
  function rodapeDetalheHtml(item) {
    var id = esc(item.id);
    return '<div class="botoes"><a href="catalogo.html#carta-' + id + '">← Voltar ao catálogo</a>' + botoesTimeHtml(item) +
      '<button type="button" class="secundario" data-rem="' + id + '" data-so-no-time hidden>Remover do time</button>' +
      (item.tipo === 'custom' ? '<a class="botao secundario" href="editar-carta.html?carta=' + id + '">Editar carta</a>' : '') +
      '<a href="#conteudo">Ir ao topo</a></div>';
  }
  function detalheApiHtml(j, bruto) {
    var item = itemApi(j), im = imagemItem(item), id = esc(j.id), pos = nomesPosicoes(j.posicoes);
    var fotos = item.fotos.length > 1 ? ' data-fotos="' + esc(JSON.stringify(item.fotos)) + '"' : '';
    var ficha = [
      ['Equipe', j.equipe],
      ['Posição', j.posicoes.length ? j.posicoes.join(' · ') + (pos ? ' — ' + pos : '') : ''],
      ['Altura', j.altura], ['Peso', j.peso], ['Camisa', j.camisa],
      ['Overall (GER)', j.geral === null ? '' : j.geral],
      ['Versão', j.era ? (ERAS[j.era] || j.era) : '']
    ].filter(function (i) { return i[1] !== '' && i[1] !== null && i[1] !== undefined; }).map(function (i) { return [i[0], esc(i[1])]; });
    var extras = '', soltos = [], usados = j.usados || [];
    if (bruto) {
      Object.keys(bruto).forEach(function (k) {
        var v = bruto[k];
        if (vazio(v) || usados.indexOf(k) !== -1) return;
        if (primitivo(v)) soltos.push([rotulo(k), valorHtml(v)]);
        else extras += secaoGenerica(rotulo(k), v, k, usados, 1);
      });
    }
    var resumo = item.stats.filter(function (x) { return ['ARREMESSO', 'DEFESA', 'PASSE', 'VELOCIDADE'].indexOf(x[0]) !== -1; });
    return '<article class="painel detalhe-carta detalhe-api" id="' + id + '" aria-labelledby="nome-' + id + '">' +
      '<img src="' + esc(im.src) + '" alt="' + esc(im.alt) + '" data-nome="' + esc(j.nome) + '"' + fotos + ' width="640" height="360" referrerpolicy="no-referrer">' +
      (pos ? '<p class="numero">' + esc(pos) + '</p>' : '') + '<h2 id="nome-' + id + '">' + esc(j.nome) + '</h2>' +
      (ficha.length ? fichaHtml(ficha) : '') +
      (!bruto && resumo.length ? '<h3>Atributos</h3>' + statsItemHtml({ stats: resumo }) : '') +
      (soltos.length ? '<h3>Mais informações</h3>' + fichaHtml(soltos) : '') + extras +
      rodapeDetalheHtml(item) + '</article>';
  }
  function detalheItemHtml(item) {
    var im = imagemItem(item), id = esc(item.id), x = item.extra || {};
    return '<article class="painel detalhe-carta" id="' + id + '" aria-labelledby="nome-' + id + '" data-tipo="' + esc(item.tipo) + '">' +
      '<img src="' + esc(im.src) + '" alt="' + esc(im.alt) + '" data-nome="' + esc(item.nome) + '" width="640" height="360" loading="lazy">' +
      '<p class="numero">' + esc(item.rotulo) + '</p><h2 id="nome-' + id + '">' + esc(item.nome) + '</h2>' +
      '<dl class="ficha"><div><dt>Nome completo</dt><dd>' + esc(x.completo || item.nome) + '</dd></div><div><dt>Posição</dt><dd>' + esc(item.posicoes[0] || '') + ' · ' + esc(x.posicaoNome || '') + '</dd></div>' +
      '<div><dt>Equipe</dt><dd>' + esc(item.equipe) + '</dd></div><div><dt>Overall (GER)</dt><dd>' + esc(item.geral) + '</dd></div>' +
      (x.raridade ? '<div><dt>Raridade</dt><dd>' + esc(x.raridade) + '</dd></div>' : '') + '</dl>' +
      '<h3>Atributos</h3>' + statsItemHtml(item) +
      (x.descricao ? '<h3>Estilo de jogo</h3><p>' + esc(x.descricao) + '</p>' : '') +
      rodapeDetalheHtml(item) + '</article>';
  }

  /* ======================================================================
     PÁGINAS
     ====================================================================== */
  function iniciarCadastro() {
    var form = $('form-carta');
    if (!form) return;
    var msg = $('msg-carta');
    function mostrar(tipo, texto, link) {
      msg.className = 'msg ' + tipo;
      msg.textContent = texto;
      if (link) {
        var a = document.createElement('a'); a.href = link.href; a.textContent = link.texto;
        msg.appendChild(document.createTextNode(' ')); msg.appendChild(a);
      }
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      var dados = lerFormCarta(f);
      var v = validar(dados);
      if (!v.ok) return mostrar('erro', v.erro);
      var arquivo = f['imagem'].files && f['imagem'].files[0];
      var botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      var passo = arquivo ? processarImagem(arquivo) : Promise.resolve(null);
      passo.then(function (img) {
        var r = salvar(dados, img);
        if (!r.ok) return mostrar('erro', r.erro);
        form.reset();
        mostrar('ok', 'Carta de ' + r.carta.nome + ' salva! Ela já aparece no catálogo e na roleta e pode ser adicionada ao Meu time.', { href: 'catalogo.html#carta-' + r.carta.id, texto: 'Ver no catálogo →' });
      }).catch(function (err) {
        mostrar('erro', err.message || 'Não foi possível salvar a carta.');
      }).then(function () { botao.disabled = false; });
    });
    form.addEventListener('reset', function () { msg.className = 'msg'; msg.textContent = ''; });
  }
  function lerFormCarta(f) {
    return {
      nome: f['jogador'].value, equipe: f['equipe'].value, posicao: f['posicao'].value, numero: f['numero-carta'].value,
      raridade: f['raridade'].value, geral: f['geral'].value, arremesso: f['arremesso'].value, defesa: f['defesa'].value,
      passe: f['passe'].value, velocidade: f['velocidade'].value, descricao: f['descricao'].value
    };
  }

  /* ---------- editar-carta.html?carta=<id> ---------- */
  function iniciarEdicao() {
    var form = $('form-editar');
    if (!form) return;
    var id = new URLSearchParams(location.search).get('carta'), carta = id ? cartaPorId(id) : null;
    var msg = $('msg-editar'), painel = $('painel-edicao'), painelExcluir = $('painel-excluir');
    function mostrar(tipo, texto, link) {
      msg.className = 'msg ' + tipo; msg.textContent = texto;
      if (link) { var a = document.createElement('a'); a.href = link.href; a.textContent = link.texto; msg.appendChild(document.createTextNode(' ')); msg.appendChild(a); }
    }
    if (!carta) {
      painel.hidden = true; painelExcluir.hidden = true;
      var aviso = $('aviso-edicao');
      aviso.hidden = false;
      aviso.innerHTML = '<strong>Carta não encontrada</strong><p>' + (id && !/^c[0-9a-z]+$/.test(id)
        ? 'Só as cartas criadas por você em <a href="cadastro-carta.html">Nova carta</a> podem ser editadas; os jogadores da API NBA 2K são somente leitura.'
        : 'Não existe uma carta sua com esse identificador (ela pode ter sido excluída). Abra o <a href="catalogo.html">catálogo</a> e use o botão "Editar" de uma das suas cartas.') + '</p>';
      return;
    }
    var f = form.elements;
    function preencher() {
      f['jogador'].value = carta.nome; f['equipe'].value = carta.equipe; f['posicao'].value = carta.sigla; f['numero-carta'].value = carta.numero;
      f['raridade'].value = carta.raridade || ''; f['geral'].value = carta.geral; f['arremesso'].value = carta.arremesso; f['defesa'].value = carta.defesa;
      f['passe'].value = carta.passe; f['velocidade'].value = carta.velocidade; f['descricao'].value = carta.descricao || ''; f['imagem'].value = '';
    }
    preencher();
    $('dados-edicao').textContent = 'Dados da carta: ' + carta.nome;
    $('link-detalhes').href = 'detalhes.html#' + carta.id;
    $('link-catalogo').href = 'catalogo.html#carta-' + carta.id;
    $('btn-excluir').textContent = 'Excluir carta de ' + carta.nome;
    $('btn-restaurar').addEventListener('click', function () { preencher(); mostrar('', 'Valores restaurados para os últimos dados salvos.'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var dados = lerFormCarta(f), v = validar(dados, carta.id);
      if (!v.ok) return mostrar('erro', v.erro);
      var arquivo = f['imagem'].files && f['imagem'].files[0], botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      (arquivo ? processarImagem(arquivo) : Promise.resolve(null)).then(function (img) {
        var r = atualizar(carta.id, dados, img);
        if (!r.ok) return mostrar('erro', r.erro);
        carta = r.carta; preencher(); $('dados-edicao').textContent = 'Dados da carta: ' + carta.nome;
        $('btn-excluir').textContent = 'Excluir carta de ' + carta.nome;
        mostrar('ok', 'Alterações salvas!', { href: 'catalogo.html#carta-' + carta.id, texto: 'Ver no catálogo →' });
      }).catch(function (err) { mostrar('erro', err.message || 'Não foi possível salvar as alterações.'); })
        .then(function () { botao.disabled = false; });
    });
    $('btn-excluir').addEventListener('click', function () {
      if (!window.confirm('Excluir a carta de ' + carta.nome + '? Ela também sai do Meu time. Essa ação não pode ser desfeita.')) return;
      var nome = carta.nome;
      if (!excluir(carta.id)) return mostrar('erro', 'Não foi possível excluir: o armazenamento do navegador está bloqueado.');
      painel.hidden = true; painelExcluir.hidden = true;
      var aviso = $('aviso-edicao'); aviso.hidden = false;
      aviso.innerHTML = '<strong>Carta excluída</strong><p>A carta de ' + esc(nome) + ' foi excluída. <a href="catalogo.html">Voltar ao catálogo</a></p>';
    });
  }

  /* ---------- catálogo ---------- */
  function iniciarCatalogo() {
    var grade = $('grade-cartas'), form = document.querySelector('form.filtros');
    if (!grade || !form) return;
    var estado = $('estado-catalogo'), tentar = $('tentar'), semResultados = $('sem-resultados');
    var mais = $('mais-cartas'), total = $('total-cartas');
    var POR_VEZ = 48, limite = POR_VEZ, carregando = true, api = [], demo = false, totalApi = null, itens = [], visiveis = [], porId = {}, temporizador = null, ultimaAssinatura = '';

    /* jogadores da API (ou demonstração) + cartas criadas em "Nova carta", numa lista só */
    function montarItens() {
      var lista = (demo ? demoItens() : api.map(itemApi));
      personalizadas().forEach(function (c) { lista.push(itemCustom(c)); });
      porId = {};
      lista.forEach(function (i, n) { i.ordem = n; i.chave = normalizar(i.nome); porId[i.id] = i; });
      return lista;
    }
    function preencherEquipes() {
      var sel = form.elements['equipe'], atual = sel.value, nomes = {};
      itens.forEach(function (i) { if (i.equipe) nomes[i.equipe] = 1; });
      var lista = Object.keys(nomes).sort(function (a, b) { return a.localeCompare(b, 'pt', { sensitivity: 'base' }); });
      sel.innerHTML = '<option value="">Todas as equipes</option>' + lista.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
      sel.value = lista.indexOf(atual) !== -1 ? atual : '';
    }

    function lerFiltros() {
      var f = form.elements, dir = form.querySelector('input[name="direcao"]:checked');
      return { busca: normalizar(f['pesquisa'].value), posicao: f['posicao'].value, equipe: f['equipe'].value, faixa: f['faixa'].value, ordem: f['ordem'].value, desc: !!dir && dir.value === 'desc' };
    }
    function filtrar(lista, f) {
      var palavras = f.busca ? f.busca.split(/\s+/) : [], min = 0, max = 99;
      if (f.faixa) { var p = f.faixa.split('-'); min = +p[0]; max = +p[1]; }
      return lista.filter(function (i) {
        for (var k = 0; k < palavras.length; k++) if (i.chave.indexOf(palavras[k]) === -1) return false;
        if (f.equipe && i.equipe !== f.equipe) return false;
        if (f.posicao && i.posicoes.indexOf(f.posicao) === -1) return false;
        if (f.faixa && !(typeof i.geral === 'number' && i.geral >= min && i.geral <= max)) return false;
        return true;
      });
    }
    function ordenar(lista, f) {
      var sentido = f.desc ? -1 : 1;
      return lista.slice().sort(function (a, b) {
        if (f.ordem === 'overall') {
          var d = (a.geral === null ? -1 : a.geral) - (b.geral === null ? -1 : b.geral);
          if (d) return d * sentido;
          return a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' });
        }
        if (f.ordem === 'nome') return a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' }) * sentido;
        return (a.ordem - b.ordem) * sentido;                       /* ordem da coleção (a mesma devolvida pela API) */
      });
    }

    function textoTotal(f) {
      var n = itens.length, filtrando = visiveis.length !== n;
      var carregados = n + (n === 1 ? ' jogador carregado' : ' jogadores carregados') + (demo ? ' (DEMONSTRAÇÃO)' : '');
      return filtrando ? 'Mostrando ' + visiveis.length + ' de ' + carregados : carregados;
    }
    function desenhar() {
      var f = lerFiltros();
      ultimaAssinatura = JSON.stringify(f);
      visiveis = ordenar(filtrar(itens, f), f);
      var parte = visiveis.slice(0, limite);
      grade.innerHTML = parte.map(function (i) { return cartaHtml(i, 'catalogo'); }).join('');
      grade.setAttribute('aria-busy', 'false');
      atualizarBotoesTime(grade);
      total.textContent = carregando && !itens.length ? 'Carregando…' : textoTotal(f);
      semResultados.textContent = (!visiveis.length && itens.length) ? 'Nenhum jogador encontrado com esses filtros. Tente outro nome ou clique em "Limpar filtros".' : '';
      var restantes = visiveis.length - parte.length;
      mais.hidden = restantes <= 0;
      if (restantes > 0) $('botao-mais').textContent = 'Mostrar mais (' + restantes + ' restantes)';
    }
    /* só redesenha quando os filtros mudaram de verdade (evita perder cliques); "Aplicar" força */
    function aplicar(forcar) {
      if (!forcar && JSON.stringify(lerFiltros()) === ultimaAssinatura) return;
      limite = POR_VEZ; desenhar();
    }

    function mostrarEstado(tipo, texto, comBotao) {
      estado.className = 'msg' + (tipo ? ' ' + tipo : '');
      estado.textContent = texto;
      tentar.hidden = !comBotao;
    }
    function irParaHash() {
      if (!location.hash || location.hash.indexOf('#carta-') !== 0) return;
      var id = decodeURIComponent(location.hash.slice('#carta-'.length)), pos = -1;
      for (var i = 0; i < visiveis.length; i++) if (String(visiveis[i].id) === id) { pos = i; break; }
      if (pos === -1) return;
      if (pos >= limite) { limite = Math.ceil((pos + 1) / POR_VEZ) * POR_VEZ; desenhar(); }
      var alvo = document.getElementById('carta-' + id);
      if (alvo) alvo.scrollIntoView();
    }

    function carregar(forcar) {
      grade.setAttribute('aria-busy', 'true');
      mostrarEstado('', 'Carregando jogadores da NBA…', false);
      carregando = true;
      if (!window.NBAApi) { carregando = false; demo = true; mostrarEstado('erro', 'O arquivo assets/js/api-nba.js não foi carregado. Exibindo cartas de DEMONSTRAÇÃO.', true); itens = montarItens(); preencherEquipes(); desenhar(); return; }
      window.NBAApi.listar({
        forcar: !!forcar,
        aoProgredir: function (n) { mostrarEstado('', 'Carregando jogadores da NBA… ' + n + ' recebidos até agora', false); }
      }).then(function (r) {
        api = r.jogadores; demo = false; totalApi = r.total;
        if (r.desatualizado) mostrarEstado('erro', 'Não foi possível atualizar agora (' + r.aviso + ') Mostrando os ' + api.length + ' jogadores salvos neste navegador.', true);
        else if (typeof totalApi === 'number' && totalApi > api.length) mostrarEstado('erro', 'A API informou ' + totalApi + ' jogadores, mas só ' + api.length + ' foram recebidos. Clique em "Tentar novamente".', true);
        else if (r.aviso) mostrarEstado('erro', r.aviso, true);
        else mostrarEstado('', '', false);
      }).catch(function (err) {
        api = []; demo = true;
        mostrarEstado('erro', ((err && err.mensagem) || 'Erro inesperado ao carregar os jogadores.') + ' Enquanto isso, o catálogo mostra os 12 jogadores de DEMONSTRAÇÃO (não vêm da API).', true);
      }).then(function () {
        carregando = false;
        itens = montarItens(); preencherEquipes(); desenhar(); irParaHash();
      });
    }

    /* eventos */
    tratarFalhaDeImagem(grade);
    ligarBotoesTime(grade, function (id) { return porId[id] || null; });
    form.addEventListener('input', function (e) {
      if (e.target.type !== 'search') return;
      window.clearTimeout(temporizador);
      temporizador = window.setTimeout(aplicar, 150);
    });
    form.addEventListener('change', function () { aplicar(false); });
    form.addEventListener('submit', function (e) { e.preventDefault(); window.clearTimeout(temporizador); aplicar(true); });
    form.addEventListener('reset', function () { window.clearTimeout(temporizador); window.setTimeout(function () { aplicar(true); }, 0); });
    $('botao-mais').addEventListener('click', function () { limite += POR_VEZ; desenhar(); });
    $('tentar-novamente').addEventListener('click', function () { carregar(true); });
    grade.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-excluir]') : null;
      if (!b) return;
      var id = b.getAttribute('data-excluir'), c = cartaPorId(id);
      if (!c) return;
      if (window.confirm('Excluir a carta de ' + c.nome + '? Ela também sai do Meu time. Essa ação não pode ser desfeita.')) {
        excluir(id); itens = montarItens(); preencherEquipes(); desenhar();
        avisar('Carta de ' + c.nome + ' excluída.', 'ok');
      }
    });

    itens = montarItens();
    desenhar();
    carregar(false);
  }

  /* ---------- detalhes ---------- */
  /* detalhes.html?jogador=<id>: ficha de um jogador da API (o endpoint individual traz as informações completas) */
  function iniciarDetalheApi(fichas, indice, id) {
    var aviso = $('aviso-detalhes');
    if (aviso) aviso.hidden = true;
    if (indice.parentNode) indice.parentNode.hidden = true;
    fichas.innerHTML = '';
    tratarFalhaDeImagem(fichas);
    var atual = null;
    ligarBotoesTime(fichas, function () { return atual; });
    function estado(tipo, texto) { fichas.innerHTML = '<p class="msg ' + tipo + '" role="status">' + esc(texto) + '</p><div class="botoes"><a href="catalogo.html">← Voltar ao catálogo</a></div>'; }
    function mostrar(basico, bruto) {
      atual = itemApi(basico);
      fichas.innerHTML = detalheApiHtml(basico, bruto);
      atualizarBotoesTime(fichas);
      document.title = basico.nome + ' | NBA ARISE';
    }
    estado('', 'Carregando jogador…');
    if (!window.NBAApi) return estado('erro', 'O arquivo assets/js/api-nba.js não foi carregado.');
    window.NBAApi.detalhe(id).then(function (r) {
      mostrar(r.basico, r.bruto);
    }).catch(function (err) {
      var msg = (err && err.mensagem) || 'Erro inesperado ao carregar o jogador.';
      var basico = err && err.codigo !== 'NAO_ENCONTRADO' ? window.NBAApi.daLista(id) : null;
      if (!basico) {
        /* sem cache da lista: tenta pelo Meu time, que guarda uma cópia da carta */
        var snap = window.NBATime && window.NBATime.listar().filter(function (x) { return x.id === id; })[0];
        if (snap) { atual = snap; fichas.innerHTML = '<p class="msg erro" role="status">' + esc(msg) + ' Mostrando a cópia guardada no seu time.</p>' + cartaHtml(snap, 'time'); atualizarBotoesTime(fichas); return; }
        return estado('erro', msg);
      }
      mostrar(basico, null);
      if (err.codigo !== 'SEM_CHAVE') fichas.insertAdjacentHTML('afterbegin', '<p class="msg erro" role="status">' + esc(msg) + ' Mostrando só os dados da listagem.</p>');
      else fichas.insertAdjacentHTML('afterbegin', '<p class="msg" role="status">A ficha completa depende de uma chave da API (veja assets/js/config.js). Mostrando os dados da listagem.</p>');
    });
  }

  function iniciarDetalhes() {
    var fichas = $('fichas'), indice = $('indice-cartas');
    if (!fichas || !indice) return;
    var param = new URLSearchParams(location.search).get('jogador');
    if (param) return iniciarDetalheApi(fichas, indice, param);
    var lista = personalizadas().map(itemCustom), porId = {};
    var hash = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
    if (hash.indexOf('demo-') === 0) { var d = demoItens().filter(function (i) { return i.id === hash; })[0]; if (d) lista.unshift(d); }
    lista.forEach(function (i) { porId[i.id] = i; });
    var aviso = $('aviso-detalhes');
    if (!lista.length) {
      if (aviso) aviso.hidden = true;
      fichas.innerHTML = '<p class="msg">Ainda não há cartas suas para detalhar. Os jogadores da API têm ficha própria: abra o <a href="catalogo.html">catálogo</a> e clique em "Ver detalhes". Para criar uma carta, use <a href="cadastro-carta.html">Nova carta</a>.</p>';
      indice.parentNode.hidden = true;
      return;
    }
    if (aviso) aviso.innerHTML = '<strong>Suas cartas</strong><p>Esta página mostra as cartas criadas por você em "Nova carta". Os atributos são os que você cadastrou. Para ver a ficha de um jogador da NBA, use "Ver detalhes" no catálogo.</p>';
    tratarFalhaDeImagem(fichas);
    ligarBotoesTime(fichas, function (id) { return porId[id] || null; });
    fichas.insertAdjacentHTML('beforeend', lista.map(detalheItemHtml).join(''));
    indice.innerHTML = lista.map(function (c) { return '<li><a href="#' + esc(c.id) + '">' + esc(c.nome) + '</a></li>'; }).join('');
    atualizarBotoesTime(fichas);
    if (hash) { var alvo = document.getElementById(hash); if (alvo) alvo.scrollIntoView(); }
  }

  /* ---------- Meu time ---------- */
  function iniciarMeuTime() {
    var grade = $('grade-time');
    if (!grade || !window.NBATime) return;
    var vazio = $('time-vazio'), contador = $('contador-time'), formTime = $('form-time'), msgTime = $('msg-time'), tituloTime = $('nome-time');
    var corpo = $('corpo-titulares'), itens = [], porId = {};
    var SIGLAS = window.NBATime.POSICOES;

    function render() {
      var snaps = window.NBATime.listar(), perdidos = [];
      itens = []; porId = {};
      snaps.forEach(function (s) { var i = materializar(s); if (i) { itens.push(i); porId[i.id] = i; } else perdidos.push(s.id); });
      if (perdidos.length) { perdidos.forEach(function (id) { window.NBATime.remover(id); }); return; }    /* dispara novo render */
      var n = itens.length;
      contador.textContent = n + (n === 1 ? ' JOGADOR NO TIME' : ' JOGADORES NO TIME');
      vazio.hidden = n > 0;
      $('limpar-time').hidden = !n;
      grade.hidden = !n;
      grade.innerHTML = itens.map(function (i) { return cartaHtml(i, 'time'); }).join('');
      var cfg = window.NBATime.config();
      tituloTime.textContent = cfg.nome;
      if (document.activeElement !== formTime.elements['nome-equipe']) formTime.elements['nome-equipe'].value = cfg.nome;
      if (document.activeElement !== formTime.elements['estrategia']) formTime.elements['estrategia'].value = cfg.estrategia;
      SIGLAS.forEach(function (sg) {
        var sel = $('titular-' + sg), atual = cfg.titulares[sg] || '';
        var op = itens.filter(function (i) { return i.posicoes.indexOf(sg) !== -1; });
        sel.innerHTML = '<option value="">' + (op.length ? '— Escolha um titular —' : '— Sem jogador na posição —') + '</option>' +
          op.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.nome) + ' (GER ' + esc(i.geral === null ? '—' : i.geral) + ')</option>'; }).join('');
        sel.value = op.some(function (i) { return i.id === atual; }) ? atual : '';
        sel.disabled = !op.length;
      });
      desenharTitulares(cfg.titulares);
    }
    function desenharTitulares(tit) {
      corpo.innerHTML = SIGLAS.map(function (sg) {
        var i = tit[sg] && porId[tit[sg]];
        return '<tr><th scope="row">' + esc(POSICOES[sg] + ' (' + sg + ')') + '</th><td>' + (i ? '<a href="' + esc(i.href) + '">' + esc(i.nome) + '</a>' : '<span class="ajuda">Vaga em aberto</span>') + '</td><td>' + (i ? esc(i.geral === null ? '—' : i.geral) : '—') + '</td></tr>';
      }).join('');
      var cheios = SIGLAS.filter(function (sg) { return tit[sg] && porId[tit[sg]]; }).length;
      $('selo-quinteto').textContent = cheios + ' / 5 TITULARES';
    }

    tratarFalhaDeImagem(grade);
    ligarBotoesTime(grade, function (id) { return porId[id] || null; });
    window.addEventListener('nbatime:mudou', render);

    $('limpar-time').addEventListener('click', function () {
      if (!window.NBATime.contar()) return;
      if (window.confirm('Remover todos os jogadores do time? Essa ação não pode ser desfeita.')) { window.NBATime.limpar(); avisar('Todos os jogadores foram removidos do time.', 'ok'); }
    });
    formTime.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = formTime.elements, tit = {}, usados = {}, repetido = false;
      SIGLAS.forEach(function (sg) {
        var v = $('titular-' + sg).value;
        if (v) { if (usados[v]) repetido = true; usados[v] = 1; tit[sg] = v; }
      });
      function falhar(t) { msgTime.className = 'msg erro'; msgTime.textContent = t; }
      if (!f['nome-equipe'].value.trim()) return falhar('Dê um nome ao time.');
      if (repetido) return falhar('O mesmo jogador não pode ocupar duas posições. Ajuste os titulares.');
      if (!window.NBATime.salvarConfig({ nome: f['nome-equipe'].value, estrategia: f['estrategia'].value, titulares: tit })) return falhar('Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado.');
      msgTime.className = 'msg ok'; msgTime.textContent = 'Time salvo! Nome, estratégia e titulares foram guardados neste navegador.';
    });
    render();
  }

  /* ---------- roleta: itens disponíveis (API em cache ou carregada agora + suas cartas) ---------- */
  function itensParaRoleta() {
    function montar(jogs) {
      var l = jogs.map(itemApi); personalizadas().forEach(function (c) { l.push(itemCustom(c)); });
      return { itens: l, demo: false };
    }
    function demoOuCustom() {
      var l = demoItens(); personalizadas().forEach(function (c) { l.push(itemCustom(c)); });
      return { itens: l, demo: true };
    }
    if (!window.NBAApi) return Promise.resolve(demoOuCustom());
    var cache = window.NBAApi.doCache();
    if (cache.length) return Promise.resolve(montar(cache));
    return window.NBAApi.listar().then(function (r) { return montar(r.jogadores); }, function () { return demoOuCustom(); });
  }

  function iniciar() { iniciarCadastro(); iniciarEdicao(); iniciarCatalogo(); iniciarDetalhes(); iniciarMeuTime(); }

  window.NBACartas = {
    todas: todas, fixas: fixas, personalizadas: personalizadas, salvar: salvar, atualizar: atualizar, excluir: excluir,
    imagemDe: imagemDe, imagemProvisoria: imagemProvisoria,
    cartaHtml: cartaHtml, itensParaRoleta: itensParaRoleta, ligarBotoesTime: ligarBotoesTime, atualizarBotoesTime: atualizarBotoesTime,
    tratarFalhaDeImagem: tratarFalhaDeImagem, avisar: avisar
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();