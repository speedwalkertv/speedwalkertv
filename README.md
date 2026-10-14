# TikTok LIVE Game Bridge

## Jogo pronto: NPC CHAOS LIVE

O jogo interativo de NPC autonomo esta em **/npc/**. E uma arena vertical 9:16: o heroi Kaito luta, ataca, foge, evolui, enfrenta chefes e reinicia automaticamente. O chat pode enviar **!cura, !fogo, !gelo, !escudo e !boss** gratuitamente. Presentes acionam recuperacao, Berserk, meteoros e poder divino conforme diamantes enviados; curtidas ativam choque eletrico, seguidores convocam aliados e compartilhamentos provocam uma onda de dano. O ranking de apoiadores permanece entre as partidas durante a execucao.

No Windows, **clique duas vezes em INICIAR-NPC-CHAOS.cmd** para iniciar o servidor e abrir o navegador. Ou execute **npm start** e abra http://127.0.0.1:8787/npc/.

No OBS ou TikTok LIVE Studio, adicione a fonte de navegador **http://127.0.0.1:8787/npc/?overlay=1**, com largura **720** e altura **1280**. A HUD e a arena ocupam apenas a tela vertical; as barras laterais de testes ficam escondidas. O jogo segue autonomo mesmo sem espectadores.

### Hospedagem na nuvem

O arquivo `render.yaml` define um servico web Node.js no plano gratuito do Render, com endpoint de saude em `/health`. Ao conectar este repositorio no painel Render como **Blueprint** (ou criar um Web Service com `npm ci --omit=dev` e `npm start`), o jogo e o conector ficam no mesmo dominio: `https://<nome>.onrender.com/npc/`. O modo overlay e `https://<nome>.onrender.com/npc/?overlay=1`.

O nome TikTok `ghostbr010` ja esta configurado no Blueprint. A biblioteca tenta conectar automaticamente e repete quando a LIVE esta offline. O jogo pode ser aberto e jogado no navegador quando o PC do criador esta desligado, desde que o servico esteja ativo. O navegador que exibe a arena deve permanecer aberto para a animacao continuar e para encaminhar eventos ao jogo; para colocar a arena no video da LIVE, uma fonte de captura/stream tambem precisa estar ativa. A hospedagem do site, por si so, nao inicia uma transmissao TikTok.

No plano gratuito do Render, o servico dorme apos 15 minutos sem requisicoes ou mensagens WebSocket recebidas. O cliente envia um pulso uma vez por minuto enquanto a pagina estiver aberta; assim uma pagina de jogo conectada mantem o servico ativo. Sem espectadores com pagina aberta, a conexao TikTok pode pausar e ao retornar pode levar cerca de um minuto para iniciar. Para disponibilidade continua independentemente de visitantes, seria necessario um servico pago que nao dorme.

Para uma live real, crie o arquivo **.env** com **TIKTOK_USERNAME=seu_usuario**. Reinicie o servidor e abra sua live. Em modo real, botões de simulação ficam desabilitados. Essa integracao usa a biblioteca nao oficial e precisa de um teste com sua live ativa para validar o recebimento de presentes.

A voz sintetizada do NPC e opcional. Pode ser habilitada pelo botao **Voz** no painel. Devido as politicas de audio dos navegadores, a primeira ativacao exige um clique; os baloes com falas e reacoes visuais funcionam sempre de maneira automatica.

### Valores de presentes

- 1 a 9 diamantes: cura.
- 10 a 79 diamantes: Berserk + escudo.
- 80 a 499 diamantes: meteoros.
- 500 ou mais diamantes: poder divino.

O valor considerado e **diamantesPorUnidade x quantidadeRecebida**, quando os dados sao fornecidos pelo TikTok. Em presente sem valor reportado, aplica-se a reacao de cura. A engine simula dano, movimento e eventos dentro do navegador, com tecnologias Canvas 2D + JavaScript. Consulte o codigo em public/npc/engine.js, draw.js, main.js e style.css.

Modulo reutilizavel de jogos web interativos para TikTok LIVE. Recebe comentarios, presentes, curtidas, seguidores, compartilhamentos, entradas, inscricoes, perguntas e contagem de espectadores, e envia eventos padronizados para jogos em tempo real por **WebSocket local**.

Biblioteca: [TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector), versao 2.5.0, Node.js 20+; infraestrutura propria de jogo: `src/server.js` + `public/tiktok-game-client.js`.

## Rodar agora (modo de testes, sem live)

Abra PowerShell nesta pasta:

```powershell
npm install
npm start
```

Abra **http://127.0.0.1:8787/**. Aperte os botoes para simular comentarios, presentes e curtidas. O demo apresenta uma arena com pontuacao, energia e log de eventos. Para encerrar, pressione `Ctrl+C`.

## Usar com sua LIVE real

1. Copie `.env.example` para `.env`.
2. Preencha `TIKTOK_USERNAME=seu_usuario` com o @ da sua conta sem o simbolo (ou de outra LIVE publica autorizada).
3. Inicie uma LIVE TikTok e execute `npm start` novamente. A pagina mostrara `LIVE CONECTADA` quando conectar.

Exemplo PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
npm start
```

Nao e necessario login no TikTok ou senha para consultar uma LIVE publica. O conector usa assinatura de WebSocket de um servico comunitario da EulerStream com limites gratuitos; `TIKTOK_SIGN_API_KEY` e opcional. Nao coloque cookies de sessao neste projeto.

## Adicionar a QUALQUER jogo web

Deixe este servidor rodando e copie `public/tiktok-game-client.js` para o projeto (Phaser, Three.js, React, HTML etc.). Exemplo em um script ES module:

```js
import { TikTokGameClient } from './tiktok-game-client.js';

const live = new TikTokGameClient({
  url: 'ws://127.0.0.1:8787/ws',
  onStatus: (status) => console.log(status.state),
  onEvent: (event) => {
    if (event.type === 'chat' && event.text.toLowerCase() === '!pular') jogador.pular();
    if (event.type === 'gift') jogo.spawnInimigos(event.count);
    if (event.type === 'like') jogo.adicionarEnergia(event.count);
  }
});
live.connect();
```

O exemplo acima pressupoe que `jogador` e `jogo` ja existem na sua engine. Em um projeto com Vite, utilize o modulo na pasta `src/`. Para Godot exportado como Web, o JS pode encaminhar os eventos a metodos do jogo por `JavaScriptBridge`.

### Contrato de eventos

O servidor envia `{"kind":"status","state":"connected|offline|demo|...","mode":"live|demo","username":"..."}` ou:

```json
{
  "kind": "event",
  "event": {
    "type": "gift",
    "source": "tiktok",
    "user": { "id": "123", "username": "fulano", "nickname": "Fulano" },
    "giftId": "5655",
    "giftName": "Rosa",
    "count": 3,
    "diamondsEach": 1,
    "streak": true,
    "timestamp": 1790000000000
  }
}
```

Tipos: `chat` (`text`), `gift` (`giftId`, `giftName`, `count`, `diamondsEach`), `like` (`count`,`total`), `follow`, `share`, `join`, `subscribe`, `viewer_count` (`count`), `question` (`text`). As quantidades de curtidas chegam agregadas. Acoes de presentes em sequencia so disparam apos o marcador de encerramento para evitar pontuacao duplicada; caso o TikTok nao envie encerramento, aquele presente pode ficar sem acao.

## Transmitir no OBS / TikTok LIVE Studio

Adicione uma fonte de navegador apontando para `http://127.0.0.1:8787/`, ou capture a janela do navegador. Pode manter a ponte rodando na maquina de transmissao enquanto trabalha no jogo. A porta e endereco configuram-se por `HOST` e `PORT` no `.env`.

## Limites e seguranca

- A versao atual da ponte so escuta em `127.0.0.1` por padrao. Jogadores acessam seu jogo pela LIVE, enquanto a ponte roda localmente no PC de transmissao; abrir o servidor na internet requer um backend protegido, HTTPS/WSS, autenticacao e configuracao especifica.
- O servidor so aceita comandos de simulacao quando `TIKTOK_USERNAME` esta vazio, e nao injeta simulacoes em LIVE real.
- O conector e **nao oficial**, pode ficar indisponivel se TikTok alterar o protocolo ou a API comunitaria limitar conexoes. Nao se promete funcionamento continuo sem teste numa LIVE real.
- O repositorio usa licenca AGPL-3.0 com excecoes para jogos/overlays TikTok e restricoes a relays WebSocket comerciais hospedados. Confira a licenca antes de vender uma plataforma de relays ou hospedar para terceiros.
- Testes: `npm test`. O modo demo valida o caminho servidor -> WebSocket -> navegador; para validar a origem TikTok e preciso informar o @ de uma LIVE ativa.
