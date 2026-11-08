/* ==========================================================================
   NBA ARISE — cartas criadas pelo usuário (camada de dados compartilhada)
   - Os 12 jogadores fixos vêm de assets/js/jogadores.js (window.JOGADORES).
   - As cartas cadastradas em "Nova carta" ficam no localStorage, neste
     navegador (chave "nbaarise_cartas"), e são somadas às fixas.
   - A foto escolhida NÃO é gravada como arquivo (um site estático não
     consegue escrever na pasta do projeto): ela é lida, reduzida e guardada
     como texto (data URL) junto com a carta.
   Este arquivo também liga o comportamento das páginas: cadastro, catálogo,
   detalhes e Meu time (cada bloco só roda se a página tiver o elemento).
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
  function validar(d) {
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
    return gravar(lista);
  }

  /* ---------- HTML das cartas (mesmas classes do catálogo estático) ---------- */
  function statsHtml(c) {
    return '<dl class="stats"><div><dt>ARREMESSO</dt><dd>' + c.arremesso + '</dd></div><div><dt>DEFESA</dt><dd>' + c.defesa + '</dd></div>' +
      '<div><dt>PASSE</dt><dd>' + c.passe + '</dd></div><div><dt>VELOCIDADE</dt><dd>' + c.velocidade + '</dd></div></dl>';
  }
  function numeroDe(c) { return ('0' + c.numero).slice(-3).replace(/^0(\d\d)$/, '$1'); }
  function cartaCatalogoHtml(c) {
    var im = imagemDe(c), nome = esc(c.nome), id = esc(c.id);
    return '<article class="carta" id="carta-' + id + '" data-personalizada="1">' +
      '<div class="carta-topo"><span>' + esc(c.sigla) + ' · ' + esc(c.posicao) + '</span><strong>' + c.geral + ' <small>GER</small></strong></div>' +
      '<img src="' + esc(im.src) + '" alt="' + esc(im.alt) + '" width="640" height="360" loading="lazy">' +
      '<div class="carta-corpo"><p class="numero">COLEÇÃO 01 / CARTA ' + numeroDe(c) + ' · SUA CARTA</p><h3>' + nome + '</h3><p class="clube">' + esc(c.equipe) + '</p>' +
      statsHtml(c) +
      '<a class="link-detalhe" href="detalhes.html#' + id + '">Ver detalhes <span aria-hidden="true">↗</span></a>' +
      '<div class="acoes"><button type="button" disabled>Adicionar ao time</button>' +
      '<button type="button" disabled aria-label="Editar carta de ' + nome + ' (indisponível nesta etapa)">Editar</button>' +
      '<button type="button" class="secundario" data-excluir="' + id + '" aria-label="Excluir carta de ' + nome + '">Excluir</button></div></div></article>';
  }
  function detalheHtml(c) {
    var im = imagemDe(c), nome = esc(c.nome), id = esc(c.id);
    return '<article class="painel detalhe-carta" id="' + id + '" aria-labelledby="nome-' + id + '" data-personalizada="1">' +
      '<img src="' + esc(im.src) + '" alt="' + esc(im.alt) + '" width="640" height="360" loading="lazy">' +
      '<p class="numero">COLEÇÃO 01 / CARTA ' + numeroDe(c) + ' · SUA CARTA</p><h2 id="nome-' + id + '">' + nome + '</h2>' +
      '<dl class="ficha"><div><dt>Nome completo</dt><dd>' + esc(c.completo || c.nome) + '</dd></div><div><dt>Posição</dt><dd>' + esc(c.sigla) + ' · ' + esc(c.posicao) + '</dd></div>' +
      '<div><dt>Equipe</dt><dd>' + esc(c.equipe) + '</dd></div><div><dt>Overall (GER)</dt><dd>' + c.geral + '</dd></div>' +
      '<div><dt>Raridade</dt><dd>' + esc(c.raridade || '—') + '</dd></div></dl>' +
      '<h3>Atributos</h3>' + statsHtml(c) +
      (c.descricao ? '<h3>Estilo de jogo</h3><p>' + esc(c.descricao) + '</p>' : '') +
      '<div class="botoes"><a href="catalogo.html#carta-' + id + '">← Voltar ao catálogo</a><a href="#conteudo">Ir ao topo</a></div></article>';
  }

  /* ---------- páginas ---------- */
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
      var dados = {
        nome: f['jogador'].value, equipe: f['equipe'].value, posicao: f['posicao'].value, numero: f['numero-carta'].value,
        raridade: f['raridade'].value, geral: f['geral'].value, arremesso: f['arremesso'].value, defesa: f['defesa'].value,
        passe: f['passe'].value, velocidade: f['velocidade'].value, descricao: f['descricao'].value
      };
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
        mostrar('ok', 'Carta de ' + r.carta.nome + ' salva! Ela já aparece no catálogo, na roleta e no Meu time.', { href: 'catalogo.html#carta-' + r.carta.id, texto: 'Ver no catálogo →' });
      }).catch(function (err) {
        mostrar('erro', err.message || 'Não foi possível salvar a carta.');
      }).then(function () { botao.disabled = false; });
    });
  }

  function iniciarCatalogo() {
    var grade = $('grade-cartas');
    if (!grade) return;
    function desenhar() {
      var antigas = grade.querySelectorAll('[data-personalizada]');
      for (var i = 0; i < antigas.length; i++) antigas[i].parentNode.removeChild(antigas[i]);
      var lista = personalizadas();
      grade.insertAdjacentHTML('beforeend', lista.map(cartaCatalogoHtml).join(''));
      var total = $('total-cartas');
      if (total) total.textContent = (fixas().length + lista.length) + ' cartas disponíveis';
    }
    grade.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-excluir]') : null;
      if (!b) return;
      var id = b.getAttribute('data-excluir');
      var c = personalizadas().filter(function (x) { return x.id === id; })[0];
      if (!c) return;
      if (window.confirm('Excluir a carta de ' + c.nome + '? Essa ação não pode ser desfeita.')) {
        excluir(id); desenhar();
      }
    });
    desenhar();
    if (location.hash) { var alvo = document.getElementById(location.hash.slice(1)); if (alvo) alvo.scrollIntoView(); }
  }

  function iniciarDetalhes() {
    var fichas = $('fichas'), indice = $('indice-cartas');
    if (!fichas || !indice) return;
    var lista = personalizadas();
    fichas.insertAdjacentHTML('beforeend', lista.map(detalheHtml).join(''));
    indice.insertAdjacentHTML('beforeend', lista.map(function (c) { return '<li><a href="#' + esc(c.id) + '">' + esc(c.nome) + '</a></li>'; }).join(''));
    if (location.hash) { var alvo = document.getElementById(location.hash.slice(1)); if (alvo) alvo.scrollIntoView(); }
  }

  function iniciarMeuTime() {
    personalizadas().forEach(function (c) {
      var sel = $('titular-' + c.sigla);
      if (!sel) return;
      var o = document.createElement('option');
      o.value = c.id; o.textContent = c.nome + ' (sua carta)';
      sel.appendChild(o);
    });
  }

  function iniciar() { iniciarCadastro(); iniciarCatalogo(); iniciarDetalhes(); iniciarMeuTime(); }

  window.NBACartas = { todas: todas, fixas: fixas, personalizadas: personalizadas, salvar: salvar, excluir: excluir, imagemDe: imagemDe, imagemProvisoria: imagemProvisoria };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();