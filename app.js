"use strict";

/* TRUCO ARENA — motor local de treino (sem apostas ou dinheiro real). */
const dialog = document.getElementById("infoDialog");
const title = document.getElementById("dialogTitle");
const body = document.getElementById("dialogBody");
const $ = (id) => document.getElementById(id);

const SUITS = [
  { name: "Ouros", symbol: "♦", red: true, power: 1 },
  { name: "Espadas", symbol: "♠", red: false, power: 2 },
  { name: "Copas", symbol: "♥", red: true, power: 3 },
  { name: "Paus", symbol: "♣", red: false, power: 4 }
];
const VALUES = [
  { name: "4", rank: 1 }, { name: "5", rank: 2 }, { name: "6", rank: 3 },
  { name: "7", rank: 4 }, { name: "Q", rank: 5 }, { name: "J", rank: 6 },
  { name: "K", rank: 7 }, { name: "A", rank: 8 }, { name: "2", rank: 9 },
  { name: "3", rank: 10 }
];
const TARGET = 12;
let game = null;
let stats = loadStats();

function loadStats() {
  try { return JSON.parse(localStorage.getItem("trucoArenaStats")) || { points: 120, wins: 0, losses: 0 }; }
  catch (_) { return { points: 120, wins: 0, losses: 0 }; }
}
function saveStats() {
  localStorage.setItem("trucoArenaStats", JSON.stringify(stats));
  $("points").textContent = stats.points;
  $("wins").textContent = stats.wins;
  $("level").textContent = String(Math.max(1, Math.floor(stats.wins / 3) + 1)).padStart(2, "0");
}
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function createDeck() {
  const deck = [];
  SUITS.forEach(suit => VALUES.forEach(value => deck.push({
    name: value.name, rank: value.rank, suit, id: value.name + suit.name
  })));
  return shuffle(deck);
}
function dealHand() {
  const deck = createDeck();
  game.playerCards = deck.splice(0, 3);
  game.botCards = deck.splice(0, 3);
  game.vira = deck.shift();
  game.trickResults = [];
  game.playerTricks = 0;
  game.botTricks = 0;
  game.round = 1;
  game.tableCards = [];
  game.waitingResponse = false;
  game.turn = "player";
  game.handDone = false;
  game.trucoAskedThisHand = false;
  game.message = "Sua vez. Escolha uma carta.";
  game.botAsked = false;
}
function startGame() {
  game = {
    playerPoints: 0, botPoints: 0, stake: 1,
    playerHands: 0, botHands: 0, finished: false,
    handNumber: 1
  };
  dealHand();
  renderGame();
  if (!dialog.open) dialog.showModal();
}
function manilhaRank() {
  const index = VALUES.findIndex(v => v.name === game.vira.name);
  return VALUES[(index + 1) % VALUES.length].rank;
}
function cardPower(card) {
  if (card.rank === manilhaRank()) return 100 + card.suit.power;
  return card.rank;
}
function cardMarkup(card, extraClass) {
  const color = card.suit.red ? "red" : "";
  return `<div class="played-card ${color} ${extraClass || ""}"><small>${card.name}${card.suit.symbol}</small>${card.suit.symbol}</div>`;
}
function handCardMarkup(card, index) {
  const color = card.suit.red ? "red" : "";
  return `<button class="hand-card ${color}" data-card="${index}" aria-label="Jogar ${card.name} de ${card.suit.name}"><small>${card.name}<br>${card.suit.symbol}</small>${card.suit.symbol}</button>`;
}
function buttonMarkup(label, action, cls) {
  return `<button class="game-btn ${cls || "btn-gold"}" data-action="${action}">${label}</button>`;
}
function scoreHand() {
  const a = game.trickResults;
  if (a.length !== 3) return 0;
  if (a[0] === a[1] && a[0] !== 0) return a[0];
  if (a[0] === 0 && a[1] !== 0) return a[1];
  if (a[0] !== 0 && a[1] === 0) return a[0];
  if (a[0] !== 0 && a[1] !== 0 && a[0] !== a[1]) return a[2] || a[0];
  if (a[0] === 0 && a[1] === 0) return a[2];
  return a[2];
}
function finishHand(winner) {
  game.handDone = true;
  if (winner === 1) {
    game.playerPoints += game.stake;
    game.playerHands++;
    game.message = `Você venceu a mão! +${game.stake} tento(s).`;
  } else if (winner === 2) {
    game.botPoints += game.stake;
    game.botHands++;
    game.message = `O computador venceu a mão! +${game.stake} tento(s).`;
  } else {
    game.message = "Mão empatada. Ninguém marcou tentos.";
  }
  if (game.playerPoints >= TARGET || game.botPoints >= TARGET) {
    game.finished = true;
    const playerWon = game.playerPoints >= TARGET;
    game.message = playerWon ? "🏆 Você venceu a partida!" : "O computador venceu a partida.";
    if (playerWon) stats.wins++; else stats.losses++;
    saveStats();
  }
}
function botChooseCard() {
  if (!game.botCards.length) return 0;
  // O computador tende a guardar cartas fortes, mas não joga sempre ao acaso.
  const sorted = game.botCards.map((card, index) => ({ index, power: cardPower(card) }));
  const playerLast = game.tableCards[0] ? cardPower(game.tableCards[0].card) : 0;
  const winning = sorted.filter(x => x.power > playerLast).sort((a,b) => a.power-b.power);
  if (playerLast && winning.length && Math.random() < 0.62) return winning[0].index;
  return sorted[Math.floor(Math.random() * sorted.length)].index;
}
function maybeBotCallsTruco() {
  if (game.trucoAskedThisHand || game.stake >= 12 || game.waitingResponse || game.handDone) return false;
  const strength = game.botCards.reduce((sum, card) => sum + cardPower(card), 0);
  if (strength > 115 && Math.random() < 0.13) {
    game.waitingResponse = true;
    game.botAsked = true;
    game.trucoAskedThisHand = true;
    game.message = "O computador pediu truco!";
    renderGame();
    return true;
  }
  return false;
}
function playCard(index) {
  if (!game || game.finished || game.handDone || game.waitingResponse || game.turn !== "player") return;
  if (!game.playerCards[index]) return;
  const playerCard = game.playerCards.splice(index, 1)[0];
  const botIndex = botChooseCard();
  const botCard = game.botCards.splice(botIndex, 1)[0];
  game.tableCards = [{ card: playerCard, owner: 1 }, { card: botCard, owner: 2 }];
  const p = cardPower(playerCard), b = cardPower(botCard);
  const winner = p > b ? 1 : b > p ? 2 : 0;
  game.trickResults.push(winner);
  if (winner === 1) game.playerTricks++;
  if (winner === 2) game.botTricks++;
  game.message = winner === 1 ? "Você venceu esta rodada!" : winner === 2 ? "O computador venceu esta rodada!" : "Rodada empatada!";
  game.round = game.trickResults.length;
  if (game.trickResults.length === 3) {
    finishHand(scoreHand());
  } else {
    game.turn = "player";
  }
  renderGame();
  if (!game.handDone && !game.finished) {
    // A chamada do computador pode aparecer antes da próxima jogada.
    window.setTimeout(() => { if (game && !game.handDone && !game.finished) maybeBotCallsTruco(); }, 500);
  }
}
function requestTruco() {
  if (!game || game.finished || game.handDone || game.waitingResponse || game.stake >= 12 || game.trucoAskedThisHand) return;
  game.waitingResponse = true;
  game.botAsked = false;
  game.trucoAskedThisHand = true;
  game.message = "Você pediu truco. O computador vai responder.";
  const strength = game.botCards.reduce((sum, card) => sum + cardPower(card), 0);
  const accept = strength >= 75 || Math.random() < 0.28;
  renderGame();
  window.setTimeout(() => {
    if (!game || !game.waitingResponse || game.botAsked) return;
    if (accept) {
      game.stake = nextStake(game.stake);
      game.waitingResponse = false;
      game.message = `O computador aceitou! A mão vale ${game.stake} tentos.`;
    } else {
      awardFold(1);
      game.message = `O computador correu. Você ganhou ${game.stake} tento(s).`;
    }
    renderGame();
  }, 650);
}
function nextStake(stake) {
  return ({1:3, 3:6, 6:9, 9:12})[stake] || 12;
}
function awardFold(winner) {
  if (winner === 1) game.playerPoints += game.stake;
  else game.botPoints += game.stake;
  game.handDone = true;
  if (game.playerPoints >= TARGET || game.botPoints >= TARGET) {
    game.finished = true;
    const won = game.playerPoints >= TARGET;
    game.message = won ? "🏆 Você venceu a partida!" : "O computador venceu a partida.";
    if (won) stats.wins++; else stats.losses++;
    saveStats();
  }
}
function respondTruco(accept) {
  if (!game || !game.waitingResponse) return;
  const caller = game.botAsked ? 2 : 1;
  game.waitingResponse = false;
  if (accept) {
    game.stake = nextStake(game.stake);
    game.message = `Truco aceito! A mão vale ${game.stake} tentos.`;
  } else {
    awardFold(caller);
    game.message = caller === 1
      ? `O computador correu. Você ganhou ${game.stake} tento(s).`
      : `Você correu. O computador ganhou ${game.stake} tento(s).`;
  }
  renderGame();
}
function nextHand() {
  if (!game || (!game.handDone && !game.finished)) return;
  if (game.finished) return;
  game.stake = 1;
  game.handNumber++;
  dealHand();
  renderGame();
}
function renderGame() {
  if (!game) return;
  const playerWon = game.playerPoints >= TARGET;
  const finished = game.finished;
  const table = game.tableCards || [];
  const playerCard = table.find(x => x.owner === 1);
  const botCard = table.find(x => x.owner === 2);
  const viraRed = game.vira.suit.red ? "red" : "";
  const trickEnded = game.handDone;
  let controls = "";
  if (finished) {
    controls = `<div class="result-banner"><strong>${playerWon ? "🏆 VOCÊ VENCEU!" : "🤖 O COMPUTADOR VENCEU"}</strong><p>Placar final: ${game.playerPoints} × ${game.botPoints}</p></div>${buttonMarkup("JOGAR NOVAMENTE","restart","btn-green")}`;
  } else if (game.waitingResponse) {
    const question = game.botAsked ? "O computador pediu truco. Você aceita?" : "Você pediu truco. Aguardando resposta...";
    controls = `<div class="call-panel"><strong>${question}</strong>${game.botAsked ? `<div class="game-actions">${buttonMarkup("ACEITAR","accept","btn-green")}${buttonMarkup("CORRER","decline","btn-red")}</div>` : `<p>O computador está pensando…</p>`}</div>`;
  } else if (trickEnded) {
    controls = `${buttonMarkup("PRÓXIMA MÃO","next","btn-gold")}`;
  } else {
    controls = `<div class="hand-label">SUAS CARTAS · TOQUE PARA JOGAR</div><div class="hand">${game.playerCards.map(handCardMarkup).join("")}</div><div class="game-actions">${game.stake < 12 && !game.trucoAskedThisHand ? buttonMarkup("PEDIR TRUCO","truco","btn-gold") : ""}</div>`;
  }
  body.innerHTML = `
    <div class="game-shell">
      <div class="scoreboard">
        <div class="score-box"><span>VOCÊ</span><strong>${game.playerPoints}</strong><small>${game.playerTricks} rodadas vencidas</small></div>
        <div class="score-box"><span>VALOR DA MÃO</span><strong>${game.stake}</strong><small>tento(s)</small></div>
        <div class="score-box"><span>COMPUTADOR</span><strong>${game.botPoints}</strong><small>${game.botTricks} rodadas vencidas</small></div>
      </div>
      <div class="table-wrap">
        <div class="table-top">
          <div class="player-badge opponent-badge"><span class="player-face">🤖</span><span>Computador</span></div>
          <span class="table-meta">MÃO ${game.handNumber} · ${Math.min(game.round,3)}/3</span>
        </div>
        <div class="opponent-hand">${game.botCards.map(() => '<span class="mini-back"></span>').join("") || '<span class="round-info">Sem cartas</span>'}</div>
        <div class="vira-row">VIRA</div>
        <div class="vira-card ${viraRed}">${game.vira.name}${game.vira.suit.symbol}</div>
        <div class="play-area">${botCard ? cardMarkup(botCard.card) : '<div class="empty-slot"></div>'}${playerCard ? cardMarkup(playerCard.card) : '<div class="empty-slot"></div>'}</div>
        <p class="table-message" aria-live="polite">${escapeHTML(game.message)}</p>
        <div class="player-area"><span class="table-meta">TRUCO PAULISTA</span><div class="player-badge"><span class="player-face">L</span><span>Você</span></div></div>
      </div>
      ${controls}
      <p class="round-info">Partida de treino · pontos exclusivamente virtuais</p>
    </div>`;
  body.querySelectorAll("[data-card]").forEach(btn => btn.addEventListener("click", () => playCard(Number(btn.dataset.card))));
  body.querySelectorAll("[data-action]").forEach(btn => btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    if (action === "truco") requestTruco();
    if (action === "accept") respondTruco(true);
    if (action === "decline") respondTruco(false);
    if (action === "next") nextHand();
    if (action === "restart") startGame();
  }));
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function showInfo(name, message) {
  title.textContent = name;
  body.innerHTML = `<div class="info-content"><h3>${escapeHTML(name)}</h3><p>${escapeHTML(message)}</p><button class="game-btn btn-gold" id="infoOk">ENTENDI</button></div>`;
  $("infoOk").addEventListener("click", () => dialog.close());
  if (!dialog.open) dialog.showModal();
}
$("closeDialog").addEventListener("click", () => dialog.close());
$("playBtn").addEventListener("click", startGame);
$("profileBtn").addEventListener("click", () => showInfo("Seu perfil", `Visitante · Nível ${Math.max(1, Math.floor(stats.wins / 3) + 1)} · ${stats.wins} vitória(s).`));
document.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
  const mode = btn.dataset.mode;
  if (mode === "Paulista" || mode === "Treino") startGame();
  else showInfo("Truco Mineiro", "Este modo será disponibilizado em uma próxima atualização. Por enquanto, aproveite o Truco Paulista.");
}));
document.querySelectorAll("[data-page]").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".bottom-nav button").forEach(x => x.classList.remove("active"));
  if (btn.closest(".bottom-nav")) btn.classList.add("active");
  const pages = {
    "Início":"Você está na página inicial.",
    "Torneios":"Os torneios serão ativados em uma próxima atualização.",
    "Ranking":"O ranking será conectado quando o sistema de jogadores online estiver disponível.",
    "Amigos":"A área de amigos será ativada em uma próxima atualização.",
    "Clãs":"Os clãs serão ativados em uma próxima atualização.",
    "Menu":"Perfil, histórico e configurações serão adicionados aqui."
  };
  showInfo(btn.dataset.page, pages[btn.dataset.page] || "Em construção.");
}));
saveStats();
