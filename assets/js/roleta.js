/* ==========================================================================
   NBA ARISE — Roleta NBA
   1) O sorteio é decidido ANTES (índice aleatório de verdade).
   2) A roda gira até o ponteiro (fixo no topo) parar na fatia sorteada.
   3) Só no fim da animação a carta é revelada.
   Os jogadores vêm de assets/js/jogadores.js (window.JOGADORES).
   ========================================================================== */
(function () {
  'use strict';

  var JOGADORES = [];   /* preenchido em iniciar(): cartas fixas + cartas criadas pelo usuário */
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

  /* ---------- carta sorteada (mesmas classes do catálogo) ---------- */
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function imagemProvisoria(nome) {
    var ini = nome.split(' ').slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase();
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360' width='640' height='360'>" +
      "<rect width='640' height='360' fill='#141d16'/>" +
      "<path d='M0 360L220 0h90L90 360zM260 360L480 0h90L350 360z' fill='#182319'/>" +
      "<text x='320' y='235' fill='#223127' font-family='Arial Narrow,Arial,sans-serif' font-size='190' font-weight='700' text-anchor='middle'>" + esc(ini) + "</text>" +
      "<text x='320' y='320' fill='#7d8a80' font-family='Arial,sans-serif' font-size='16' text-anchor='middle'>FOTO PENDENTE · " + esc(nome.toUpperCase()) + "</text></svg>";
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function cartaHtml(j) {
    var num = ('0' + j.numero).slice(-2);
    var im = window.NBACartas ? window.NBACartas.imagemDe(j) : { src: imagemProvisoria(j.nome), alt: 'Imagem provisória da carta de ' + j.nome };
    return '<article class="carta carta-sorteada" id="carta-' + esc(j.id) + '">' +
      '<div class="carta-topo"><span>' + esc(j.sigla) + ' · ' + esc(j.posicao) + '</span><strong>' + j.geral + ' <small>GER</small></strong></div>' +
      '<img src="' + esc(im.src) + '" alt="' + esc(im.alt) + '" width="640" height="360">' +
      '<div class="carta-corpo"><p class="numero">COLEÇÃO 01 / CARTA ' + num + '</p><h3>' + esc(j.nome) + '</h3><p class="clube">' + esc(j.equipe) + '</p>' +
      '<dl class="stats"><div><dt>ARREMESSO</dt><dd>' + j.arremesso + '</dd></div><div><dt>DEFESA</dt><dd>' + j.defesa + '</dd></div>' +
      '<div><dt>PASSE</dt><dd>' + j.passe + '</dd></div><div><dt>VELOCIDADE</dt><dd>' + j.velocidade + '</dd></div></dl>' +
      '<a class="link-detalhe" href="detalhes.html#' + esc(j.id) + '">Ver detalhes <span aria-hidden="true">↗</span></a></div></article>';
  }

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
      li.textContent = item.nome + ' — ' + item.sigla + ' · GER ' + item.geral;
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
    var fatias = document.querySelectorAll('#roda .fatia');
    for (var i = 0; i < fatias.length; i++) fatias[i].classList.toggle('fatia-ganha', i === indice);
    var h = lerHistorico();
    h.unshift({ nome: j.nome, sigla: j.sigla, geral: j.geral });
    guardarHistorico(h.slice(0, 5));
    mostrarHistorico();
    var msg = $('roleta-msg');
    msg.className = 'msg ok';
    msg.textContent = 'Sorteado: ' + j.nome + ' (' + j.sigla + ', GER ' + j.geral + ').';
    girando = false;
    $('girar').disabled = false;
    $('novamente').disabled = false;
    $('novamente').hidden = false;
  }

  function girar() {
    if (girando || JOGADORES.length < 2) return;
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
    JOGADORES = window.NBACartas ? window.NBACartas.todas() : (window.JOGADORES || []);
    var msg = $('roleta-msg');
    if (JOGADORES.length < 2) {
      msg.className = 'msg erro';
      msg.textContent = 'Adicione jogadores em assets/js/jogadores.js antes de realizar o sorteio.';
      $('girar').disabled = true;
      return;
    }
    desenharRoda();
    mostrarHistorico();
    $('girar').addEventListener('click', girar);
    $('novamente').addEventListener('click', girar);
  }

  /* usado nos testes automáticos */
  window.NBARoleta = { sortearIndice: sortearIndice, fatiaSobPonteiro: fatiaSobPonteiro, angulo: angulo };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();