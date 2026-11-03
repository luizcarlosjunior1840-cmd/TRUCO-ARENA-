
"use strict";

const dialog = document.getElementById("infoDialog");
const title = document.getElementById("dialogTitle");
const body = document.getElementById("dialogBody");

function show(name, content) {
  title.textContent = name;
  body.innerHTML = content;
  dialog.showModal();
}

document.getElementById("closeDialog").addEventListener("click", () => {
  dialog.close();
});

const naipes = [
  { nome: "Ouros", simbolo: "♦", cor: "#df4d58", força: 1 },
  { nome: "Espadas", simbolo: "♠", cor: "#222222", força: 2 },
  { nome: "Copas", simbolo: "♥", cor: "#df4d58", força: 3 },
  { nome: "Paus", simbolo: "♣", cor: "#222222", força: 4 }
];

const valores = [
  { nome: "4", valor: 1 },
  { nome: "5", valor: 2 },
  { nome: "6", valor: 3 },
  { nome: "7", valor: 4 },
  { nome: "Q", valor: 5 },
  { nome: "J", valor: 6 },
  { nome: "K", valor: 7 },
  { nome: "A", valor: 8 },
  { nome: "2", valor: 9 },
  { nome: "3", valor: 10 }
];

let jogo = null;

function embaralhar(cartas) {
  for (let i = cartas.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cartas[i], cartas[j]] = [cartas[j], cartas[i]];
  }
  return cartas;
}

function criarBaralho() {
  const cartas = [];

  naipes.forEach(naipe => {
    valores.forEach(valor => {
      cartas.push({
        nome: valor.nome,
        valor: valor.valor,
        naipe,
        id: valor.nome + naipe.nome
      });
    });
  });

  return embaralhar(cartas);
}

function distribuir() {
  const baralho = criarBaralho();

  jogo.jogador = baralho.splice(0, 3);
  jogo.computador = baralho.splice(0, 3);
  jogo.vira = baralho.shift();

  jogo.maosJogador = 0;
  jogo.maosComputador = 0;
  jogo.maos = [];
  jogo.mesa = [];
  jogo.numeroMao = 1;
  jogo.turno = "jogador";
  jogo.aguardando = false;
  jogo.mensagem = "Sua vez! Escolha uma carta.";
  jogo.trucoPedido = false;
}

function iniciarJogo() {
  jogo = {
    pontosJogador: 0,
    pontosComputador: 0,
    aposta: 1,
    encerrado: false
  };

  distribuir();
  mostrarMesa();
}

function forçaCarta(carta) {
  const ordem = valores.map(v => v.nome);
  const indiceVira = ordem.indexOf(jogo.vira.nome);
  const manilha = ordem[(indiceVira + 1) % ordem.length];

  if (carta.nome === manilha) {
    return 100 + carta.naipe.força;
  }

  return carta.valor;
}

function vencedorDaMao() {
  const resultados = jogo.maos;

  if (resultados.length < 3) return null;

  const primeira = resultados[0];
  const segunda = resultados[1];
  const terceira = resultados[2];

  if (primeira === segunda && primeira !== 0) {
    return primeira;
  }

  if (primeira === 0 && segunda !== 0) {
    return segunda;
  }

  if (primeira !== 0 && segunda === 0) {
    return primeira;
  }

  if (primeira !== 0 && segunda !== 0 && primeira !== segunda) {
    return terceira === 0 ? primeira : terceira;
  }

  if (primeira === 0 && segunda === 0) {
    return terceira;
  }

  return terceira;
}

function desenharCarta(carta, indice) {
  return `
    <button data-carta="${indice}" style="
      background:white;
      color:${carta.naipe.cor};
      border:2px solid #d9b65c;
      border-radius:12px;
      width:82px;
      height:112px;
      font-size:25px;
      font-weight:bold;
      margin:4px;
      cursor:pointer;
    ">
      ${carta.nome}<br>${carta.naipe.simbolo}
    </button>
  `;
}

function botao(texto, id, cor = "#d9b65c") {
  return `
    <button id="${id}" style="
      background:${cor};
      color:#171717;
      border:0;
      border-radius:9px;
      padding:12px 18px;
      margin:5px;
      font-weight:bold;
      font-size:15px;
    ">${texto}</button>
  `;
}

function mostrarMesa() {
  if (!jogo) return;

  if (
    jogo.pontosJogador >= 12 ||
    jogo.pontosComputador >= 12
  ) {
    jogo.encerrado = true;
  }

  const fim = jogo.encerrado;
  const cartasMesa = jogo.mesa.map(item => `
    <span style="
      display:inline-block;
      background:white;
      color:${item.carta.naipe.cor};
      border-radius:7px;
      padding:8px;
      margin:4px;
      font-size:22px;
      font-weight:bold;
    ">${item.carta.nome}${item.carta.naipe.simbolo}</span>
  `).join("");

  const maoTerminada = jogo.maos.length >= 3;

  let resultado = "";

  if (fim) {
    resultado = jogo.pontosJogador >= 12
      ? "🏆 VOCÊ VENCEU A PARTIDA!"
      : "🤖 O COMPUTADOR VENCEU!";
  }

  body.innerHTML = `
    <div style="
      color:white;
      text-align:center;
      padding:8px;
    ">
      <h2 style="color:#d9b65c">TRUCO ARENA</h2>
      <p>TRUCO PAULISTA · TREINO</p>

      <div style="
        display:flex;
        justify-content:space-around;
        background:#171717;
        border-radius:12px;
        padding:12px;
      ">
        <div>
          <strong>VOCÊ</strong>
          <h2 style="color:#e2bd60">${jogo.pontosJogador}</h2>
          <small>Mãos: ${jogo.maosJogador}</small>
        </div>
        <div>
          <strong>COMPUTADOR</strong>
          <h2 style="color:#e2bd60">${jogo.pontosComputador}</h2>
          <small>Mãos: ${jogo.maosComputador}</small>
        </div>
      </div>

      <p>Valor da mão: <strong style="color:#e2bd60">${jogo.aposta} ponto(s)</strong></p>
      <p>Disputa ${Math.min(jogo.numeroMao, 3)} de 3</p>

      <p style="color:#d9b65c">VIRA</p>
      <div style="font-size:38px;color:${jogo.vira.naipe.cor}">
        ${jogo.vira.nome} ${jogo.vira.naipe.simbolo}
      </div>

      <p style="color:#d9b65c">CARTAS DO COMPUTADOR</p>
      <div style="font-size:27px">🂠 🂠 🂠</div>

      <p style="color:#d9b65c">MESA</p>
      <div style="
        min-height:75px;
        background:#174b35;
        border:2px solid #d9b65c;
        border-radius:12px;
        padding:10px;
      ">
        ${cartasMesa || " "}
      </div>

      <p style="color:#f3d77b">${jogo.mensagem}</p>

      ${!fim && !jogo.aguardando && !maoTerminada && jogo.turno === "jogador" ? `
        <p style="color:#d9b65c">SUAS CARTAS</p>
        <div>
          ${jogo.jogador.map((c, i) => desenharCarta(c, i)).join("")}
        </div>
        <div>
          ${jogo.aposta < 12 ? botao("PEDIR TRUCO", "pedirTruco") : ""}
        </div>
      ` : ""}

      ${!fim && jogo.aguardando ? `
        <h3 style="color:#e2bd60">O computador pediu truco!</h3>
        ${botao("ACEITAR", "aceitarTruco")}
        ${botao("CORRER", "correrTruco", "#cccccc")}
      ` : ""}

      ${!fim && maoTerminada ? `
        ${botao("PRÓXIMA MÃO", "proximaMao")}
      ` : ""}

      ${fim ? `
        <h3 style="color:#e2bd60">${resultado}</h3>
        ${botao("JOGAR NOVAMENTE", "novoJogo")}
      ` : ""}

      <div style="margin-top:15px">
        ${botao("VOLTAR", "sairJogo", "#444444")}
      </div>
    </div>
  `;

  body.querySelectorAll("[data-carta]").forEach(b => {
    b.addEventListener("click", () => {
      jogarCarta(Number(b.dataset.carta));
    });
  });

  const pedir = document.getElementById("pedirTruco");
  if (pedir) pedir.addEventListener("click", pedirTruco);

  const aceitar = document.getElementById("aceitarTruco");
  if (aceitar) aceitar.addEventListener("click", aceitarTruco);

  const correr = document.getElementById("correrTruco");
  if (correr) correr.addEventListener("click", correrTruco);

  const proxima = document.getElementById("proximaMao");
  if (proxima) proxima.addEventListener("click", proximaMao);

  const novo = document.getElementById("novoJogo");
  if (novo) novo.addEventListener("click", iniciarJogo);

  document.getElementById("sairJogo")
    .addEventListener("click", () => dialog.close());
}

function pedirTruco() {
  if (!jogo || jogo.encerrado || jogo.aguardando) return;
  if (jogo.aposta >= 12) return;

  const proximaAposta = jogo.aposta === 1 ? 3 : jogo.aposta + 3;

  const força = jogo.computador.reduce(
    (soma, carta) => soma + forçaCarta(carta), 0
  );

  if (força < 90 && Math.random() < 0.25) {
    jogo.pontosJogador += jogo.aposta;
    jogo.mensagem = "O computador correu! Você ganhou " + jogo.aposta + " ponto(s).";
    jogo.maos = [1, 1, 1];
    jogo.maosJogador = 2;
    jogo.maosComputador = 0;
  } else {
    jogo.aposta = proximaAposta;
    jogo.mensagem = "O computador aceitou o truco! A mão vale " + jogo.aposta + ".";
  }

  mostrarMesa();
}

function aceitarTruco() {
  if (!jogo || !jogo.aguardando) return;

  jogo.aguardando = false;
  jogo.aposta = jogo.aposta === 1 ? 3 : jogo.aposta + 3;
  jogo.mensagem = "Você aceitou! A mão vale " + jogo.aposta + " pontos.";
  mostrarMesa();
}

function correrTruco() {
  if (!jogo || !jogo.aguardando) return;

  jogo.pontosJogador += jogo.aposta;
  jogo.aguardando = false;
  jogo.mensagem = "Você correu. O computador ganhou " + jogo.aposta + " ponto(s).";
  jogo.maos = [2, 2, 2];
  jogo.maosComputador = 2;
  jogo.maosJogador = 0;
  mostrarMesa();
}

function jogarCarta(indice) {
  if (!jogo || jogo.encerrado || jogo.aguardando) return;
  if (jogo.turno !== "jogador" || !jogo.jogador[indice]) return;
  if (jogo.maos.length >= 3) return;

  const cartaJogador = jogo.jogador.splice(indice, 1)[0];

  const indiceComputador = Math.floor(
    Math.random() * jogo.computador.length
  );

  const cartaComputador =
    jogo.computador.splice(indiceComputador, 1)[0];

  jogo.mesa = [
    { carta: cartaJogador, dono: 1 },
    { carta: cartaComputador, dono: 2 }
  ];

  const forçaJogador = forçaCarta(cartaJogador);
  const forçaComputador = forçaCarta(cartaComputador);

  let vencedor = 0;

  if (forçaJogador > forçaComputador) vencedor = 1;
  if (forçaComputador > forçaJogador) vencedor = 2;

  jogo.maos.push(vencedor);

  if (vencedor === 1) jogo.maosJogador++;
  if (vencedor === 2) jogo.maosComputador++;

  jogo.mensagem = vencedor === 1
    ? "Você ganhou esta mão!"
    : vencedor === 2
      ? "O computador ganhou esta mão!"
      : "Empate nesta mão!";

  jogo.numeroMao = jogo.maos.length;

  if (jogo.maos.length === 3) {
    const vencedorFinal = vencedorDaMao();

    if (vencedorFinal === 1) {
      jogo.pontosJogador += jogo.aposta;
      jogo.mensagem = "Você ganhou a rodada! +" + jogo.aposta + " ponto(s).";
    } else if (vencedorFinal === 2) {
      jogo.pontosComputador += jogo.aposta;
      jogo.mensagem = "O computador ganhou! +" + jogo.aposta + " ponto(s).";
    } else {
      jogo.mensagem = "Rodada empatada! Ninguém pontuou.";
    }

    jogo.numeroMao = 3;
  } else {
    jogo.turno = "jogador";
  }

  mostrarMesa();
}

function proximaMao() {
  if (!jogo || jogo.maos.length < 3) return;

  jogo.aposta = 1;
  distribuir();

  if (
    jogo.pontosJogador >= 12 ||
    jogo.pontosComputador >= 12
  ) {
    jogo.encerrado = true;
  }

  mostrarMesa();
}

document.getElementById("playBtn").addEventListener("click", () => {
  show("Encontrar partida",
    "<p>As partidas online serão conectadas em uma próxima etapa.</p>");
});

document.querySelectorAll("[data-mode]").forEach(b => {
  b.addEventListener("click", () => {
    const modo = b.dataset.mode;

    if (modo === "Treino" || modo === "Paulista") {
      iniciarJogo();
      dialog.showModal();
    } else {
      show(modo, "<p>O Truco Mineiro será implementado em uma próxima etapa.</p>");
    }
  });
});

document.querySelectorAll("[data-page]").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".bottom-nav button")
      .forEach(x => x.classList.remove("active"));

    if (b.closest(".bottom-nav")) b.classList.add("active");

    const paginas = {
      Torneios: "Torneios serão ativados em breve.",
      Ranking: "O ranking será conectado ao sistema de jogadores.",
      Amigos: "A área de amigos será ativada em breve.",
      Clãs: "Os clãs serão ativados em breve.",
      Menu: "Perfil, histórico e configurações.",
      Início: "Você está na página inicial."
    };

    show(b.dataset.page,
      "<p>" + (paginas[b.dataset.page] || "Em construção.") + "</p>");
  });
});

document.getElementById("profileBtn").addEventListener("click", () => {
  show("Seu perfil", "<p>Visitante · Nível 1</p>");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
