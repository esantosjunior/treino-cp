'use strict';
(() => {
  const CHAVE = 'clf-c02.v1';
  // Estas constantes ficam no topo de propósito: carregarMeta() e carregar() rodam logo abaixo,
  // e usá-las antes de serem definidas lança erro e zera o progresso.
  const VERSAO = '2026-11-16.1';
  const META = CHAVE + '.perfis';
  const chavePerfil = (id) => (id === 'p1' ? CHAVE : `${CHAVE}.${id}`);
  const DOMINIOS = ['Conceitos de nuvem', 'Segurança e conformidade', 'Tecnologia e serviços', 'Cobrança e suporte'];
  // Pesos oficiais dos domínios do exame CLF-C02 (guia do exame).
  const PESOS = { 'Conceitos de nuvem': 24, 'Segurança e conformidade': 30, 'Tecnologia e serviços': 34, 'Cobrança e suporte': 12 };
  const SIM = { total: 65, minutos: 90, aprovacao: 70 };
  const QTDS = [10, 20, 30, 50, 0];

  const app = document.getElementById('app');
  let Q = [];
  let meta = carregarMeta();
  let store = carregar();
  let view = 'home';
  let cfg = cfgPadrao();
  let sess = null;
  let resultado = null;
  let timer = null;

  // ---------- atualização do app ----------
  // Apaga só as cópias do modo offline (service worker e cache de arquivos) e busca tudo de novo.
  // Não mexe no progresso: ele fica no localStorage, que esta função nunca toca.
  async function atualizarApp() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (window.caches) {
        const chaves = await caches.keys();
        await Promise.all(chaves.map((k) => caches.delete(k)));
      }
      const arquivos = ['index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'data/questions.json'];
      await Promise.all(arquivos.map((u) => fetch(u, { cache: 'reload' }).catch(() => null)));
    } catch (e) { /* segue para recarregar */ }
    location.reload();
  }

  // ---------- utilidades ----------
  function h(tag, props, ...filhos) {
    const e = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (k === 'disabled' || k === 'selected' || k === 'value') e[k] = v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const f of filhos.flat()) {
      if (f == null || f === false) continue;
      e.append(f.nodeType ? f : document.createTextNode(String(f)));
    }
    return e;
  }
  function embaralhar(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }
  const pct = (a, t) => (t ? Math.round((a / t) * 100) : 0);
  function fmtTempo(s) {
    const m = Math.floor(s / 60), r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  function fmtData(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  const classeBarra = (p) => (p < 60 ? 'baixo' : p < 75 ? 'medio' : '');

  // ---------- armazenamento local ----------
  // Perfis locais: o perfil 'p1' usa a chave original (mantém o progresso que já existia).
  function carregarMeta() {
    let m = null;
    try { m = JSON.parse(localStorage.getItem(META)); } catch (e) { /* JSON inválido: cria o padrão */ }
    {
      if (m && Array.isArray(m.lista) && m.lista.length && m.lista.some((p) => p.id === m.ativo)) return m;
    }
    return { ativo: 'p1', lista: [{ id: 'p1', nome: 'Principal' }] };
  }
  function salvarMeta() {
    try { localStorage.setItem(META, JSON.stringify(meta)); } catch (e) { /* sem espaço ou bloqueado */ }
  }
  const perfilAtivo = () => meta.lista.find((p) => p.id === meta.ativo);

  function carregar(chave) {
    const k = chave || chavePerfil(meta.ativo);
    let j = null;
    try { j = JSON.parse(localStorage.getItem(k)); } catch (e) { /* JSON inválido: começa vazio */ }
    if (j && typeof j === 'object') {
      return {
        stats: j.stats && typeof j.stats === 'object' ? j.stats : {},
        historico: Array.isArray(j.historico) ? j.historico : [],
        marcadas: Array.isArray(j.marcadas) ? j.marcadas : [],
      };
    }
    return { stats: {}, historico: [], marcadas: [] };
  }
  function salvar() {
    try { localStorage.setItem(chavePerfil(meta.ativo), JSON.stringify(store)); } catch (e) { /* sem espaço ou bloqueado */ }
  }
  function registrar(q, ok) {
    const s = store.stats[q.uid] || { t: 0, a: 0, ultima: null, data: 0 };
    s.t++;
    if (ok) s.a++;
    s.ultima = ok;
    s.data = Date.now();
    store.stats[q.uid] = s;
    salvar();
  }

  function criarPerfil(nome) {
    const n = String(nome || '').trim().slice(0, 30);
    if (!n) return null;
    const id = 'p' + Date.now().toString(36);
    meta.lista.push({ id, nome: n });
    salvarMeta();
    return id;
  }
  function trocarPerfil(id) {
    if (!meta.lista.some((p) => p.id === id)) return;
    meta.ativo = id;
    salvarMeta();
    store = carregar();
    cfg = cfgPadrao();
    sess = null;
    resultado = null;
  }
  function renomearPerfil(id, nome) {
    const n = String(nome || '').trim().slice(0, 30);
    const p = meta.lista.find((x) => x.id === id);
    if (!n || !p) return;
    p.nome = n;
    salvarMeta();
  }
  function apagarPerfil(id) {
    if (meta.lista.length < 2 || !meta.lista.some((p) => p.id === id)) return false;
    try { localStorage.removeItem(chavePerfil(id)); } catch (e) { /* ignora */ }
    meta.lista = meta.lista.filter((p) => p.id !== id);
    if (meta.ativo === id) {
      meta.ativo = meta.lista[0].id;
      store = carregar();
    }
    salvarMeta();
    return true;
  }
  function resumoPerfil(id) {
    const dados = id === meta.ativo ? store : carregar(chavePerfil(id));
    let t = 0, a = 0;
    const vistas = Object.keys(dados.stats).length;
    for (const s of Object.values(dados.stats)) { t += s.t; a += s.a; }
    return t ? `${vistas} vistas · ${pct(a, t)}% de acertos` : 'sem respostas ainda';
  }

  // ---------- regras das perguntas ----------
  function criarItem(q) {
    const it = { q, marcada: store.marcadas.includes(q.uid), confirmada: false, ok: null };
    if (q.tipo === 'pareamento') {
      it.resp = q.pares.map(() => null);
      it.opcoes = embaralhar(q.opcoes);
    } else {
      it.ordem = embaralhar(q.alternativas.map((_, i) => i));
      it.resp = new Set();
    }
    return it;
  }
  function respondida(it) {
    return it.q.tipo === 'pareamento' ? it.resp.every(Boolean) : it.resp.size > 0;
  }
  function correto(it) {
    const q = it.q;
    if (q.tipo === 'pareamento') return it.resp.every((r, i) => r === q.pares[i].resposta);
    const certas = q.alternativas.map((a, i) => (a.correta ? i : -1)).filter((i) => i >= 0);
    return it.resp.size === certas.length && certas.every((i) => it.resp.has(i));
  }
  function prioridade(q) {
    const s = store.stats[q.uid];
    let p;
    if (!s) p = 2;
    else if (s.ultima === false) p = 3;
    else p = Math.max(0, 1 - (s.a / s.t) * 0.5 - Math.min(s.t, 5) * 0.1);
    return p + Math.random() * 0.9;
  }
  const ordenarPrioridade = (lista) =>
    lista.map((q) => [prioridade(q), q]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const tentativas = (q) => (store.stats[q.uid] ? store.stats[q.uid].t : 0);

  function cotas(total) {
    const brutas = DOMINIOS.map((d) => (total * PESOS[d]) / 100);
    const base = brutas.map(Math.floor);
    let falta = total - base.reduce((a, b) => a + b, 0);
    const ordem = brutas.map((b, i) => [b - Math.floor(b), i]).sort((a, b) => b[0] - a[0]);
    for (const [, i] of ordem) { if (falta <= 0) break; base[i]++; falta--; }
    const r = {};
    DOMINIOS.forEach((d, i) => { r[d] = base[i]; });
    return r;
  }
  function montarSimulado() {
    const c = cotas(SIM.total);
    const lista = [];
    for (const d of DOMINIOS) {
      // O exame real só tem pergunta de uma resposta e de várias respostas (sem associação).
      const pool = embaralhar(Q.filter((q) => q.tema === d && q.tipo !== 'pareamento')).sort((a, b) => tentativas(a) - tentativas(b));
      lista.push(...pool.slice(0, c[d]));
    }
    return embaralhar(lista);
  }

  // ---------- configuração da prática ----------
  function cfgPadrao() {
    return { dominios: new Set(), subtemas: new Set(), filtro: 'todas', qtd: 10, ordem: 'aleatoria', feedback: 'imediato' };
  }
  function passaFiltro(q, filtro) {
    const s = store.stats[q.uid];
    if (filtro === 'novas') return !s;
    if (filtro === 'erradas') return !!s && s.ultima === false;
    if (filtro === 'marcadas') return store.marcadas.includes(q.uid);
    return true;
  }
  function filtrar(c) {
    return Q.filter((q) =>
      (!c.dominios.size || c.dominios.has(q.tema)) &&
      (!c.subtemas.size || c.subtemas.has(q.subtema)) &&
      passaFiltro(q, c.filtro));
  }

  // ---------- sessões ----------
  function iniciar(perguntas, opts) {
    if (!perguntas.length) return;
    sess = {
      modo: opts.modo,
      feedback: opts.feedback,
      limiteSeg: opts.limiteSeg || null,
      inicio: Date.now(),
      idx: 0,
      itens: perguntas.map(criarItem),
    };
    go('quiz');
    if (sess.limiteSeg) iniciarTimer();
  }
  function iniciarSimulado() {
    const lista = montarSimulado();
    iniciar(lista, { modo: 'simulado', feedback: 'final', limiteSeg: Math.round((lista.length * SIM.minutos * 60) / SIM.total) });
  }
  function treinoInteligente() {
    iniciar(ordenarPrioridade(Q).slice(0, 20), { modo: 'pratica', feedback: 'imediato' });
  }
  function iniciarFiltro(filtro) {
    iniciar(embaralhar(Q.filter((q) => passaFiltro(q, filtro))), { modo: 'pratica', feedback: 'imediato' });
  }
  function comecarPratica() {
    let pool = filtrar(cfg);
    pool = cfg.ordem === 'inteligente' ? ordenarPrioridade(pool) : embaralhar(pool);
    if (cfg.qtd) pool = pool.slice(0, cfg.qtd);
    iniciar(pool, { modo: 'pratica', feedback: cfg.feedback });
  }
  function restante() {
    return Math.max(0, sess.limiteSeg - Math.floor((Date.now() - sess.inicio) / 1000));
  }
  function iniciarTimer() {
    pararTimer();
    timer = setInterval(() => {
      if (!sess) return pararTimer();
      const r = restante();
      const e = document.getElementById('relogio');
      if (e) { e.textContent = fmtTempo(r); e.classList.toggle('urgente', r < 300); }
      if (r <= 0) { pararTimer(); alert('Tempo esgotado. A prova será encerrada.'); finalizar(); }
    }, 1000);
  }
  function pararTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function confirmar() {
    const it = sess.itens[sess.idx];
    it.confirmada = true;
    it.ok = correto(it);
    registrar(it.q, it.ok);
    render(true);
  }
  function proxima() {
    if (sess.idx < sess.itens.length - 1) { sess.idx++; render(); }
    else if (sess.feedback === 'final') go('revisao');
    else finalizar();
  }
  function alternarMarca() {
    const it = sess.itens[sess.idx];
    it.marcada = !it.marcada;
    const u = it.q.uid;
    store.marcadas = store.marcadas.filter((x) => x !== u);
    if (it.marcada) store.marcadas.push(u);
    salvar();
    render(true);
  }
  function sairSessao() {
    const msg = sess && sess.feedback === 'final'
      ? 'Sair da prova? As respostas desta tentativa serão perdidas.'
      : 'Sair? As respostas já confirmadas ficam salvas.';
    if (!confirm(msg)) return;
    pararTimer();
    sess = null;
    view = 'home';
    render();
  }
  function finalizar() {
    pararTimer();
    const final = sess.feedback === 'final';
    let acertos = 0;
    const porDom = {};
    for (const it of sess.itens) {
      const ok = respondida(it) ? correto(it) : false;
      if (final && respondida(it)) registrar(it.q, ok);
      it.ok = ok;
      it.confirmada = true;
      if (ok) acertos++;
      const d = (porDom[it.q.tema] = porDom[it.q.tema] || [0, 0]);
      d[1]++;
      if (ok) d[0]++;
    }
    const seg = Math.round((Date.now() - sess.inicio) / 1000);
    const total = sess.itens.length;
    const branco = sess.itens.filter((it) => !respondida(it)).length;
    resultado = { modo: sess.modo, total, acertos, seg, porDom, branco, itens: sess.itens };
    store.historico.push({ data: Date.now(), modo: sess.modo, total, acertos, seg, porDom });
    store.historico = store.historico.slice(-100);
    salvar();
    sess = null;
    go('resultado');
  }

  // ---------- navegação ----------
  function go(v) {
    view = v;
    history.pushState({ v }, '');
    render();
  }
  window.addEventListener('popstate', () => {
    if (view === 'revisao' && sess) {
      view = 'quiz';
      render();
    } else if (view === 'quiz') {
      if (confirm('Sair da sessão atual?')) { pararTimer(); sess = null; view = 'home'; render(); }
      else history.pushState({ v: view }, '');
    } else {
      view = 'home';
      render();
    }
  });
  function mount(no, manter) {
    const y = window.scrollY;
    app.replaceChildren(no);
    window.scrollTo(0, manter ? y : 0);
  }
  function render(manter) {
    if (view !== 'quiz' && view !== 'revisao') pararTimer();
    const mapa = { home: viewHome, config: viewConfig, quiz: viewQuiz, revisao: viewRevisao, resultado: viewResultado, stats: viewStats, perfis: viewPerfis };
    mount((mapa[view] || viewHome)(), manter);
  }

  // ---------- componentes ----------
  const topo = (titulo, voltar) =>
    h('div', { class: 'topo' },
      voltar ? h('button', { class: 'btn icone', onclick: voltar, 'aria-label': 'Voltar' }, '←') : null,
      h('h1', null, titulo));
  function menuBtn(titulo, sub, fn, destaque, desligado) {
    return h('button', { class: 'menu-btn' + (destaque ? ' destaque' : ''), onclick: fn, disabled: !!desligado },
      h('strong', null, titulo), h('small', null, sub));
  }
  const caixa = (valor, rotulo) => h('div', null, h('b', null, valor), h('span', null, rotulo));
  function grupoChips(titulo, itens, ativo, clique) {
    return h('div', null,
      h('span', { class: 'rotulo' }, titulo),
      h('div', { class: 'chips' }, itens.map((i) =>
        h('button', { class: 'chip' + (ativo(i.valor) ? ' ativo' : ''), onclick: () => clique(i.valor), type: 'button' },
          i.rotulo, i.extra != null ? h('small', null, ` (${i.extra})`) : null))));
  }
  function barraStat(rotulo, a, t, extra) {
    const p = pct(a, t);
    return h('div', null,
      h('div', { class: 'linha-stat' }, h('span', null, rotulo), h('span', null, t ? `${p}% · ${a}/${t}${extra || ''}` : 'sem tentativas')),
      h('div', { class: 'barra' }, h('div', { class: classeBarra(p), style: `width:${t ? p : 0}%` })));
  }

  // ---------- telas ----------
  function viewHome() {
    let t = 0, a = 0;
    for (const s of Object.values(store.stats)) { t += s.t; a += s.a; }
    const vistas = Q.filter((q) => store.stats[q.uid]).length;
    const erradas = Q.filter((q) => passaFiltro(q, 'erradas')).length;
    const marc = Q.filter((q) => passaFiltro(q, 'marcadas')).length;
    return h('div', null,
      h('h1', null, 'Treino AWS Cloud Practitioner'),
      h('p', { class: 'suave' }, `CLF-C02 · ${Q.length} perguntas · funciona offline`),
      h('div', { class: 'chips' }, h('button', { class: 'chip', onclick: () => go('perfis') }, `Perfil: ${perfilAtivo().nome} · trocar`)),
      h('div', { class: 'resumo' }, caixa(`${vistas}/${Q.length}`, 'vistas'), caixa(t ? pct(a, t) + '%' : '–', 'acertos'), caixa(erradas, 'a revisar')),
      menuBtn('Simulado do exame', `${SIM.total} perguntas, ${SIM.minutos} min, sem gabarito até o fim. Segue os pesos dos domínios do exame.`, iniciarSimulado, true),
      menuBtn('Treino inteligente', '20 perguntas: prioriza o que você errou e o que ainda não viu.', treinoInteligente),
      menuBtn('Praticar por tema', 'Escolha domínios, assuntos e quantidade.', () => go('config')),
      menuBtn(`Rever as que errei (${erradas})`, 'Perguntas em que a última tentativa foi errada.', () => iniciarFiltro('erradas'), false, erradas === 0),
      menuBtn(`Marcadas (${marc})`, 'Perguntas que você marcou com a bandeira.', () => iniciarFiltro('marcadas'), false, marc === 0),
      menuBtn('Estatísticas e backup', 'Desempenho por domínio e assunto, histórico e exportação.', () => go('stats')),
      h('p', { class: 'suave', style: 'text-align:center;margin-top:18px' },
        `Versão ${VERSAO} · `, h('button', { class: 'chip', onclick: atualizarApp }, 'Atualizar app')));
  }

  function viewConfig() {
    const alterna = (conj, v) => { conj.has(v) ? conj.delete(v) : conj.add(v); render(true); };
    const contaDom = (d) => Q.filter((q) => q.tema === d).length;
    const subs = {};
    for (const q of Q) subs[q.subtema] = (subs[q.subtema] || 0) + 1;
    const subLista = Object.entries(subs).sort((a, b) => b[1] - a[1]);
    const n = filtrar(cfg).length;
    const qtdFinal = cfg.qtd ? Math.min(cfg.qtd, n) : n;
    const unico = (campo) => (v) => { cfg[campo] = v; render(true); };
    return h('div', null,
      topo('Praticar por tema', () => history.back()),
      h('p', { class: 'suave' }, 'Sem seleção em Domínio ou Assunto, entram todos.'),
      grupoChips('Domínio do exame', DOMINIOS.map((d) => ({ valor: d, rotulo: d, extra: contaDom(d) })), (v) => cfg.dominios.has(v), (v) => alterna(cfg.dominios, v)),
      grupoChips('Assunto', subLista.map(([s, c]) => ({ valor: s, rotulo: s, extra: c })), (v) => cfg.subtemas.has(v), (v) => alterna(cfg.subtemas, v)),
      grupoChips('Quais perguntas', [
        { valor: 'todas', rotulo: 'Todas' }, { valor: 'novas', rotulo: 'Ainda não vistas' },
        { valor: 'erradas', rotulo: 'Que errei' }, { valor: 'marcadas', rotulo: 'Marcadas' }],
      (v) => cfg.filtro === v, unico('filtro')),
      grupoChips('Quantidade', QTDS.map((q) => ({ valor: q, rotulo: q ? String(q) : 'Todas' })), (v) => cfg.qtd === v, unico('qtd')),
      grupoChips('Ordem', [{ valor: 'aleatoria', rotulo: 'Aleatória' }, { valor: 'inteligente', rotulo: 'Priorizar erradas e novas' }], (v) => cfg.ordem === v, unico('ordem')),
      grupoChips('Mostrar a resposta', [{ valor: 'imediato', rotulo: 'Após cada pergunta' }, { valor: 'final', rotulo: 'Só no final' }], (v) => cfg.feedback === v, unico('feedback')),
      h('div', { class: 'rodape-fixo' },
        h('button', { class: 'btn primario', style: 'width:100%', disabled: n === 0, onclick: comecarPratica },
          n ? `Começar (${qtdFinal} ${qtdFinal === 1 ? 'pergunta' : 'perguntas'})` : 'Nenhuma pergunta com esses filtros')));
  }

  function blocoPergunta(it, revelar, aoMudar) {
    const q = it.q;
    const no = h('div', null,
      h('div', { class: 'tags' }, h('span', { class: 'tag' }, q.tema), h('span', { class: 'tag alt' }, q.subtema), q.autoral ? h('span', { class: 'tag' }, 'Elaborada com base na documentação') : null),
      h('p', { class: 'enunciado' }, q.enunciado));
    if (q.tipo === 'multipla') {
      const n = q.alternativas.filter((a) => a.correta).length;
      no.append(h('p', { class: 'dica' }, `Selecione ${n} alternativas.`));
    }
    if (q.tipo === 'pareamento') no.append(h('p', { class: 'dica' }, 'Escolha a correspondência de cada item.'));

    if (q.tipo === 'pareamento') {
      q.pares.forEach((p, i) => {
        const acertou = it.resp[i] === p.resposta;
        const sel = h('select', {
          disabled: revelar, 'aria-label': p.item,
          onchange: (e) => { it.resp[i] = e.target.value || null; if (aoMudar) aoMudar(); },
        }, h('option', { value: '' }, 'Selecione…'),
        it.opcoes.map((o) => h('option', { value: o, selected: it.resp[i] === o }, o)));
        no.append(h('div', { class: 'par' + (revelar ? (acertou ? ' ok' : ' bad') : '') },
          h('div', { class: 'par-item' }, p.item), sel,
          revelar && !acertou ? h('div', { class: 'par-certa' }, 'Correto: ' + p.resposta) : null));
      });
      return no;
    }

    it.ordem.forEach((oi, k) => {
      const a = q.alternativas[oi];
      const sel = it.resp.has(oi);
      let cls = 'opt' + (q.tipo === 'multipla' ? ' multi' : '') + (sel ? ' sel' : '');
      if (revelar) {
        if (a.correta && sel) cls += ' ok';
        else if (a.correta) cls += ' perdida';
        else if (sel) cls += ' bad';
      }
      no.append(h('button', {
        type: 'button', class: cls, role: q.tipo === 'multipla' ? 'checkbox' : 'radio', 'aria-checked': String(sel),
        onclick: () => {
          if (revelar) return;
          if (q.tipo === 'multipla') { sel ? it.resp.delete(oi) : it.resp.add(oi); }
          else it.resp = new Set([oi]);
          if (aoMudar) aoMudar();
        },
      }, h('span', { class: 'letra' }, String.fromCharCode(65 + k)),
      h('span', { class: 'corpo' }, a.texto,
        revelar && a.justificativa && (a.correta || sel) ? h('span', { class: 'just' }, a.justificativa) : null)));
    });
    return no;
  }

  function painelResposta(it) {
    const q = it.q;
    const temExplicacao = q.explicacao || (q.alternativas || []).some((a) => a.justificativa);
    return h('div', null,
      h('div', { class: 'banner ' + (it.ok ? 'ok' : 'bad') }, it.ok ? 'Correto' : 'Incorreto'),
      q.gabarito === 'inferido' ? h('div', { class: 'aviso' }, 'A resposta desta pergunta foi deduzida, pois a captura não trazia o gabarito. Ainda falta conferir na documentação oficial.') : null,
      q.observacao ? h('div', { class: 'aviso' }, q.observacao) : null,
      q.explicacao ? h('p', null, q.explicacao) : null,
      !temExplicacao ? h('p', { class: 'suave' }, 'Explicação ainda não adicionada para esta pergunta.') : null,
      q.fonte ? h('p', { class: 'fonte suave' }, 'Fonte: ', h('a', { href: q.fonte, target: '_blank', rel: 'noopener' }, q.fonte)) : null);
  }

  function viewQuiz() {
    const it = sess.itens[sess.idx];
    const n = sess.itens.length;
    const imediato = sess.feedback === 'imediato';
    const revelar = imediato && it.confirmada;
    const raiz = h('div', null,
      h('div', { class: 'topo' },
        h('button', { class: 'btn icone', onclick: sairSessao, 'aria-label': 'Sair' }, '✕'),
        h('h1', null, `${sess.idx + 1} / ${n}`),
        sess.limiteSeg ? h('span', { class: 'relogio' + (restante() < 300 ? ' urgente' : ''), id: 'relogio' }, fmtTempo(restante())) : null,
        !imediato ? h('button', { class: 'btn icone', onclick: () => go('revisao'), 'aria-label': 'Painel de questões' }, '☰') : null,
        h('button', { class: 'btn icone marcar' + (it.marcada ? ' ativo' : ''), onclick: alternarMarca, 'aria-label': 'Marcar para revisar' }, '⚑')),
      h('div', { class: 'progresso' }, h('div', { style: `width:${((sess.idx + 1) / n) * 100}%` })),
      h('div', { class: 'card' }, blocoPergunta(it, revelar, () => render(true))),
      revelar ? h('div', { class: 'card' }, painelResposta(it)) : null);

    let acoes;
    if (imediato) {
      acoes = revelar
        ? [h('button', { class: 'btn primario', onclick: proxima }, sess.idx < n - 1 ? 'Próxima' : 'Ver resultado')]
        : [h('button', { class: 'btn primario', disabled: !respondida(it), onclick: confirmar }, 'Confirmar')];
    } else {
      acoes = [
        h('button', { class: 'btn', disabled: sess.idx === 0, onclick: () => { sess.idx--; render(); } }, 'Anterior'),
        h('button', { class: 'btn primario', onclick: proxima }, sess.idx < n - 1 ? 'Próxima' : 'Revisar e finalizar'),
      ];
    }
    raiz.append(h('div', { class: 'rodape-fixo' }, h('div', { class: 'barra-acoes' }, acoes)));
    return raiz;
  }

  function viewRevisao() {
    const itens = sess.itens;
    const brancos = itens.filter((i) => !respondida(i)).length;
    const marcadas = itens.filter((i) => i.marcada).length;
    return h('div', null,
      h('div', { class: 'topo' },
        h('button', { class: 'btn icone', onclick: () => history.back(), 'aria-label': 'Voltar' }, '←'),
        h('h1', null, 'Painel da prova'),
        sess.limiteSeg ? h('span', { class: 'relogio', id: 'relogio' }, fmtTempo(restante())) : null),
      h('p', { class: 'suave' }, `${itens.length - brancos} respondidas · ${brancos} em branco · ${marcadas} marcadas. Toque num número para voltar à pergunta.`),
      h('div', { class: 'grade' }, itens.map((it, i) =>
        h('button', {
          class: (respondida(it) ? 'resp ' : '') + (it.marcada ? 'marc ' : '') + (i === sess.idx ? 'atual' : ''),
          onclick: () => { sess.idx = i; history.back(); },
        }, String(i + 1)))),
      h('div', { class: 'rodape-fixo' },
        h('button', {
          class: 'btn primario', style: 'width:100%',
          onclick: () => {
            const aviso = brancos ? `Há ${brancos} pergunta(s) em branco. Na prova real, em branco conta como errada e não há penalidade por chutar. Finalizar mesmo assim?` : 'Finalizar a prova e ver o resultado?';
            if (confirm(aviso)) finalizar();
          },
        }, 'Finalizar prova')));
  }

  function viewResultado() {
    const r = resultado;
    if (!r) return viewHome();
    const p = pct(r.acertos, r.total);
    const aprovado = p >= SIM.aprovacao;
    const erradas = r.itens.filter((i) => !i.ok);
    return h('div', null,
      topo('Resultado', () => history.back()),
      h('div', { class: 'card nota ' + (aprovado ? 'aprovado' : 'reprovado') },
        h('div', { class: 'grande' }, `${p}%`),
        h('p', null, `${r.acertos} de ${r.total} corretas · ${fmtTempo(r.seg)}`),
        h('p', { class: 'suave' }, `${aprovado ? 'Acima' : 'Abaixo'} de ${SIM.aprovacao}%. ` +
          'A prova real usa nota de 100 a 1000 (mínimo 700) e a conversão não é linear, então use isto só como referência.'),
        r.branco ? h('p', { class: 'suave' }, `${r.branco} em branco.`) : null),
      h('h2', null, 'Por domínio'),
      h('div', { class: 'card' }, DOMINIOS.filter((d) => r.porDom[d]).map((d) => barraStat(d, r.porDom[d][0], r.porDom[d][1]))),
      h('div', { class: 'barra-acoes' },
        h('button', { class: 'btn', onclick: () => { history.back(); } }, 'Início'),
        h('button', {
          class: 'btn primario', disabled: !erradas.length,
          onclick: () => iniciar(embaralhar(erradas.map((i) => i.q)), { modo: 'pratica', feedback: 'imediato' }),
        }, `Refazer erradas (${erradas.length})`)),
      erradas.length ? h('h2', null, 'Revisão das erradas') : null,
      erradas.map((it) => h('details', null,
        h('summary', null, it.q.enunciado.length > 110 ? it.q.enunciado.slice(0, 110) + '…' : it.q.enunciado),
        blocoPergunta(it, true, null), painelResposta(it))));
  }

  function viewPerfis() {
    const cartoes = meta.lista.map((p) => {
      const ativo = p.id === meta.ativo;
      return h('div', { class: 'card' },
        h('div', { class: 'linha-stat' }, h('b', null, p.nome + (ativo ? ' (em uso)' : '')), h('span', { class: 'suave' }, resumoPerfil(p.id))),
        h('div', { class: 'barra-acoes' },
          ativo ? null : h('button', {
            class: 'btn primario',
            onclick: () => { trocarPerfil(p.id); view = 'home'; history.pushState({ v: 'home' }, ''); render(); },
          }, 'Usar'),
          h('button', {
            class: 'btn',
            onclick: () => { const n = prompt('Novo nome do perfil:', p.nome); if (n) { renomearPerfil(p.id, n); render(true); } },
          }, 'Renomear'),
          h('button', {
            class: 'btn perigo', disabled: meta.lista.length < 2,
            onclick: () => {
              if (confirm(`Apagar o perfil "${p.nome}" e todo o progresso dele neste aparelho?`)) { apagarPerfil(p.id); render(true); }
            },
          }, 'Apagar')));
    });
    return h('div', null,
      topo('Perfis', () => history.back()),
      h('p', { class: 'suave' }, 'Cada perfil tem o próprio histórico, erros e marcações. Os perfis ficam só neste aparelho e não têm senha: servem para separar o progresso de quem usa o mesmo celular. Em outro celular, o progresso já é separado automaticamente.'),
      cartoes,
      h('div', { class: 'barra-acoes' },
        h('button', {
          class: 'btn primario',
          onclick: () => {
            const n = prompt('Nome do novo perfil:');
            const id = n ? criarPerfil(n) : null;
            if (id) { trocarPerfil(id); view = 'home'; history.pushState({ v: 'home' }, ''); render(); }
          },
        }, 'Novo perfil')));
  }

  function agregar(campo) {
    const m = {};
    for (const q of Q) {
      const k = q[campo];
      const e = (m[k] = m[k] || { t: 0, a: 0, vistas: 0, total: 0 });
      e.total++;
      const s = store.stats[q.uid];
      if (s) { e.t += s.t; e.a += s.a; e.vistas++; }
    }
    return m;
  }
  function exportar() {
    const blob = new Blob([JSON.stringify(store)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'clf-c02-progresso.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importar(arquivo) {
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const j = JSON.parse(leitor.result);
        if (!j || typeof j.stats !== 'object' || !Array.isArray(j.historico) || !Array.isArray(j.marcadas)) throw new Error('formato');
        if (!confirm('Substituir o progresso atual por este backup?')) return;
        store = { stats: j.stats, historico: j.historico, marcadas: j.marcadas };
        salvar();
        render();
      } catch (e) { alert('Arquivo inválido. Use um backup exportado por este app.'); }
    };
    leitor.readAsText(arquivo);
  }
  function viewStats() {
    const dom = agregar('tema');
    const sub = Object.entries(agregar('subtema')).filter(([, v]) => v.t > 0)
      .sort((a, b) => a[1].a / a[1].t - b[1].a / b[1].t);
    const entrada = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: (e) => e.target.files[0] && importar(e.target.files[0]) });
    return h('div', null,
      topo('Estatísticas', () => history.back()),
      h('h2', null, 'Por domínio do exame'),
      h('div', { class: 'card' }, DOMINIOS.map((d) => barraStat(`${d} (${PESOS[d]}%)`, dom[d].a, dom[d].t, ` · ${dom[d].vistas}/${dom[d].total} vistas`))),
      h('h2', null, 'Por assunto (do mais fraco ao mais forte)'),
      h('div', { class: 'card' }, sub.length ? sub.map(([k, v]) => barraStat(k, v.a, v.t)) : h('p', { class: 'suave' }, 'Responda algumas perguntas para ver o desempenho por assunto.')),
      h('h2', null, 'Últimas sessões'),
      h('div', { class: 'card historico' }, store.historico.length
        ? store.historico.slice(-12).reverse().map((x) => h('div', null,
          h('span', null, `${fmtData(x.data)} · ${x.modo === 'simulado' ? 'Simulado' : 'Prática'}`),
          h('b', null, `${pct(x.acertos, x.total)}% (${x.acertos}/${x.total})`)))
        : h('p', { class: 'suave' }, 'Nenhuma sessão concluída ainda.')),
      h('h2', null, 'Backup do progresso'),
      h('p', { class: 'suave' }, `Backup do perfil "${perfilAtivo().nome}". O progresso fica só neste aparelho: exporte um arquivo para guardar ou levar a outro celular.`),
      h('div', { class: 'barra-acoes' },
        h('button', { class: 'btn', onclick: exportar }, 'Exportar'),
        h('button', { class: 'btn', onclick: () => entrada.click() }, 'Importar')),
      entrada,
      h('div', { class: 'barra-acoes' },
        h('button', {
          class: 'btn perigo',
          onclick: () => { if (confirm('Apagar todo o progresso deste aparelho?')) { store = { stats: {}, historico: [], marcadas: [] }; salvar(); render(); } },
        }, 'Apagar progresso')));
  }

  // ---------- autoteste (abrir com ?autoteste=1) ----------
  function autoteste() {
    const falhas = [];
    const ok = (cond, msg) => { if (!cond) falhas.push(msg); };
    const uids = new Set();
    for (const q of Q) {
      ok(q.uid && !uids.has(q.uid), `uid inválido/duplicado: ${q.id}`);
      uids.add(q.uid);
      ok(DOMINIOS.includes(q.tema), `domínio desconhecido: ${q.id}`);
      ok(q.subtema, `sem subtema: ${q.id}`);
      if (q.tipo === 'pareamento') {
        ok(q.pares.every((p) => q.opcoes.includes(p.resposta)), `opcoes não cobrem respostas: ${q.id}`);
        const it = criarItem(q);
        ok(!correto(it), `pareamento vazio não pode ser correto: ${q.id}`);
        q.pares.forEach((p, i) => { it.resp[i] = p.resposta; });
        ok(correto(it) && respondida(it), `pareamento certo falhou: ${q.id}`);
      } else {
        const certas = q.alternativas.filter((a) => a.correta).length;
        ok(q.tipo === 'unica' ? certas === 1 : certas >= 2, `número de corretas incoerente: ${q.id}`);
        const it = criarItem(q);
        ok(!correto(it) && !respondida(it), `vazio não pode ser correto: ${q.id}`);
        q.alternativas.forEach((a, i) => { if (a.correta) it.resp.add(i); });
        ok(correto(it), `resposta certa falhou: ${q.id}`);
        if (q.tipo === 'multipla') {
          const errada = q.alternativas.findIndex((a) => !a.correta);
          it.resp.add(errada);
          ok(!correto(it), `multipla com extra deveria falhar: ${q.id}`);
        }
      }
    }
    const c = cotas(SIM.total);
    ok(Object.values(c).reduce((a, b) => a + b, 0) === SIM.total, 'cotas não somam o total');
    const sim = montarSimulado();
    ok(sim.length === SIM.total, `simulado com ${sim.length} perguntas`);
    ok(new Set(sim.map((q) => q.uid)).size === sim.length, 'simulado com repetidas');
    ok(!sim.some((q) => q.tipo === 'pareamento'), 'simulado não deve ter pergunta de associação');
    DOMINIOS.forEach((d) => ok(sim.filter((q) => q.tema === d).length === c[d], `cota de ${d} não respeitada`));
    testePerfis(falhas);
    const interfaceTestada = testeInterface(falhas);
    const saida = { total: Q.length, cotas: c, interfaceTestada, falhas, resultado: falhas.length ? 'FALHOU' : 'OK' };
    document.title = saida.resultado;
    app.replaceChildren(h('pre', { id: 'autoteste' }, JSON.stringify(saida, null, 1)));
  }

  // Testa a persistência com recargas reais. Rode as fases 1, 2, 3 e 4 em sequência, no mesmo navegador
  // (fontes/testar_persistencia.ps1). Não use no seu aparelho: a fase 1 grava dados de teste.
  function testePersistencia() {
    const fase = Number(new URLSearchParams(location.search).get('persist'));
    const falhas = [];
    const ok = (cond, msg) => { if (!cond) falhas.push(`fase ${fase}: ${msg}`); };
    if (fase === 1) {
      // Simula os dados da versão sem perfis: só a chave original, sem metadados de perfil.
      localStorage.removeItem(META);
      localStorage.setItem(CHAVE, JSON.stringify({ stats: { antigo: { t: 3, a: 2, ultima: true, data: 1 } }, historico: [], marcadas: [] }));
    } else if (fase === 2) {
      ok(meta.ativo === 'p1' && meta.lista[0].nome === 'Principal', 'perfil Principal ausente');
      ok(store.stats.antigo && store.stats.antigo.t === 3, 'o histórico antigo se perdeu na migração');
      const id = criarPerfil('Teste');
      trocarPerfil(id);
      registrar(Q[0], false);
    } else if (fase === 3) {
      ok(meta.lista.some((p) => p.nome === 'Teste'), 'o perfil criado sumiu após recarregar');
      ok(perfilAtivo() && perfilAtivo().nome === 'Teste', 'o perfil em uso não foi mantido');
      ok(Object.keys(store.stats).length === 1, 'o registro do perfil novo sumiu');
      trocarPerfil('p1');
      ok(store.stats.antigo && store.stats.antigo.t === 3, 'o perfil Principal foi alterado');
    } else if (fase === 4) {
      ok(meta.ativo === 'p1', 'a troca de perfil não foi mantida');
      ok(store.stats.antigo && store.stats.antigo.t === 3, 'o histórico do Principal sumiu');
      Object.keys(localStorage).filter((k) => k.startsWith(CHAVE)).forEach((k) => localStorage.removeItem(k));
    }
    const saida = { fase, falhas, resultado: falhas.length ? 'FALHOU' : 'OK' };
    document.title = saida.resultado;
    app.replaceChildren(h('pre', { id: 'autoteste' }, JSON.stringify(saida)));
  }

  function testePerfis(falhas) {
    const ok = (cond, msg) => { if (!cond) falhas.push(msg); };
    const metaBak = JSON.stringify(meta);
    const storeBak = JSON.stringify(store);
    const ativoBak = meta.ativo;
    try {
      const antes = JSON.stringify(store.stats);
      const id = criarPerfil('Teste');
      ok(!!id, 'criar perfil');
      trocarPerfil(id);
      ok(Object.keys(store.stats).length === 0, 'perfil novo deve começar vazio');
      registrar(Q[0], true);
      ok(Object.keys(store.stats).length === 1, 'registro no perfil novo');
      trocarPerfil(ativoBak);
      ok(JSON.stringify(store.stats) === antes, 'o perfil original não pode mudar');
      ok(apagarPerfil(id), 'apagar perfil');
      ok(localStorage.getItem(chavePerfil(id)) === null, 'dados do perfil apagado devem sumir');
    } catch (e) {
      falhas.push('exceção em perfis: ' + e.message);
    } finally {
      meta = JSON.parse(metaBak);
      salvarMeta();
      store = JSON.parse(storeBak);
    }
  }

  // Simula toques na interface: treino, simulado completo, painel, resultado e estatísticas.
  function testeInterface(falhas) {
    const bak = JSON.stringify(store);
    let concluido = false;
    const ok = (cond, msg) => { if (!cond) falhas.push(msg); };
    const confirmOrig = window.confirm, alertOrig = window.alert;
    window.confirm = () => true;
    window.alert = () => {};
    const clicar = (txt) => {
      const b = [...app.querySelectorAll('button')].find((x) => x.textContent.includes(txt) && !x.disabled);
      if (b) b.click();
      return !!b;
    };
    const responder = () => {
      const opt = app.querySelector('.opt');
      if (opt) opt.click();
      else app.querySelectorAll('.par select').forEach((s) => { s.value = s.options[1].value; s.dispatchEvent(new Event('change')); });
    };
    try {
      store = { stats: {}, historico: [], marcadas: [] };
      view = 'home'; render();
      ok(clicar('Treino inteligente'), 'botão treino');
      ok(view === 'quiz' && sess.itens.length === 20, 'treino não iniciou');
      for (let i = 0; i < 20; i++) {
        responder();
        ok(clicar('Confirmar'), `confirmar ${i}`);
        ok(!!app.querySelector('.banner'), `sem banner ${i}`);
        ok(clicar(i < 19 ? 'Próxima' : 'Ver resultado'), `avançar ${i}`);
      }
      ok(view === 'resultado' && !!app.querySelector('.nota'), 'sem resultado do treino');
      ok(store.historico.length === 1, 'histórico do treino');
      view = 'home'; render();
      ok(clicar('Simulado do exame'), 'botão simulado');
      ok(view === 'quiz' && sess.itens.length === SIM.total && !!document.getElementById('relogio'), 'simulado não iniciou');
      for (let i = 0; i < SIM.total; i++) {
        responder();
        ok(clicar(i < SIM.total - 1 ? 'Próxima' : 'Revisar e finalizar'), `avançar simulado ${i}`);
      }
      ok(view === 'revisao', 'sem painel da prova');
      ok(clicar('Finalizar prova'), 'finalizar');
      ok(view === 'resultado' && resultado.total === SIM.total, 'resultado do simulado');
      ok(store.historico.length === 2, 'histórico do simulado');
      view = 'config'; render();
      ok(clicar('Computação'), 'chip de assunto');
      ok(!!app.querySelector('.rodape-fixo .btn.primario'), 'config sem botão iniciar');
      view = 'stats'; render();
      ok(app.querySelectorAll('.barra').length > 0, 'estatísticas vazias');
      concluido = true;
    } catch (e) {
      falhas.push('exceção: ' + e.message);
    } finally {
      window.confirm = confirmOrig; window.alert = alertOrig;
      store = JSON.parse(bak); salvar(); pararTimer(); sess = null;
    }
    return concluido;
  }

  // ---------- início ----------
  async function iniciarApp() {
    try {
      const r = await fetch('data/questions.json');
      if (!r.ok) throw new Error(r.status);
      Q = await r.json();
    } catch (e) {
      app.replaceChildren(h('div', { class: 'card' },
        h('p', null, 'Não consegui carregar as perguntas.'),
        h('button', { class: 'btn primario', onclick: () => location.reload() }, 'Tentar de novo')));
      return;
    }
    if (location.search.includes('persist=')) return testePersistencia();
    if (location.search.includes('autoteste')) return autoteste();
    history.replaceState({ v: 'home' }, '');
    render();
    const atalho = new URLSearchParams(location.search).get('ir'); // usado só para capturas de tela de teste
    if (atalho === 'treino') treinoInteligente();
    else if (atalho === 'config' || atalho === 'stats' || atalho === 'perfis') go(atalho);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      const haviaControlador = !!navigator.serviceWorker.controller;
      let recarregou = false;
      // Quando uma versão nova do service worker assume, recarrega uma vez (sem interromper uma prova em andamento).
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (haviaControlador && !recarregou && !sess) { recarregou = true; location.reload(); }
      });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((reg) => reg.update())
        .catch(() => { /* offline não disponível */ });
    }
  }
  iniciarApp();
})();
