/* ==========================================================================
   NBA ARISE — pré-carregamento das fontes
   O navegador só baixa cada peso de fonte quando um texto o usa pela primeira
   vez, o que causa uma "troca de fonte" visível ao clicar em algo novo.
   Aqui pedimos todos os pesos usados pelo site logo que a página abre.
   ========================================================================== */
(function () {
  'use strict';
  if (!document.fonts || !document.fonts.load) return;
  ['600 1em "Barlow Condensed"', '700 1em "Barlow Condensed"', '800 1em "Barlow Condensed"',
   '400 1em "Barlow"', '500 1em "Barlow"', '600 1em "Barlow"'].forEach(function (f) {
    document.fonts.load(f).catch(function () { /* sem internet: usa a fonte reserva */ });
  });
})();