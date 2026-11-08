/* ==========================================================================
   NBA ARISE — Roleta NBA
   1) O sorteio é decidido ANTES (índice aleatório de verdade).
   2) A roda gira até o ponteiro (fixo no topo) parar na fatia sorteada.
   3) Só no fim da animação a carta é revelada.
   Os jogadores sorteáveis vêm da mesma fonte do catálogo: a lista da API NBA 2K
   (cache em NBAApi) + as cartas criadas em "Nova carta". Se a API estiver
   indisponível e não houver cache, a roleta usa os 12 jogadores de DEMONSTRAÇÃO
   de assets/js/jogadores.js. Quando há mais de 12 jogadores, cada giro monta uma
   roda com 12 nomes escolhidos ao acaso e sorteia entre eles (todo jogador tem
   a mesma chance de aparecer). A carta sorteada pode ser adicionada ao Meu time.
   ========================================================================== */
(function () {
  'use strict';

  var FATIAS = 12;      /* nomes na roda a cada giro */
  var POOL = [];        /* todos os jogadores sorteáveis (itens de carta, ver cartas.js) */
  var JOGADORES = [];   /* os que estão na roda agora */
  var porId = {};
  var CHAVE_HISTORICO = 'nbaarise_historico';
  var DURACAO_MS = 5500;      /* precisa ser igual ao "transition" de .roda-giro no CSS */
  var VOLTAS = 5;             /* voltas completas antes de parar */
  var rotacao = 0;            /* rotação acumulada da roda, em graus */
  var girando = false;

  function $(id) { return document.getElementById(id); }
  function reduzirMovimento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- sorteio aleatório real ---------- */
  function sortearIndice(n) {
    if (window.crypto && window.crypto.getRandomValues) {
      var limite = Math.floor(4294967296 / n) * n, a = new Uint32Array(1);
      do { window.crypto.getRandomValues(a); } while (a[0] >= limite); /* evita viés */
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  /* ---------- desenho da roda (SVG) ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  function ponto(raio, grausDoTopo) {
    var rad = (grausDoTopo - 90) * Math.PI / 180;
    return [200 + raio * Math.cos(rad), 200 + raio * Math.sin(rad)];
  }
  function sobrenome(nome) { var p = nome.split(' '); return p[p.length - 1]; }

  function desenharRoda() {
    var svg = $('roda'), n = JOGADORES.length, passo = 360 / n;
    svg.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var a = ponto(190, i * passo), b = ponto(190, (i + 1) * passo);
      var fatia = document.createElementNS(NS, 'path');
      fatia.setAttribute('d', 'M200 200 L' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) +
        ' A190 190 0 0 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2) + ' Z');
      fatia.setAttribute('class', 'fatia ' + (i % 2 ? 'fatia-b' : 'fatia-a'));
      fatia.setAttribute('data-indice', i);
      svg.appendChild(fatia);

      var texto = document.createElementNS(NS, 'text');
      var centro = i * passo + passo / 2;
      texto.setAttribute('x', 200);
      texto.setAttribute('y', 200);
      texto.setAttribute('dx', 52);
      texto.setAttribute('dy', 5);
      texto.setAttribute('transform', 'rotate(' + (centro - 90) + ' 200 200)');
      texto.setAttribute('class', 'fatia-nome');
      if (n > 12) texto.setAttribute('style', 'font-size:' + (n <= 16 ? 15 : n <= 22 ? 12 : 10) + 'px');
      texto.textContent = sobrenome(JOGADORES[i].nome);
      svg.appendChild(texto);
    }
    var hub = document.createElementNS(NS, 'circle');
    hub.setAttribute('cx', 200); hub.setAttribute('cy', 200); hub.setAttribute('r', 24);
    hub.setAttribute('class', 'roda-centro');
    svg.appendChild(hub);
  }

  /* ---------- carta sorteada (mesmo desenho do catálogo, com o botão "Adicionar ao time") ---------- */
  function cartaHtml(j) { return window.NBACartas.cartaHtml(j, 'roleta'); }

  /* ---------- histórico ---------- */
  function lerHistorico() {
    try { return JSON.parse(localStorage.getItem(CHAVE_HISTORICO)) || []; } catch (e) { return []; }
  }
  function guardarHistorico(lista) {
    try { localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(lista)); } catch (e) { /* ignora */ }
  }
  function mostrarHistorico() {
    var ol = $('historico'), h = lerHistorico();
    ol.innerHTML = '';
    if (!h.length) { ol.innerHTML = '<li class="ajuda">Ainda não há sorteios.</li>'; return; }
    h.forEach(function (item) {
      var li = document.createElement('li');
      li.textContent = item.nome + ' — ' + item.sigla + ' · GER ' + (item.geral === null || item.geral === undefined ? '—' : item.geral);
      ol.appendChild(li);
    });
  }

  /* ---------- giro ---------- */
  function angulo(elemento) {
    var m = window.getComputedStyle(elemento).transform;
    if (!m || m === 'none') return 0;
    var v = m.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
    return (Math.atan2(v[1], v[0]) * 180 / Math.PI + 360) % 360;
  }
  /* qual fatia está sob o ponteiro (topo) para uma rotação da roda */
  function fatiaSobPonteiro(graus) {
    var passo = 360 / JOGADORES.length;
    return Math.floor((((360 - (graus % 360)) % 360) / passo)) % JOGADORES.length;
  }

  function revelar(indice) {
    var j = JOGADORES[indice];
    $('carta-sorteada').innerHTML = cartaHtml(j);
    window.NBACartas.atualizarBotoesTime($('carta-sorteada'));
    var fatias = document.querySelectorAll('#roda .fatia');
    for (var i = 0; i < fatias.length; i++) fatias[i].classList.toggle('fatia-ganha', i === indice);
    var h = lerHistorico();
    h.unshift({ nome: j.nome, sigla: j.posicoes[0] || '—', geral: j.geral });
    guardarHistorico(h.slice(0, 5));
    mostrarHistorico();
    var msg = $('roleta-msg');
    msg.className = 'msg ok';
    msg.textContent = 'Sorteado: ' + j.nome + ' (' + (j.posicoes[0] || '—') + ', GER ' + (j.geral === null ? '—' : j.geral) + '). Clique em "Adicionar ao time" para guardá-lo.';
    girando = false;
    $('roda-giro').classList.remove('girando');
    $('girar').disabled = false;
    $('novamente').disabled = false;
    $('novamente').hidden = false;
  }

  /* escolhe (sem repetir) até 12 jogadores do conjunto total para a roda deste giro */
  function montarRoda() {
    var copia = POOL.slice(), roda = [];
    while (roda.length < FATIAS && copia.length) roda.push(copia.splice(sortearIndice(copia.length), 1)[0]);
    JOGADORES = roda;
    desenharRoda();
  }

  function girar() {
    if (girando || POOL.length < 2) return;
    if (POOL.length > FATIAS || !JOGADORES.length) montarRoda();
    girando = true;
    $('girar').disabled = true;
    $('novamente').disabled = true;
    var msg = $('roleta-msg');
    msg.className = 'msg';
    msg.textContent = 'Girando…';

    var n = JOGADORES.length, passo = 360 / n;
    var indice = sortearIndice(n);
    var folga = (Math.random() * 0.7 - 0.35) * passo;          /* para onde dentro da fatia o ponteiro para */
    var alvoNaVolta = (360 - (indice * passo + passo / 2 + folga) + 360) % 360;
    var base = Math.ceil(rotacao / 360) * 360;                  /* sempre gira para frente */
    var novaRotacao = base + VOLTAS * 360 + alvoNaVolta;
    var giro = $('roda-giro');
    giro.classList.add('girando');
    var terminou = false;

    function fim() {
      if (terminou) return;
      terminou = true;
      giro.removeEventListener('transitionend', aoTerminar);
      rotacao = novaRotacao;
      revelar(indice);
    }
    function aoTerminar(e) { if (e.target === giro && e.propertyName === 'transform') fim(); }

    if (reduzirMovimento()) {
      giro.style.transition = 'none';
      giro.style.transform = 'rotate(' + novaRotacao + 'deg)';
      fim();
      return;
    }
    giro.style.transition = '';
    giro.addEventListener('transitionend', aoTerminar);
    window.setTimeout(fim, DURACAO_MS + 700);                   /* garantia caso o evento não dispare */
    giro.style.transform = 'rotate(' + novaRotacao + 'deg)';
  }

  /* ---------- início ---------- */
  function iniciar() {
    if (!$('roda')) return;
    var msg = $('roleta-msg');
    $('girar').disabled = true;
    $('girar').addEventListener('click', girar);
    $('novamente').addEventListener('click', girar);
    mostrarHistorico();
    if (!window.NBACartas) { msg.className = 'msg erro'; msg.textContent = 'O arquivo assets/js/cartas.js não foi carregado.'; return; }
    window.NBACartas.tratarFalhaDeImagem($('carta-sorteada'));
    window.NBACartas.ligarBotoesTime($('carta-sorteada'), function (id) { return porId[id] || null; });
    msg.className = 'msg'; msg.textContent = 'Carregando jogadores…';
    window.NBACartas.itensParaRoleta().then(function (r) {
      POOL = r.itens; porId = {};
      POOL.forEach(function (i) { porId[i.id] = i; });
      if (POOL.length < 2) {
        msg.className = 'msg erro';
        msg.textContent = 'São necessários pelo menos 2 jogadores para sortear. Abra o catálogo para carregar os jogadores ou crie cartas em "Nova carta".';
        return;
      }
      montarRoda();
      $('girar').disabled = false;
      msg.className = r.demo ? 'msg erro' : 'msg';
      msg.textContent = r.demo
        ? 'A API não respondeu: a roleta está usando jogadores de DEMONSTRAÇÃO. Abra o catálogo e tente novamente mais tarde.'
        : POOL.length + ' jogadores disponíveis para o sorteio. Clique em GIRAR ROLETA.';
      if (document.fonts && document.fonts.ready) {
        /* a fonte do site pode terminar de carregar depois do desenho: redesenha a roda sem perder o destaque */
        document.fonts.ready.then(function () { if (!girando) { var g = document.querySelector('#roda .fatia-ganha'); var i = g ? g.getAttribute('data-indice') : null; desenharRoda(); if (i !== null) document.querySelectorAll('#roda .fatia')[i].classList.add('fatia-ganha'); } });
      }
    });
  }

  /* usado nos testes automáticos */
  window.NBARoleta = { sortearIndice: sortearIndice, fatiaSobPonteiro: fatiaSobPonteiro, angulo: angulo };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
