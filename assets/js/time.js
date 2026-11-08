/* ==========================================================================
   NBA ARISE — "Meu time" (armazenamento ÚNICO, compartilhado por todas as páginas)
   Tudo fica em UMA chave do localStorage ("nbaarise_meutime"):
     { v: 1, nome, estrategia, titulares: { PG: id, ... }, itens: [ carta, ... ] }
   - Cada item é uma cópia ("snapshot") da carta no momento em que foi adicionada,
     com id único, nome, equipe, posições, overall, fotos e atributos. Assim o
     Meu time continua mostrando o jogador mesmo sem internet ou sem a API.
   - Catálogo, Detalhes, Roleta e Meu time só usam as funções de window.NBATime;
     nenhuma página mantém uma lista própria.
   - Sempre que o time muda, o evento "nbatime:mudou" é disparado (também entre abas).
   - Este arquivo também mostra o contador de jogadores no menu ("Meu time (3)").
   ========================================================================== */
(function () {
  'use strict';

  var CHAVE = 'nbaarise_meutime';
  var POSICOES = ['PG', 'SG', 'SF', 'PF', 'C'];
  var memoria = null;   /* usado só quando o navegador bloqueia o localStorage */

  function padrao() { return { v: 1, nome: 'Arise Stars', estrategia: '', titulares: {}, itens: [] }; }

  function ler() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { d = memoria; }
    if (!d || typeof d !== 'object' || !Array.isArray(d.itens)) d = memoria || padrao();
    if (!d.titulares || typeof d.titulares !== 'object') d.titulares = {};
    if (typeof d.nome !== 'string' || !d.nome.trim()) d.nome = 'Arise Stars';
    if (typeof d.estrategia !== 'string') d.estrategia = '';
    return d;
  }
  function gravar(d) {
    memoria = d;
    var ok = true;
    try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch (e) { ok = false; }
    avisar();
    return ok;
  }
  function avisar() {
    try { window.dispatchEvent(new CustomEvent('nbatime:mudou')); } catch (e) { /* ignora */ }
  }

  function listar() { return ler().itens.slice(); }
  function contar() { return ler().itens.length; }
  function tem(id) {
    var l = ler().itens;
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return true;
    return false;
  }

  /* item = carta (objeto simples, serializável) com pelo menos { id, nome }.
     Devolve { ok:true } ou { ok:false, motivo:'repetido'|'invalido'|'armazenamento' } */
  function adicionar(item) {
    if (!item || !item.id || !item.nome) return { ok: false, motivo: 'invalido' };
    var d = ler();
    for (var i = 0; i < d.itens.length; i++) if (d.itens[i].id === item.id) return { ok: false, motivo: 'repetido' };
    var copia = JSON.parse(JSON.stringify(item));
    copia.adicionadoEm = Date.now();
    d.itens.push(copia);
    if (!gravar(d)) { d.itens.pop(); memoria = d; return { ok: false, motivo: 'armazenamento' }; }
    return { ok: true };
  }

  function remover(id) {
    var d = ler(), antes = d.itens.length;
    d.itens = d.itens.filter(function (i) { return i.id !== id; });
    POSICOES.forEach(function (p) { if (d.titulares[p] === id) delete d.titulares[p]; });
    if (d.itens.length === antes) return false;
    gravar(d);
    return true;
  }

  function limpar() {
    var d = ler(); d.itens = []; d.titulares = {};
    gravar(d);
  }

  /* troca a cópia guardada (usado quando uma carta criada pelo usuário é editada) */
  function atualizarItem(id, novo) {
    var d = ler(), mudou = false;
    d.itens = d.itens.map(function (i) {
      if (i.id !== id) return i;
      mudou = true;
      var c = JSON.parse(JSON.stringify(novo)); c.adicionadoEm = i.adicionadoEm; return c;
    });
    if (mudou) gravar(d);
  }

  function config() { var d = ler(); return { nome: d.nome, estrategia: d.estrategia, titulares: d.titulares }; }
  function salvarConfig(c) {
    var d = ler();
    if (typeof c.nome === 'string' && c.nome.trim()) d.nome = c.nome.trim().slice(0, 40);
    if (typeof c.estrategia === 'string') d.estrategia = c.estrategia.slice(0, 500);
    if (c.titulares && typeof c.titulares === 'object') {
      d.titulares = {};
      POSICOES.forEach(function (p) { if (c.titulares[p]) d.titulares[p] = c.titulares[p]; });
    }
    return gravar(d);
  }

  /* ---------- contador no menu ---------- */
  function atualizarMenu() {
    var link = document.querySelector('nav a[href$="meutime.html"]');
    if (!link) return;
    var span = link.querySelector('.contador-nav');
    if (!span) { span = document.createElement('span'); span.className = 'contador-nav'; link.appendChild(span); }
    var n = contar();
    span.textContent = n ? String(n) : '';
    span.hidden = !n;
    link.setAttribute('aria-label', 'Meu time' + (n ? ' (' + n + (n === 1 ? ' jogador)' : ' jogadores)') : ''));
  }

  window.addEventListener('storage', function (e) { if (e.key === CHAVE) avisar(); });
  window.addEventListener('nbatime:mudou', atualizarMenu);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', atualizarMenu);
  else atualizarMenu();

  window.NBATime = {
    listar: listar, contar: contar, tem: tem, adicionar: adicionar, remover: remover, limpar: limpar,
    atualizarItem: atualizarItem, config: config, salvarConfig: salvarConfig, POSICOES: POSICOES
  };
})();