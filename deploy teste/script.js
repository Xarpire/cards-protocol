let cartas = [];
let cartasOriginais = [];
let cartasFiltradas = [];
let cartasDaEdicao = [];
let edicaoSelecionada = null;

let pagina = 0;
let cartasPorPagina = 9;
let visualizacao = "grid";
let temaCurrent = "dark";
let usuarioAutenticado = null;
let inventarioSalvo = {};
let quantidadesEdicao = {};
let revisaoColecao = 0;
let openCvPromise;
let cameraFotoUrl;
let cartaIdentificada;
let catalogoDescritores;
const descritoresCartas = new Map();
let temporizadorEstadoBarra;
let jogosDisponiveis = [];
let jogoSelecionado = null;
let edicoesDisponiveis = [];

function alternarFiltros() {
  const barraFiltros = document.getElementById("barraFiltros");
  const btnFiltros = document.getElementById("btnFiltrosFlutuante");
  const aberto = barraFiltros.classList.toggle("filtros-abertos");
  const botaoExpandir = document.getElementById("btnExpandirFiltros");

  botaoExpandir.setAttribute("aria-expanded", String(aberto));
  if (btnFiltros) {
    btnFiltros.setAttribute("aria-expanded", String(aberto));
    btnFiltros.setAttribute("title", aberto ? "Fechar filtros" : "Abrir filtros");
  }
}

function atualizarEstadoDaBarra() {
  clearTimeout(temporizadorEstadoBarra);
  temporizadorEstadoBarra = setTimeout(() => {
    const barraFiltros = document.getElementById("barraFiltros");
    const espacador = document.getElementById("filtrosEspacador");
    const cabecalho = document.querySelector(".barra-topo");
    const btnFiltros = document.getElementById("btnFiltrosFlutuante");
    const jaRolada = document.body.classList.contains("pagina-rolada");
    const limiteBarra = espacador.getBoundingClientRect().bottom;
    const limiteCabecalho = cabecalho.getBoundingClientRect().bottom;
    const limiteBotao = btnFiltros.getBoundingClientRect().top;
    const rolada = jaRolada
      ? limiteBarra <= limiteBotao
      : limiteBarra <= limiteCabecalho;
    if (rolada === jaRolada) return;

    if (rolada) {
      const estilo = getComputedStyle(barraFiltros);
      const alturaTotal = barraFiltros.offsetHeight +
        parseFloat(estilo.marginTop) +
        parseFloat(estilo.marginBottom);
      espacador.style.height = `${alturaTotal}px`;
      barraFiltros.classList.remove("filtros-abertos");
      document.getElementById("btnExpandirFiltros").setAttribute("aria-expanded", "false");
    } else {
      espacador.style.height = "0px";
      barraFiltros.classList.remove("filtros-abertos");
      document.getElementById("btnExpandirFiltros").setAttribute("aria-expanded", "false");
      btnFiltros.setAttribute("aria-expanded", "false");
      btnFiltros.setAttribute("title", "Abrir filtros");
    }

    document.body.classList.toggle("pagina-rolada", rolada);
  }, 140);
}

// Filtros atuais
let filtros = {
  busca: "",
  cor: "",
  raridade: "",
  tipo: "",
  ordenacao: "padrao"
};

async function carregarCartas() {
  try {
    const respostaJogos = await fetch("catalogos/jogos.json");
    if (!respostaJogos.ok) throw new Error("Não foi possível carregar a lista de jogos.");
    jogosDisponiveis = await respostaJogos.json();
    if (!Array.isArray(jogosDisponiveis)) throw new Error("A lista de jogos está inválida.");

    await Promise.all(jogosDisponiveis.map(async jogo => {
      const respostaCatalogo = await fetch(jogo.catalogo);
      if (!respostaCatalogo.ok) throw new Error(`Não foi possível carregar o catálogo de ${jogo.nome}.`);
      jogo.cartas = await respostaCatalogo.json();
      if (!Array.isArray(jogo.cartas)) throw new Error(`O catálogo de ${jogo.nome} está inválido.`);

      if (typeof jogo.edicoes === "string") {
        const respostaEdicoes = await fetch(jogo.edicoes);
        if (!respostaEdicoes.ok) throw new Error(`Não foi possível carregar as edições de ${jogo.nome}.`);
        jogo.edicoes = await respostaEdicoes.json();
      }
      if (!Array.isArray(jogo.edicoes)) throw new Error(`A lista de edições de ${jogo.nome} está inválida.`);
    }));

    cartas = jogosDisponiveis.flatMap(jogo => jogo.cartas);
    cartasOriginais = [...cartas];

    await carregarDadosAuxiliares();
    recuperarPreferencias();
    mostrarPagina();
    await atualizarEstadoColecao();
    renderizarOpcoesJogos();
  } catch (erro) {
    console.error("Não foi possível preparar o catálogo.", erro);
    document.getElementById("estadoSelecaoEdicao").textContent =
      `${erro.message} Verifique se o servidor está ativo e recarregue a página.`;
  }
}

function renderizarOpcoesJogos() {
  const container = document.getElementById("opcoesJogos");
  container.replaceChildren();

  for (const jogo of jogosDisponiveis) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "opcao-jogo";
    botao.addEventListener("click", () => selecionarJogo(jogo.id));

    const icone = document.createElement("span");
    icone.className = "icone-opcao-jogo";
    icone.setAttribute("aria-hidden", "true");
    icone.textContent = jogo.icone || "🎴";

    const informacoes = document.createElement("span");
    informacoes.className = "informacoes-opcao-edicao";
    const nome = document.createElement("strong");
    nome.textContent = jogo.nome;
    const quantidade = document.createElement("span");
    quantidade.textContent = `${jogo.cartas.length} versões de cartas cadastradas`;
    informacoes.append(nome, quantidade);
    botao.append(icone, informacoes);
    container.appendChild(botao);
  }

  document.getElementById("tituloSelecaoEdicao").textContent = "Escolha um jogo";
  document.getElementById("estadoSelecaoEdicao").textContent =
    "Selecione o jogo cuja coleção deseja gerenciar.";
}

function selecionarJogo(id) {
  const jogo = jogosDisponiveis.find(item => item.id === id);
  if (!jogo) return;

  jogoSelecionado = jogo;
  edicoesDisponiveis = jogo.edicoes;
  localStorage.setItem("jogoGerenciado", jogo.id);
  document.getElementById("opcoesJogos").hidden = true;
  document.getElementById("selecaoEdicoes").hidden = false;
  document.getElementById("tituloSelecaoEdicao").textContent = "Escolha uma edição";
  document.getElementById("tituloEdicoesJogo").textContent = jogo.nome;
  renderizarOpcoesEdicao();
}

function obterCodigoEdicao(carta) {
  if (carta.edicao) return carta.edicao;
  const codigoSerial = carta.serial?.match(/^([A-Z]+\d{2})-/);
  if (codigoSerial) return codigoSerial[1];
  return carta.imagem?.match(/(?:^|\/)([A-Z]+\d{2})\s*-/)?.[1] || null;
}

function renderizarOpcoesEdicao() {
  const container = document.getElementById("opcoesEdicao");
  const avisoSemEdicoes = document.getElementById("avisoSemEdicoes");
  container.replaceChildren();
  avisoSemEdicoes.hidden = edicoesDisponiveis.length > 0;
  if (edicoesDisponiveis.length === 0) {
    avisoSemEdicoes.textContent =
      "Nenhuma edição cadastrada. Adicione as edições em catalogos/cyberpunk/edicoes.json e depois inclua as cartas em catalogos/cyberpunk/cartas.json.";
    document.getElementById("estadoSelecaoEdicao").textContent =
      "A estrutura do catálogo está pronta para receber as edições e cartas.";
    return;
  }

  for (const edicao of edicoesDisponiveis) {
    const quantidade = jogoSelecionado.cartas.filter(carta => obterCodigoEdicao(carta) === edicao.codigo).length;
    const disponivel = quantidade > 0;
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "opcao-edicao";
    botao.disabled = !disponivel;
    botao.setAttribute("aria-label", disponivel
      ? `${edicao.codigo}${edicao.nome ? ` - ${edicao.nome}` : ""}, ${quantidade} cartas`
      : `${edicao.codigo}, cartas ainda não cadastradas`);

    if (edicao.imagem) {
      const imagem = document.createElement("img");
      imagem.src = edicao.imagem;
      imagem.alt = "";
      imagem.loading = "eager";
      botao.appendChild(imagem);
    } else {
      const imagem = document.createElement("span");
      imagem.className = "icone-opcao-jogo";
      imagem.setAttribute("aria-hidden", "true");
      imagem.textContent = jogoSelecionado.icone || "🎴";
      botao.appendChild(imagem);
    }

    const informacoes = document.createElement("span");
    informacoes.className = "informacoes-opcao-edicao";
    const nome = document.createElement("strong");
    nome.textContent = edicao.nome ? `${edicao.codigo} · ${edicao.nome}` : edicao.codigo;
    const estado = document.createElement("span");
    estado.textContent = disponivel
      ? `${quantidade} versões de cartas`
      : "Cartas ainda não cadastradas";
    informacoes.append(nome, estado);
    botao.appendChild(informacoes);

    if (disponivel) {
      botao.addEventListener("click", () => selecionarEdicao(edicao.codigo));
    }
    container.appendChild(botao);
  }

  document.getElementById("estadoSelecaoEdicao").textContent =
    "Selecione uma edição para abrir o catálogo. Edições sem cartas cadastradas aparecem indisponíveis.";
}

function selecionarEdicao(codigo) {
  const edicao = edicoesDisponiveis.find(item => item.codigo === codigo);
  if (!edicao) return;

  cartasDaEdicao = jogoSelecionado.cartas.filter(carta => obterCodigoEdicao(carta) === codigo);
  if (cartasDaEdicao.length === 0) return;

  edicaoSelecionada = edicao;
  catalogoDescritores = null;
  cartasFiltradas = [...cartasDaEdicao];
  pagina = 0;
  filtros = { busca: "", cor: "", raridade: "", tipo: "", ordenacao: "padrao" };
  document.getElementById("busca").value = "";
  document.getElementById("cor").value = "";
  document.getElementById("raridade").value = "";
  document.getElementById("tipo").value = "";
  document.getElementById("ordenacao").value = "padrao";
  document.getElementById("visualizacao").value = "grid";
  document.getElementById("cartasPorPagina").value = "9";
  visualizacao = "grid";

  document.getElementById("nomeEdicaoAtual").textContent =
    edicao.nome ? `${edicao.codigo} · ${edicao.nome}` : edicao.codigo;
  document.getElementById("nomeJogoAtual").textContent = jogoSelecionado.nome;
  document.getElementById("selecaoEdicoes").hidden = false;
  document.getElementById("seletorEdicao").hidden = true;
  document.getElementById("paginaCatalogo").hidden = false;
  document.body.classList.remove("pagina-rolada");
  document.getElementById("filtrosEspacador").style.height = "0px";
  aplicarOrdenacao();
  mostrarPagina();
  window.scrollTo(0, 0);
  atualizarBotaoVoltarTopo();
}

function voltarParaSelecaoEdicao() {
  document.getElementById("paginaCatalogo").hidden = true;
  document.getElementById("seletorEdicao").hidden = false;
  document.getElementById("opcoesJogos").hidden = true;
  document.getElementById("selecaoEdicoes").hidden = false;
  document.body.classList.remove("pagina-rolada");
  document.getElementById("barraFiltros").classList.remove("filtros-abertos");
  document.getElementById("btnExpandirFiltros").setAttribute("aria-expanded", "false");
  document.getElementById("btnFiltrosFlutuante").setAttribute("aria-expanded", "false");
  document.getElementById("filtrosEspacador").style.height = "0px";
  window.scrollTo(0, 0);
  atualizarBotaoVoltarTopo();
}

function voltarParaSelecaoJogos() {
  document.getElementById("paginaCatalogo").hidden = true;
  document.getElementById("seletorEdicao").hidden = false;
  document.getElementById("opcoesJogos").hidden = false;
  document.getElementById("selecaoEdicoes").hidden = true;
  renderizarOpcoesJogos();
  document.body.classList.remove("pagina-rolada");
  document.getElementById("barraFiltros").classList.remove("filtros-abertos");
  document.getElementById("filtrosEspacador").style.height = "0px";
  window.scrollTo(0, 0);
  atualizarBotaoVoltarTopo();
}

async function carregarDadosAuxiliares() {
  for (let carta of cartas) {
    // Se os dados já existem no JSON, não precisa recarregar
    if (!carta.cor || carta.cor === undefined) {
      try {
        const resposta = await fetch(carta.descricao);
        if (!resposta.ok) {
          carta.cor = "Desconhecida";
          carta.tipo = "Desconhecido";
          carta.raridade = "Desconhecida";
          continue;
        }
        const texto = await resposta.text();
        
        // Extrair cor
        const matchCor = texto.match(/COLOR\s+(\w+)/);
        carta.cor = matchCor ? matchCor[1] : "Desconhecida";
        
        // Extrair tipo
        const matchTipo = texto.match(/TYPE\s+(\w+)/);
        carta.tipo = matchTipo ? matchTipo[1] : "Desconhecido";
        
        // Extrair raridade
        const matchRaridade = texto.match(/RARITY\s+(\w+)/);
        carta.raridade = matchRaridade ? matchRaridade[1] : "Desconhecida";
        
      } catch (erro) {
        carta.cor = "Desconhecida";
        carta.tipo = "Desconhecido";
        carta.raridade = "Desconhecida";
      }
    }
  }
}

function recuperarPreferencias() {
  const temaSalvo = localStorage.getItem("tema");
  if (temaSalvo) {
    temaCurrent = temaSalvo;
    if (temaCurrent === "light") {
      document.body.classList.add("light-mode");
      document.getElementById("btnTema").textContent = "☀️";
    }
  }
}

function aplicarFiltros() {
  // Ler valores dos filtros
  filtros.busca = document.getElementById("busca").value.toLowerCase();
  filtros.cor = document.getElementById("cor").value;
  filtros.raridade = document.getElementById("raridade").value;
  filtros.tipo = document.getElementById("tipo").value;
  filtros.ordenacao = document.getElementById("ordenacao").value;

  // Aplicar filtros
  cartasFiltradas = cartasDaEdicao.filter(carta => {
    const passouBusca =
      carta.nome.toLowerCase().includes(filtros.busca) ||
      carta.serial.toLowerCase().includes(filtros.busca);
    const passouCor = !filtros.cor || carta.cor === filtros.cor;
    const passouRaridade = !filtros.raridade || carta.raridade === filtros.raridade;
    const passouTipo = !filtros.tipo || carta.tipo === filtros.tipo;

    return passouBusca && passouCor && passouRaridade && passouTipo;
  });

  // Aplicar ordenação
  aplicarOrdenacao();

  // Voltar para página 1
  pagina = 0;
  mostrarPagina();
}

function aplicarOrdenacao() {
  switch (filtros.ordenacao) {
    case "nome":
      cartasFiltradas.sort((a, b) => a.nome.localeCompare(b.nome));
      break;
    case "raridade":
      const ordemRaridade = { "LR": 0, "R": 1, "LR+": 2, "U": 3, "C": 4 };
      cartasFiltradas.sort((a, b) => {
        const rarA = ordemRaridade[a.raridade] ?? 5;
        const rarB = ordemRaridade[b.raridade] ?? 5;
        return rarA - rarB;
      });
      break;
    case "tipo":
      cartasFiltradas.sort((a, b) => a.tipo.localeCompare(b.tipo));
      break;
  }
}

function mostrarPagina() {
  const catalogo = document.getElementById("catalogo");
  catalogo.innerHTML = "";

  atualizarGridColunas();

  // Mostrar todas as cartas da coleção (sem paginação)
  const cartasPagina = cartasFiltradas.slice();

  if (visualizacao === "grid") {
    cartasPagina.forEach(carta => {
      const div = document.createElement("div");
      div.className = "carta";
      div.innerHTML = `
        <img src="${carta.imagem}" alt="${carta.nome}" loading="lazy">
      `;
      div.appendChild(criarControlesQuantidade(carta));
      div.onclick = () => abrirModal(carta);
      catalogo.appendChild(div);
    });
  } else {
    // Vista em lista
    cartasPagina.forEach(carta => {
      const div = document.createElement("div");
      div.className = "carta";
      div.innerHTML = `
        <img src="${carta.imagem}" alt="${carta.nome}" loading="lazy">
        <div>
          <div class="nome-carta">${carta.nome}</div>
          <div class="carta-info">
            <div class="carta-info-linha">
              <div class="carta-info-item">
                <span class="info-label">Cor:</span>
                <span>${carta.cor}</span>
              </div>
              <div class="carta-info-item">
                <span class="info-label">Tipo:</span>
                <span>${carta.tipo}</span>
              </div>
              <div class="carta-info-item">
                <span class="info-label">Raridade:</span>
                <span>${carta.raridade}</span>
              </div>
            </div>
          </div>
        </div>
      `;
      div.appendChild(criarControlesQuantidade(carta));
      div.onclick = () => abrirModal(carta);
      catalogo.appendChild(div);
    });
  }

  // Ocultar controles de paginação e atualizar informação simplificada
  atualizarBotoesPaginacao();
  atualizarInfoPaginacao();
}

function criarControlesQuantidade(carta) {
  const controles = document.createElement("div");
  controles.className = "controles-quantidade";

  const remover = document.createElement("button");
  remover.type = "button";
  remover.className = "quantidade-btn";
  remover.textContent = "−";
  remover.setAttribute("aria-label", `Remover uma cópia de ${carta.nome}`);

  const quantidade = document.createElement("span");
  quantidade.className = "quantidade-valor";
  quantidade.setAttribute("aria-label", "Quantidade na coleção");

  const adicionar = document.createElement("button");
  adicionar.type = "button";
  adicionar.className = "quantidade-btn";
  adicionar.textContent = "+";
  adicionar.setAttribute("aria-label", `Adicionar uma cópia de ${carta.nome}`);

  remover.addEventListener("click", event => alterarQuantidade(event, carta, -1));
  adicionar.addEventListener("click", event => alterarQuantidade(event, carta, 1));
  controles.append(remover, quantidade, adicionar);
  atualizarContadorQuantidade(controles, carta);
  return controles;
}

function atualizarContadorQuantidade(controles, carta) {
  const quantidadeAtual = quantidadesEdicao[carta.imagem] || 0;
  controles.querySelector(".quantidade-valor").textContent = String(quantidadeAtual);
  controles.querySelector(".quantidade-btn").disabled = quantidadeAtual === 0;
}

function alterarQuantidade(event, carta, delta) {
  event.stopPropagation();
  const quantidadeAtual = quantidadesEdicao[carta.imagem] || 0;
  const novaQuantidade = Math.max(0, Math.min(9999, quantidadeAtual + delta));
  if (novaQuantidade === quantidadeAtual) return;

  if (novaQuantidade === 0) delete quantidadesEdicao[carta.imagem];
  else quantidadesEdicao[carta.imagem] = novaQuantidade;

  atualizarContadorQuantidade(event.currentTarget.parentElement, carta);
  atualizarEstadoDoBotaoSalvar();
}

function existeAlteracaoNaoSalva() {
  return cartasOriginais.some(carta =>
    (inventarioSalvo[carta.imagem] || 0) !== (quantidadesEdicao[carta.imagem] || 0)
  );
}

function atualizarEstadoDoBotaoSalvar() {
  const botaoSalvar = document.getElementById("btnSalvarColecao");
  const estado = document.getElementById("estadoColecao");
  if (!botaoSalvar || !estado) return;

  const alterada = existeAlteracaoNaoSalva();
  botaoSalvar.disabled = Boolean(usuarioAutenticado) && !alterada;
  if (usuarioAutenticado) {
    estado.textContent = alterada
      ? "Há alterações não salvas."
      : `Conectado como ${usuarioAutenticado}.`;
  } else {
    estado.textContent = alterada
      ? "Entre ou crie uma conta para salvar as quantidades."
      : "Adicione ou remova cópias e salve na sua coleção.";
  }
}

function carregarRascunhoColecao() {
  const rascunho = sessionStorage.getItem("rascunhoColecao");
  if (!rascunho) return null;
  try {
    return JSON.parse(rascunho);
  } catch (erro) {
    console.error("O rascunho da coleção não pôde ser recuperado.", erro);
    sessionStorage.removeItem("rascunhoColecao");
    return null;
  }
}

function quantidadesValidas(quantidades) {
  if (!quantidades || typeof quantidades !== "object" || Array.isArray(quantidades)) return {};
  const imagensConhecidas = new Set(cartas.map(carta => carta.imagem));
  return Object.fromEntries(
    Object.entries(quantidades).filter(([imagem, quantidade]) =>
      imagensConhecidas.has(imagem) &&
      Number.isSafeInteger(quantidade) &&
      quantidade > 0 &&
      quantidade <= 9999
    )
  );
}

async function atualizarEstadoColecao() {
  const linkAcesso = document.getElementById("linkAcesso");
  const botaoSair = document.getElementById("btnSair");
  const rascunho = carregarRascunhoColecao();
  const salvarDepoisDoLogin = new URLSearchParams(location.search).get("salvar") === "1";

  try {
    const respostaSessao = await fetch("/api/session");
    if (!respostaSessao.ok) throw new Error("Não foi possível verificar a sessão.");
    const sessao = await respostaSessao.json();
    usuarioAutenticado = sessao.authenticated ? sessao.username : null;

    if (usuarioAutenticado) {
      const respostaColecao = await fetch("/api/collection");
      if (!respostaColecao.ok) {
        const erro = await respostaColecao.json();
        throw new Error(erro.error || "Não foi possível carregar a coleção.");
      }
      const colecao = await respostaColecao.json();
      inventarioSalvo = quantidadesValidas(colecao.quantities);
      revisaoColecao = colecao.revision;
      quantidadesEdicao = salvarDepoisDoLogin && rascunho
        ? quantidadesValidas(rascunho)
        : { ...inventarioSalvo };
    } else {
      inventarioSalvo = {};
      quantidadesEdicao = rascunho ? quantidadesValidas(rascunho) : {};
    }

    linkAcesso.hidden = Boolean(usuarioAutenticado);
    botaoSair.hidden = !usuarioAutenticado;
    if (!usuarioAutenticado) {
      linkAcesso.href = "/acesso.html?voltar=%2F";
    }
    mostrarPagina();
    atualizarEstadoDoBotaoSalvar();

    if (usuarioAutenticado && salvarDepoisDoLogin && rascunho) {
      sessionStorage.removeItem("rascunhoColecao");
      history.replaceState(null, "", "/");
      await salvarColecao();
    }
  } catch (erro) {
    console.error("Não foi possível carregar a sessão da coleção.", erro);
    document.getElementById("estadoColecao").textContent =
      "Não foi possível conectar ao servidor. Verifique a conexão HTTPS e tente novamente.";
    linkAcesso.hidden = false;
    botaoSair.hidden = true;
  }
}

async function salvarColecao() {
  const botaoSalvar = document.getElementById("btnSalvarColecao");
  const estado = document.getElementById("estadoColecao");
  if (!usuarioAutenticado) {
    sessionStorage.setItem("rascunhoColecao", JSON.stringify(quantidadesEdicao));
    location.href = "/acesso.html?voltar=%2F&salvar=1";
    return;
  }

  botaoSalvar.disabled = true;
  estado.textContent = "Salvando coleção...";
  try {
    const resposta = await fetch("/api/collection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revision: revisaoColecao,
        quantities: quantidadesValidas(quantidadesEdicao)
      })
    });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.error || "Não foi possível salvar a coleção.");

    revisaoColecao = resultado.revision;
    inventarioSalvo = quantidadesValidas(resultado.quantities);
    quantidadesEdicao = { ...inventarioSalvo };
    estado.textContent = "Coleção salva e sincronizada com os outros aparelhos.";
  } catch (erro) {
    estado.textContent = erro.message;
    if (respostaUnauthorized(erro)) {
      usuarioAutenticado = null;
      const linkAcesso = document.getElementById("linkAcesso");
      linkAcesso.href = "/acesso.html?voltar=%2F";
      linkAcesso.hidden = false;
      document.getElementById("btnSair").hidden = true;
    }
    console.error("Não foi possível salvar a coleção.", erro);
  } finally {
    atualizarEstadoDoBotaoSalvar();
    if (estado.textContent === `Conectado como ${usuarioAutenticado}.`) {
      estado.textContent = "Coleção salva e sincronizada com os outros aparelhos.";
    }
  }
}

function respostaUnauthorized(erro) {
  return erro.message === "Entre na sua conta para acessar a coleção.";
}

async function sairDaConta() {
  try {
    const resposta = await fetch("/api/logout", { method: "POST" });
    if (!resposta.ok) throw new Error("Não foi possível encerrar a sessão.");
    usuarioAutenticado = null;
    inventarioSalvo = {};
    quantidadesEdicao = {};
    window.location.reload();
  } catch (erro) {
    document.getElementById("estadoColecao").textContent = erro.message;
  }
}

function atualizarBotoesPaginacao() {
  // Ao exibir todas as cartas, escondemos a seção de paginação inteira
  const pag = document.querySelector('.paginacao');
  if (pag) pag.style.display = 'none';
}

function atualizarInfoPaginacao() {
  const totalCartas = cartasFiltradas.length;
  const elem = document.getElementById("paginaAtual");
  if (elem) elem.innerText = `Mostrando ${totalCartas} cartas`;

  // Esconder seletores não usados
  const seletor = document.getElementById('cartasPorPagina');
  if (seletor && seletor.parentElement) seletor.parentElement.style.display = 'none';
  const seletorVis = document.getElementById('visualizacao');
  if (seletorVis && seletorVis.parentElement) seletorVis.parentElement.style.display = 'none';
}

async function abrirModal(carta) {
  document.getElementById("modal").style.display = "flex";
  document.getElementById("modalImagem").src = carta.imagem;
  document.getElementById("modalTitulo").innerText = carta.nome;

  if (!carta.descricao) {
    document.getElementById("modalDescricao").innerText = "Descrição ainda não cadastrada.";
    return;
  }

  try {
    const resposta = await fetch(carta.descricao);
    if (!resposta.ok) throw new Error("Não foi possível carregar a descrição da carta.");
    const texto = await resposta.text();
    document.getElementById("modalDescricao").innerText = texto;
  } catch (erro) {
    document.getElementById("modalDescricao").innerText = "Erro ao carregar descrição";
  }
}

function fecharModal() {
  document.getElementById("modal").style.display = "none";
}

function abrirLeitorCamera() {
  const entrada = document.getElementById("cameraFoto");
  entrada.value = "";
  entrada.click();
}

function fecharLeitorCamera() {
  const leitor = document.getElementById("cameraLeitor");
  leitor.classList.remove("aberto");
  leitor.setAttribute("aria-hidden", "true");
}

function carregarOpenCV() {
  if (!openCvPromise) {
    openCvPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "node_modules/@techstark/opencv-js/dist/opencv.js";
      script.onload = async () => {
        try {
          const cv = await window.cv;
          if (!cv || !cv.ORB || !cv.BFMatcher || !cv.findHomography) {
            throw new Error("A biblioteca de reconhecimento de imagens não carregou corretamente.");
          }
          resolve(cv);
        } catch (erro) {
          reject(erro);
        }
      };
      script.onerror = () => reject(new Error("Não foi possível carregar a biblioteca de reconhecimento de imagens."));
      document.head.appendChild(script);
    });
  }
  return openCvPromise;
}

async function carregarImagem(src) {
  const imagem = new Image();
  imagem.src = src;
  await imagem.decode();
  return imagem;
}

function extrairDescritores(imagem, cv, orb) {
  const original = cv.imread(imagem);
  const cinza = new cv.Mat();
  const normalizada = new cv.Mat();
  const pontos = new cv.KeyPointVector();
  const descritores = new cv.Mat();
  const mascara = new cv.Mat();
  let redimensionada;
  let clahe;

  try {
    const maiorLado = Math.max(original.cols, original.rows);
    let imagemProcessada = original;
    if (maiorLado > 1400) {
      const escala = 1400 / maiorLado;
      redimensionada = new cv.Mat();
      cv.resize(
        original,
        redimensionada,
        new cv.Size(Math.round(original.cols * escala), Math.round(original.rows * escala)),
        0,
        0,
        cv.INTER_AREA
      );
      imagemProcessada = redimensionada;
    }

    cv.cvtColor(imagemProcessada, cinza, cv.COLOR_RGBA2GRAY);
    clahe = new cv.CLAHE(2, new cv.Size(8, 8));
    clahe.apply(cinza, normalizada);
    mascara.setTo(new cv.Scalar(255));
    orb.detectAndCompute(normalizada, mascara, pontos, descritores);
    const coordenadas = [];
    for (let indice = 0; indice < pontos.size(); indice++) {
      const ponto = pontos.get(indice).pt;
      coordenadas.push(ponto.x, ponto.y);
    }

    return {
      coordenadas,
      matriz: criarMatrizDescritores(descritores, cv),
      linhas: descritores.rows,
      colunas: descritores.cols
    };
  } finally {
    original.delete();
    cinza.delete();
    normalizada.delete();
    pontos.delete();
    descritores.delete();
    mascara.delete();
    if (redimensionada) redimensionada.delete();
    if (clahe) clahe.delete();
  }
}

function criarMatrizDescritores(descritores, cv) {
  const matriz = new cv.Mat(descritores.rows, descritores.cols, cv.CV_8UC1);
  matriz.data.set(descritores.data);
  return matriz;
}

async function obterDescritoresCarta(carta, cv, orb) {
  if (descritoresCartas.has(carta.imagem)) {
    return descritoresCartas.get(carta.imagem);
  }

  const imagem = await carregarImagem(carta.imagem);
  const descritores = extrairDescritores(imagem, cv, orb);
  descritoresCartas.set(carta.imagem, descritores);
  return descritores;
}

function contarCorrespondenciasGeometricas(correspondencias, foto, referencia, cv) {
  const pontosFoto = [];
  const pontosReferencia = [];

  for (const [indiceFoto, indiceReferencia] of correspondencias) {
    const pontoFoto = indiceFoto * 2;
    pontosFoto.push(foto.coordenadas[pontoFoto], foto.coordenadas[pontoFoto + 1]);
    pontosReferencia.push(
      referencia.descritores.coordenadas[indiceReferencia * 2],
      referencia.descritores.coordenadas[indiceReferencia * 2 + 1]
    );
  }

  if (pontosFoto.length < 8) {
    return 0;
  }

  const origem = cv.matFromArray(pontosFoto.length / 2, 1, cv.CV_32FC2, pontosFoto);
  const destino = cv.matFromArray(pontosReferencia.length / 2, 1, cv.CV_32FC2, pontosReferencia);
  const mascara = new cv.Mat();
  let homografia;
  try {
    homografia = cv.findHomography(origem, destino, cv.RANSAC, 8, mascara);
    return homografia.empty() ? 0 : cv.countNonZero(mascara);
  } finally {
    origem.delete();
    destino.delete();
    mascara.delete();
    if (homografia) homografia.delete();
  }
}

async function reconhecerCarta(imagem) {
  const status = document.getElementById("cameraStatus");
  const resultado = document.getElementById("cameraResultado");
  const botaoTentarNovamente = document.getElementById("cameraTentarNovamente");
  resultado.hidden = true;
  botaoTentarNovamente.disabled = true;
  status.textContent = "Carregando o reconhecimento de imagens...";

  let cv;
  let orb;
  let comparador;
  let descritoresFoto;
  let correspondencias;
  let foto;
  try {
    await cartasProntas;
    if (!edicaoSelecionada || cartasDaEdicao.length === 0) {
      throw new Error("Selecione uma coleção antes de identificar uma carta.");
    }
    cv = await carregarOpenCV();
    orb = new cv.ORB();
    orb.setMaxFeatures(900);
    orb.setFastThreshold(10);
    comparador = new cv.BFMatcher(cv.NORM_HAMMING, true);

    status.textContent = "Analisando a foto...";
    foto = extrairDescritores(imagem, cv, orb);
    if (foto.linhas < 8) {
      status.textContent = "Não consegui ler detalhes suficientes. Tente uma foto mais próxima e bem iluminada.";
      return;
    }

    if (!catalogoDescritores) {
      const referencias = [];
      for (let indice = 0; indice < cartasDaEdicao.length; indice++) {
        const carta = cartasDaEdicao[indice];
        try {
          referencias.push({
            carta,
            descritores: await obterDescritoresCarta(carta, cv, orb)
          });
        } catch (erro) {
          console.error(`Não foi possível analisar a imagem da carta ${carta.serial}.`, erro);
        }

        if ((indice + 1) % 4 === 0 || indice === cartasDaEdicao.length - 1) {
          status.textContent = `Preparando catálogo: ${indice + 1} de ${cartasDaEdicao.length} imagens...`;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      if (referencias.length === 0) {
        throw new Error("Não foi possível analisar nenhuma imagem do catálogo.");
      }

      status.textContent = "Preparando imagens para comparação...";
      catalogoDescritores = referencias;
    }

    descritoresFoto = foto.matriz;
    const melhoresCandidatos = [];
    for (let indice = 0; indice < catalogoDescritores.length; indice++) {
      const referencia = catalogoDescritores[indice];
      correspondencias = new cv.DMatchVector();
      comparador.match(descritoresFoto, referencia.descritores.matriz, correspondencias);

      const pontosCorrespondentes = [];
      for (let posicao = 0; posicao < correspondencias.size(); posicao++) {
        const correspondencia = correspondencias.get(posicao);
        if (correspondencia.distance < 65) {
          pontosCorrespondentes.push([correspondencia.queryIdx, correspondencia.trainIdx]);
        }
      }
      correspondencias.delete();
      correspondencias = null;

      if (pontosCorrespondentes.length >= 8) {
        melhoresCandidatos.push({ referencia, correspondencias: pontosCorrespondentes });
      }

      if ((indice + 1) % 12 === 0 || indice === catalogoDescritores.length - 1) {
        status.textContent = `Comparando com o catálogo: ${indice + 1} de ${catalogoDescritores.length} cartas...`;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    melhoresCandidatos.sort((a, b) => b.correspondencias.length - a.correspondencias.length);
    melhoresCandidatos.length = Math.min(melhoresCandidatos.length, 8);
    let melhorResultado = null;
    let melhorPontuacao = 0;

    status.textContent = "Conferindo as cartas mais parecidas...";
    for (const candidato of melhoresCandidatos) {
      candidato.pontuacao = contarCorrespondenciasGeometricas(
        candidato.correspondencias,
        foto,
        candidato.referencia,
        cv
      );
      if (candidato.pontuacao > melhorPontuacao) {
        melhorPontuacao = candidato.pontuacao;
        melhorResultado = candidato.referencia.carta;
      }
    }

    if (!melhorResultado || melhorPontuacao < 12) {
      status.textContent = "Não encontrei uma correspondência segura. Tente enquadrar a carta inteira, sem reflexos e com boa iluminação.";
      return;
    }

    cartaIdentificada = melhorResultado;
    document.getElementById("cameraCartaImagem").src = melhorResultado.imagem;
    document.getElementById("cameraCartaNome").textContent = melhorResultado.nome;
    document.getElementById("cameraCartaDetalhes").textContent =
      `${melhorResultado.serial} · ${melhorResultado.raridade} · ${
        melhorPontuacao >= 20 ? "correspondência visual forte" : "correspondência visual possível"
      }`;
    resultado.hidden = false;
    status.textContent = "Carta identificada:";
  } catch (erro) {
    console.error("Erro ao identificar a carta pela câmera.", erro);
    status.textContent = `Não foi possível identificar a carta: ${erro.message}`;
  } finally {
    botaoTentarNovamente.disabled = false;
    if (descritoresFoto) descritoresFoto.delete();
    if (correspondencias) correspondencias.delete();
    if (comparador) comparador.delete();
    if (orb) orb.delete();
  }
}

function proximaPagina() {
  if ((pagina + 1) * cartasPorPagina < cartasFiltradas.length) {
    pagina++;
    mostrarPagina();
  }
}

function paginaAnterior() {
  if (pagina > 0) {
    pagina--;
    mostrarPagina();
  }
}

function mudarCartasPorPagina() {
  const valor = document.getElementById("cartasPorPagina").value;
  cartasPorPagina = parseInt(valor);
  pagina = 0;
  mostrarPagina();
}

function mudarVisualizacao() {
  visualizacao = document.getElementById("visualizacao").value;
  const catalogo = document.getElementById("catalogo");
  
  if (visualizacao === "lista") {
    catalogo.classList.add("lista-view");
  } else {
    catalogo.classList.remove("lista-view");
  }
  
  pagina = 0;
  mostrarPagina();
}

function atualizarGridColunas() {
  const catalogo = document.getElementById("catalogo");
  
  if (visualizacao === "lista") {
    return;
  }

  // Mantém seis colunas no PC; o CSS reduz para três em telas pequenas.
  catalogo.style.gridTemplateColumns = 'repeat(6, minmax(0, 1fr))';
}

function alternarTema() {
  if (temaCurrent === "dark") {
    temaCurrent = "light";
    document.body.classList.add("light-mode");
    document.getElementById("btnTema").textContent = "☀️";
  } else {
    temaCurrent = "dark";
    document.body.classList.remove("light-mode");
    document.getElementById("btnTema").textContent = "🌙";
  }
  
  // Salvar preferência
  localStorage.setItem("tema", temaCurrent);
}

// Fechar modal ao clicar fora
window.onclick = function(event) {
  const modal = document.getElementById("modal");
  if (event.target === modal) {
    fecharModal();
  }
}

window.addEventListener("scroll", atualizarEstadoDaBarra, { passive: true });
atualizarEstadoDaBarra();

const btnVoltarTopo = document.getElementById("btnVoltarTopo");
function atualizarBotaoVoltarTopo() {
  const posicaoRolagem = Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop
  );
  btnVoltarTopo.hidden = document.getElementById("paginaCatalogo").hidden || posicaoRolagem < 240;
}

window.addEventListener("scroll", atualizarBotaoVoltarTopo, { passive: true });
document.addEventListener("scroll", atualizarBotaoVoltarTopo, { passive: true, capture: true });
window.addEventListener("pageshow", atualizarBotaoVoltarTopo);
atualizarBotaoVoltarTopo();
btnVoltarTopo.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
  });
});

// Carregar cartas ao abrir a página
const cartasProntas = carregarCartas();

document.getElementById("btnCamera").addEventListener("click", abrirLeitorCamera);
document.getElementById("btnExpandirFiltros").addEventListener("click", alternarFiltros);
document.getElementById("btnSalvarColecao").addEventListener("click", salvarColecao);
document.getElementById("btnSair").addEventListener("click", sairDaConta);
document.getElementById("btnTrocarEdicao").addEventListener("click", voltarParaSelecaoEdicao);
document.getElementById("btnTrocarJogo").addEventListener("click", voltarParaSelecaoJogos);
document.getElementById("btnVoltarJogos").addEventListener("click", voltarParaSelecaoJogos);
document.getElementById("linkJogos").addEventListener("click", evento => {
  evento.preventDefault();
  voltarParaSelecaoJogos();
});
document.getElementById("cameraFechar").addEventListener("click", fecharLeitorCamera);
document.getElementById("cameraFoto").addEventListener("change", async evento => {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;

  const leitor = document.getElementById("cameraLeitor");
  const status = document.getElementById("cameraStatus");
  const preview = document.getElementById("cameraPreview");
  status.textContent = "Preparando a foto para análise...";
  leitor.classList.add("aberto");
  leitor.setAttribute("aria-hidden", "false");
  document.getElementById("cameraResultado").hidden = true;
  cartaIdentificada = null;

  if (cameraFotoUrl) URL.revokeObjectURL(cameraFotoUrl);
  cameraFotoUrl = URL.createObjectURL(arquivo);
  preview.src = cameraFotoUrl;
  preview.hidden = false;

  try {
    const imagem = await carregarImagem(cameraFotoUrl);
    await reconhecerCarta(imagem);
  } catch (erro) {
    console.error("A foto não pôde ser aberta.", erro);
    status.textContent = "Não foi possível abrir a foto. Tente tirar outra imagem.";
  }
});
document.getElementById("cameraTentarNovamente").addEventListener("click", abrirLeitorCamera);
document.getElementById("cameraAbrirCarta").addEventListener("click", () => {
  if (!cartaIdentificada) return;
  const carta = cartaIdentificada;
  fecharLeitorCamera();
  abrirModal(carta);
});