const collectionStatus = document.getElementById("estadoColecao");
const collectionContent = document.getElementById("conteudoColecao");
const ownedCardsContainer = document.getElementById("cartasColecao");
const editionProgressContainer = document.getElementById("edicoesColecao");
const editionOverview = document.getElementById("visaoEdicoes");
const editionCardsView = document.getElementById("visaoCartasEdicao");
let ownedCards = [];
let selectedEdition = null;
let availableGames = [];
let currentGame = null;
let currentCatalog = [];
let currentEditions = [];
let savedQuantities = {};

function belongsToEdition(card, edition) {
  return card.edicao === edition.codigo || card.serial.startsWith(`${edition.codigo}-`);
}

function renderEditionProgress(catalog, quantities) {
  editionProgressContainer.replaceChildren();
  const emptyMessage = document.getElementById("avisoEdicoesVazias");
  emptyMessage.hidden = currentEditions.length > 0;
  if (currentEditions.length === 0) {
    emptyMessage.textContent =
      "Nenhuma edição cadastrada para este jogo. Adicione as edições em catalogos/cyberpunk/edicoes.json.";
  }

  for (const edition of currentEditions) {
    const editionCards = catalog.filter(card => belongsToEdition(card, edition));

    const ownedCount = editionCards.filter(card => (quantities[card.imagem] || 0) > 0).length;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "edicao-colecao";
    item.disabled = editionCards.length === 0;
    if (editionCards.length > 0) {
      item.addEventListener("click", () => selectEdition(edition));
    }

    const title = document.createElement("span");
    title.className = "nome-edicao";
    title.textContent = edition.nome ? `${edition.codigo} · ${edition.nome}` : edition.codigo;

    if (edition.imagem) {
      const image = document.createElement("img");
      image.src = edition.imagem;
      image.alt = `Pacote da edição ${edition.codigo}`;
      image.loading = "lazy";
      item.appendChild(image);
    } else {
      const icon = document.createElement("span");
      icon.className = "icone-opcao-jogo";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = currentGame.icone || "🎴";
      item.appendChild(icon);
    }

    const count = document.createElement("span");
    count.className = "contagem-edicao";
    count.textContent = editionCards.length
      ? `${ownedCount.toLocaleString("pt-BR")} de ${editionCards.length.toLocaleString("pt-BR")} ${editionCards.length === 1 ? "carta" : "cartas"}`
      : "Cartas ainda não cadastradas";

    item.append(title, count);
    if (editionCards.length > 0) {
      const progress = document.createElement("progress");
      progress.className = "barra-progresso-edicao";
      progress.max = editionCards.length;
      progress.value = ownedCount;
      progress.setAttribute("aria-label", `Progresso da edição ${edition.codigo}`);
      item.appendChild(progress);
    }
    editionProgressContainer.appendChild(item);
  }
}

function createOwnedCard(card, quantity) {
  const item = document.createElement("article");
  item.className = "item-colecao";

  const image = document.createElement("img");
  image.src = card.imagem;
  image.alt = card.nome;
  image.loading = "lazy";

  const information = document.createElement("div");
  information.className = "informacao-item-colecao";

  const serial = document.createElement("span");
  serial.className = "serial-colecao";
  serial.textContent = `${card.serial} · ${card.raridade}`;

  const name = document.createElement("strong");
  name.textContent = card.nome;

  const count = document.createElement("span");
  count.className = "quantidade-colecao";
  count.textContent = `Quantidade: ${quantity}`;

  information.append(serial, name, count);
  item.append(image, information);
  return item;
}

function renderOwnedCards() {
  if (!selectedEdition) return;

  const search = document.getElementById("buscaColecao").value.trim().toLocaleLowerCase();
  ownedCardsContainer.replaceChildren();
  const cardsInEdition = ownedCards.filter(({ card }) => belongsToEdition(card, selectedEdition));
  const matchingCards = cardsInEdition.filter(({ card }) =>
    card.nome.toLocaleLowerCase().includes(search) ||
    card.serial.toLocaleLowerCase().includes(search)
  );
  for (const { card, quantity } of matchingCards) {
    ownedCardsContainer.appendChild(createOwnedCard(card, quantity));
  }
  const emptyMessage = document.getElementById("colecaoVazia");
  emptyMessage.hidden = cardsInEdition.length > 0 && matchingCards.length > 0;
  if (cardsInEdition.length === 0) {
    emptyMessage.textContent = "Você ainda não possui cartas desta edição.";
  } else if (matchingCards.length === 0) {
    emptyMessage.textContent = "Nenhuma carta encontrada com essa busca.";
  }
}

function selectEdition(edition) {
  selectedEdition = edition;
  document.getElementById("tituloCartasEdicao").textContent =
    edition.nome ? `${edition.codigo} · ${edition.nome}` : edition.codigo;
  document.getElementById("buscaColecao").value = "";
  editionOverview.hidden = true;
  editionCardsView.hidden = false;
  renderOwnedCards();
  window.scrollTo(0, 0);
  updateBackToTopButton();
}

function showEditionOverview() {
  selectedEdition = null;
  editionCardsView.hidden = true;
  editionOverview.hidden = false;
  window.scrollTo(0, 0);
  updateBackToTopButton();
}

function renderSummary(catalog, quantities) {
  const owned = catalog.filter(card => (quantities[card.imagem] || 0) > 0);
  const totalCopies = catalog.reduce((total, card) => total + (quantities[card.imagem] || 0), 0);
  renderEditionProgress(catalog, quantities);
  document.getElementById("cartasPossuidas").textContent = owned.length.toLocaleString("pt-BR");
  document.getElementById("cartasFaltando").textContent = (catalog.length - owned.length).toLocaleString("pt-BR");
  document.getElementById("progressoColecao").textContent =
    `${catalog.length ? (owned.length / catalog.length * 100).toFixed(1).replace(".", ",") : "0"}%`;
  document.getElementById("totalCopias").textContent = totalCopies.toLocaleString("pt-BR");

  ownedCards = owned.map(card => ({ card, quantity: quantities[card.imagem] }));
  renderOwnedCards();
}

function renderSelectedGame() {
  if (!currentGame) return;
  currentCatalog = currentGame.cartas;
  currentEditions = currentGame.edicoes;
  localStorage.setItem("jogoGerenciado", currentGame.id);
  renderSummary(currentCatalog, savedQuantities);
  collectionStatus.textContent =
    `Coleção compartilhada · ${currentCatalog.length} versões no catálogo de ${currentGame.nome}.`;
}

async function loadCollectionPage() {
  try {
    const sessionResponse = await fetch("/api/session");
    if (!sessionResponse.ok) throw new Error("Não foi possível verificar o acesso.");
    const session = await sessionResponse.json();
    if (!session.authenticated) {
      location.replace("/acesso.html?voltar=%2Fcolecao.html");
      return;
    }

    document.getElementById("usuarioLogado").textContent = session.username;
    const [gamesResponse, collectionResponse] = await Promise.all([
      fetch("/catalogos/jogos.json"),
      fetch("/api/collection")
    ]);
    if (!gamesResponse.ok || !collectionResponse.ok) {
      throw new Error("Não foi possível carregar o catálogo ou a coleção.");
    }

    const [games, savedCollection] = await Promise.all([
      gamesResponse.json(),
      collectionResponse.json()
    ]);
    if (!Array.isArray(games)) throw new Error("A lista de jogos está inválida.");
    availableGames = await Promise.all(games.map(async game => {
      const catalogResponse = await fetch(`/${game.catalogo}`);
      if (!catalogResponse.ok) throw new Error(`Não foi possível carregar o catálogo de ${game.nome}.`);
      game.cartas = await catalogResponse.json();
      if (!Array.isArray(game.cartas)) throw new Error(`O catálogo de ${game.nome} está inválido.`);
      if (typeof game.edicoes === "string") {
        const editionsResponse = await fetch(`/${game.edicoes}`);
        if (!editionsResponse.ok) throw new Error(`Não foi possível carregar as edições de ${game.nome}.`);
        game.edicoes = await editionsResponse.json();
      }
      if (!Array.isArray(game.edicoes)) throw new Error(`A lista de edições de ${game.nome} está inválida.`);
      return game;
    }));

    savedQuantities = savedCollection.quantities || {};
    const gameSelector = document.getElementById("jogoColecao");
    gameSelector.replaceChildren(...availableGames.map(game => {
      const option = document.createElement("option");
      option.value = game.id;
      option.textContent = game.nome;
      return option;
    }));
    gameSelector.disabled = false;
    const queryGame = new URLSearchParams(location.search).get("jogo");
    const preferredGame = queryGame || localStorage.getItem("jogoGerenciado");
    currentGame = availableGames.find(game => game.id === preferredGame) || availableGames[0];
    if (!currentGame) throw new Error("Nenhum jogo está cadastrado.");
    gameSelector.value = currentGame.id;
    renderSelectedGame();
    collectionContent.hidden = false;
  } catch (error) {
    collectionStatus.textContent = `${error.message} Verifique a conexão HTTPS e tente novamente.`;
  }
}

document.getElementById("jogoColecao").addEventListener("change", () => {
  const gameSelector = document.getElementById("jogoColecao");
  currentGame = availableGames.find(game => game.id === gameSelector.value);
  selectedEdition = null;
  editionCardsView.hidden = true;
  editionOverview.hidden = false;
  renderSelectedGame();
});
document.getElementById("buscaColecao").addEventListener("input", renderOwnedCards);
const backToTopButton = document.getElementById("btnVoltarTopo");
function updateBackToTopButton() {
  const posicaoRolagem = Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop
  );
  backToTopButton.hidden = editionCardsView.hidden || posicaoRolagem < 240;
}

window.addEventListener("scroll", updateBackToTopButton, { passive: true });
document.addEventListener("scroll", updateBackToTopButton, { passive: true, capture: true });
window.addEventListener("pageshow", updateBackToTopButton);
updateBackToTopButton();
backToTopButton.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
  });
});
document.getElementById("btnVoltarEdicoes").addEventListener("click", showEditionOverview);
document.getElementById("btnSair").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/logout", { method: "POST" });
    if (!response.ok) throw new Error("Não foi possível encerrar a sessão.");
    location.replace("/");
  } catch (error) {
    collectionStatus.textContent = error.message;
  }
});

loadCollectionPage();
