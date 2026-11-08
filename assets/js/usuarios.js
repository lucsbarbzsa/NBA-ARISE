/* ==========================================================================
   NBA ARISE — cadastro e login LOCAIS (demonstração)
   Os dados ficam só no localStorage deste navegador. Não existe servidor,
   então NÃO é uma autenticação segura. A senha nunca é guardada em texto
   puro: guardamos um hash SHA-256 com "salt" (valor aleatório por usuário).
   Este arquivo roda em todas as páginas para atualizar o cabeçalho
   ("Olá, nome" + botão Sair) e, na página login.html, trata os formulários.
   ========================================================================== */
(function () {
  'use strict';

  var CHAVE_USUARIOS = 'nbaarise_usuarios';
  var CHAVE_SESSAO = 'nbaarise_sessao';
  var REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------- armazenamento ---------- */
  function ler(chave, padrao) {
    try {
      var bruto = localStorage.getItem(chave);
      return bruto ? JSON.parse(bruto) : padrao;
    } catch (e) { return padrao; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
    catch (e) { return false; }
  }
  function remover(chave) {
    try { localStorage.removeItem(chave); } catch (e) { /* ignora */ }
  }

  /* ---------- hash da senha ---------- */
  function paraHex(bytes) {
    var v = new Uint8Array(bytes), s = '';
    for (var i = 0; i < v.length; i++) s += ('0' + v[i].toString(16)).slice(-2);
    return s;
  }
  function criptografiaDisponivel() {
    return !!(window.crypto && window.crypto.subtle && window.TextEncoder);
  }
  function novoSalt() {
    var a = new Uint8Array(16);
    window.crypto.getRandomValues(a);
    return paraHex(a);
  }
  function gerarHash(salt, senha) {
    var dados = new TextEncoder().encode(salt + ':' + senha);
    return window.crypto.subtle.digest('SHA-256', dados).then(paraHex);
  }

  /* ---------- sessão e cabeçalho ---------- */
  function sessao() { return ler(CHAVE_SESSAO, null); }

  function atualizarCabecalho() {
    var link = document.getElementById('nav-login');
    if (!link) return;
    var nav = link.parentNode;
    var antigo = document.getElementById('nav-sair');
    if (antigo) nav.removeChild(antigo);
    var s = sessao();
    if (s && s.nome) {
      link.textContent = 'Olá, ' + s.nome;
      var sair = document.createElement('button');
      sair.type = 'button';
      sair.id = 'nav-sair';
      sair.className = 'sair';
      sair.textContent = 'Sair';
      sair.addEventListener('click', sairDaConta);
      nav.appendChild(sair);
    } else {
      link.textContent = 'Entrar / Cadastrar';
    }
  }

  function sairDaConta() {
    remover(CHAVE_SESSAO);
    atualizarCabecalho();
    mostrarSessao('Você saiu da conta.');
  }

  function mostrarSessao(texto) {
    var el = document.getElementById('sessao-status');
    if (!el) return;
    var s = sessao();
    el.className = 'msg' + (s ? ' ok' : '');
    el.textContent = texto || (s ? 'Você está conectado como ' + s.nome + ' (' + s.email + ').' : '');
  }

  /* ---------- mensagens ---------- */
  function mensagem(id, tipo, texto) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = 'msg ' + tipo;
    el.textContent = texto;
  }

  /* ---------- cadastro ---------- */
  function tratarCadastro(evento) {
    evento.preventDefault();
    var f = evento.target;
    var nome = f.elements['nome'].value.trim();
    var email = f.elements['email-cadastro'].value.trim().toLowerCase();
    var senha = f.elements['senha-cadastro'].value;
    var conf = f.elements['confirmar-senha'].value;
    var M = 'msg-cadastro';

    if (!nome || !email || !senha || !conf) return mensagem(M, 'erro', 'Preencha todos os campos.');
    if (nome.length < 2) return mensagem(M, 'erro', 'O nome precisa ter pelo menos 2 caracteres.');
    if (!REGEX_EMAIL.test(email)) return mensagem(M, 'erro', 'Informe um e-mail válido, como voce@exemplo.com.');
    if (senha.length < 8) return mensagem(M, 'erro', 'A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== conf) return mensagem(M, 'erro', 'A confirmação de senha não é igual à senha.');
    if (!criptografiaDisponivel()) {
      return mensagem(M, 'erro', 'Este navegador não permite proteger a senha (crypto.subtle). Abra o site por https ou em outro navegador.');
    }

    var usuarios = ler(CHAVE_USUARIOS, []);
    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].email === email) {
        return mensagem(M, 'erro', 'Este e-mail já está cadastrado. Use o formulário de login.');
      }
    }

    var salt = novoSalt();
    gerarHash(salt, senha).then(function (hash) {
      usuarios.push({ nome: nome, email: email, salt: salt, hash: hash, criadoEm: new Date().toISOString() });
      if (!gravar(CHAVE_USUARIOS, usuarios)) {
        return mensagem(M, 'erro', 'Não foi possível salvar: o armazenamento do navegador está bloqueado.');
      }
      gravar(CHAVE_SESSAO, { nome: nome, email: email });
      f.reset();
      mensagem(M, 'ok', 'Conta criada com sucesso! Você já está conectado, ' + nome + '.');
      atualizarCabecalho();
      mostrarSessao();
    });
  }

  /* ---------- login ---------- */
  function tratarLogin(evento) {
    evento.preventDefault();
    var f = evento.target;
    var email = f.elements['email-login'].value.trim().toLowerCase();
    var senha = f.elements['senha-login'].value;
    var M = 'msg-login';

    if (!email || !senha) return mensagem(M, 'erro', 'Informe e-mail e senha.');
    if (!REGEX_EMAIL.test(email)) return mensagem(M, 'erro', 'Informe um e-mail válido.');
    if (!criptografiaDisponivel()) {
      return mensagem(M, 'erro', 'Este navegador não permite conferir a senha (crypto.subtle). Abra o site por https ou em outro navegador.');
    }

    var usuarios = ler(CHAVE_USUARIOS, []);
    var usuario = null;
    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].email === email) { usuario = usuarios[i]; break; }
    }
    if (!usuario) return mensagem(M, 'erro', 'E-mail ou senha incorretos.');

    gerarHash(usuario.salt, senha).then(function (hash) {
      if (hash !== usuario.hash) return mensagem(M, 'erro', 'E-mail ou senha incorretos.');
      gravar(CHAVE_SESSAO, { nome: usuario.nome, email: usuario.email });
      f.reset();
      mensagem(M, 'ok', 'Bem-vindo de volta, ' + usuario.nome + '!');
      atualizarCabecalho();
      mostrarSessao();
    });
  }

  /* ---------- início ---------- */
  function iniciar() {
    atualizarCabecalho();
    var formCadastro = document.getElementById('form-cadastro');
    var formLogin = document.getElementById('form-login');
    if (formCadastro) formCadastro.addEventListener('submit', tratarCadastro);
    if (formLogin) formLogin.addEventListener('submit', tratarLogin);
    mostrarSessao();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();