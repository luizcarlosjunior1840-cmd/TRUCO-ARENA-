
"use strict";

const dialog = document.getElementById("infoDialog");
const title = document.getElementById("dialogTitle");
const body = document.getElementById("dialogBody");

function show(name, content) {
  title.textContent = name;
  body.innerHTML = '<div class="dialog-content">' + content + '</div>';
  dialog.showModal();
}

document.getElementById("closeDialog").addEventListener("click", () => {
  dialog.close();
});

const naipes = [
  { nome: "Ouros", simbolo: "♦", cor: "#e34b4b" },
  { nome: "Espadas", simbolo: "♠", cor: "#222" },
  { nome: "Copas", simbolo: "♥", cor: "#e34b4b" },
  { nome: "Paus", simbolo: "♣", cor: "#222" }
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

function criarBaralho() {
  const cartas = [];

  naipes.forEach(naipe => {
    valores.forEach(valor => {
      cartas.push({
        nome: valor.nome,
        valor: valor.valor,
        naipe: naipe,
        id: valor.nome + naipe.nome
      });
    });
  });

  return cartas.sort(() => Math.random() - 0.5);
}

function iniciarJogo() {
  const baralho = criarBaralho();

  jogo = {
    baralho,
    jogador: baralho.splice(0, 3),
    computador: baralho.splice(0, 3),
    vira: baralho.shift(),
    pontosJogador: 0,
    pontosComputador: 0,
    rodada: 0,
    vitoriasJogador: 0,
    vitoriasComputador: 0,
    cartasJogador: [],
    cartasComputador: [],
    mensagem: "Sua vez! Escolha uma carta.",
    encerrado: false
  };

  mostrarMesa();
}

function forcaCarta(carta) {
  const ordem = valores.map(v => v.nome);
  const indiceVira = ordem.indexOf(jogo.vira.nome);
  const manilha = ordem[(indiceVira + 1) % ordem.length];

  if (carta.nome === manilha) {
    const ordemNaipe = {
      "Paus": 4,
      "Copas": 3,
      "Espadas": 2,
      "Ouros": 1
    };
    return 100 + ordemNaipe[carta.naipe.nome];
  }

  return carta.valor;
}

function desenharCarta(carta, indice) {
  return `
    <button
      class="carta-jogavel"
      data-carta="${indice}"
      style="
        background:white;
        color:${carta.naipe.cor};
        border:2px solid #d6b45d;
        border-radius:10px;
        min-width:72px;
        min-height:105px;
        font-size:23px;
        font-weight:bold;
        margin:4px;
        cursor:pointer;
      "
    >
      ${carta.nome}<br>
      ${carta.naipe.simbolo}
    </button>
  `;
}

function mostrarMesa() {
  if (!jogo) return;

  const terminou =
    jogo.pontosJogador >= 12 ||
    jogo.pontosComputador >= 12;

  if (terminou) {
    jogo.encerrado = true;
  }

  let resultado = "";

  if (jogo.encerrado) {
    resultado = jogo.pontosJogador >= 12
      ? "🏆 Você venceu a partida!"
      : "🤖 O computador venceu!";
  }

  body.innerHTML = `
    <div style="color:white;text-align:center;padding:8px">
      <h2 style="color:#d9b65c">TRUCO ARENA</h2>
      <p>TRUCO PAULISTA · TREINO</p>

      <div style="
        display:flex;
        justify-content:space-around;
        background:#222;
        padding:12px;
        border-radius:12px;
      ">
        <div>
          <strong>VOCÊ</strong>
          <h2 style="color:#e2bd60">${jogo.pontosJogador}</h2>
        </div>
        <div>
          <strong>COMPUTADOR</strong>
          <h2 style="color:#e2bd60">${jogo.pontosComputador}</h2>
        </div>
      </div>

      <p>Rodada ${jogo.rodada + 1} · Melhor de três</p>

      <p style="color:#d9b65c">VIRA</p>
      <div style="font-size:35px;color:${jogo.vira.naipe.cor}">
        ${jogo.vira.nome} ${jogo.vira.naipe.simbolo}
      </div>

      <p style="color:#d9b65c">Cartas do computador</p>
      <div style="font-size:26px">🂠 🂠 🂠</div>

      <p style="color:#d9b65c">Mesa</p>
      <div style="
        min-height:75px;
        background:#174b35;
        border:2px solid #d9b65c;
        border-radius:12px;
        padding:10px;
      ">
        ${jogo.cartasJogador.map(c =>
          `<span style="font-size:27px;color:${c.naipe.cor};background:white;padding:5px;border-radius:6px;margin:4px">${c.nome}${c.naipe.simbolo}</span>`
        ).join("")}
        ${jogo.cartasComputador.map(c =>
          `<span style="font-size:27px;color:${c.naipe.cor};background:white;padding:5px;border-radius:6px;margin:4px">${c.nome}${c.naipe.simbolo}</span>`
        ).join("")}
      </div>

      <p style="color:#f3d77b">${jogo.mensagem}</p>

      ${!jogo.encerrado ? `
        <p style="color:#d9b65c">SUAS CARTAS</p>
        <div>
          ${jogo.jogador.map((c, i) =>
            desenharCarta(c, i)
          ).join("")}
        </div>
      ` : `
        <h3 style="color:#e6c46b">${resultado}</h3>
        <button id="novoJogo" style="
          padding:13px 25px;
          background:#d9b65c;
          border:0;
          border-radius:8px;
          font-weight:bold;
        ">JOGAR NOVAMENTE</button>
      `}

      <button id="sairJogo" style="
        padding:10px 20px;
        margin-top:15px;
        background:#333;
        color:white;
        border:1px solid #d9b65c;
        border-radius:8px;
      ">VOLTAR</button>
    </div>
  `;

  body.querySelectorAll("[data-carta]").forEach(botao => {
    botao.addEventListener("click", () => {
      jogarCarta(Number(botao.dataset.carta));
    });
  });

  document.getElementById("sairJogo").addEventListener("click", () => {
    dialog.close();
  });

  const novo = document.getElementById("novoJogo");
  if (novo) novo.addEventListener("click", iniciarJogo);
}

function jogarCarta(indice) {
  if (!jogo || jogo.encerrado) return;
  if (jogo.jogador.length === 0) return;

  const cartaJogador = jogo.jogador.splice(indice, 1)[0];

  const indiceComputador = Math.floor(
    Math.random() * jogo.computador.length
  );

  const cartaComputador =
    jogo.computador.splice(indiceComputador, 1)[0];

  jogo.cartasJogador.push(cartaJogador);
  jogo.cartasComputador.push(cartaComputador);

  const forcaJogador = forcaCarta(cartaJogador);
  const forcaComputador = forcaCarta(cartaComputador);

  jogo.rodada++;

  if (forcaJogador > forcaComputador) {
    jogo.vitoriasJogador++;
    jogo.mensagem = "Você ganhou esta mão!";
  } else if (forcaComputador > forcaJogador) {
    jogo.vitoriasComputador++;
    jogo.mensagem = "O computador ganhou esta mão!";
  } else {
    jogo.mensagem = "Empate nesta mão!";
  }

  if (jogo.rodada >= 3 || jogo.jogador.length === 0) {
    if (jogo.vitoriasJogador > jogo.vitoriasComputador) {
      jogo.pontosJogador++;
      jogo.mensagem = "Você ganhou a rodada! +1 ponto.";
    } else if (jogo.vitoriasComputador > jogo.vitoriasJogador) {
      jogo.pontosComputador++;
      jogo.mensagem = "Computador ganhou a rodada! +1 ponto.";
    } else {
      jogo.mensagem = "Rodada empatada! Ninguém pontuou.";
    }

    if (
      jogo.pontosJogador < 12 &&
      jogo.pontosComputador < 12
    ) {
      jogo.rodada = 0;
      jogo.vitoriasJogador = 0;
      jogo.vitoriasComputador = 0;
      jogo.cartasJogador = [];
      jogo.cartasComputador = [];

      const novasCartas = criarBaralho();
      jogo.jogador = novasCartas.splice(0, 3);
      jogo.computador = novasCartas.splice(0, 3);
      jogo.vira = novasCartas.shift();
    }
  }

  mostrarMesa();
}

document.getElementById("playBtn").addEventListener("click", () => {
  show(
    "Encontrar partida",
    "<p>As partidas online serão ativadas em uma próxima etapa.</p>"
  );
});

document.querySelectorAll("[data-mode]").forEach(botao => {
  botao.addEventListener("click", () => {
    const modo = botao.dataset.mode;

    if (modo === "Treino" || modo === "Paulista") {
      iniciarJogo();
      dialog.showModal();
    } else {
      show(
        modo,
        "<p>O modo Truco Mineiro será implementado na próxima etapa.</p>"
      );
    }
  });
});

document.querySelectorAll("[data-page]").forEach(botao => {
  botao.addEventListener("click", () => {
    document.querySelectorAll(".bottom-nav button")
      .forEach(x => x.classList.remove("active"));

    if (botao.closest(".bottom-nav")) {
      botao.classList.add("active");
    }

    const paginas = {
      Torneios: "Torneios serão ativados em breve.",
      Ranking: "O ranking será conectado ao sistema de jogadores.",
      Amigos: "A área de amigos será ativada em breve.",
      Clãs: "Os clãs serão ativados em breve.",
      Menu: "Perfil, histórico e configurações.",
      Início: "Você está na página inicial."
    };

    show(
      botao.dataset.page,
      "<p>" + (paginas[botao.dataset.page] || "Em construção.") + "</p>"
    );
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
  
