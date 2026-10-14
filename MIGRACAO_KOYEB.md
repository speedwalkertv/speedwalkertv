# Migracao de NPC CHAOS LIVE do Render para Koyeb

O jogo usa um processo Node.js persistente para TikTok LIVE, WebSocket e a API Jev. O `Dockerfile` empacota frontend e backend no mesmo servico, sem depender do Render.

## Criar o servico

1. Acesse https://app.koyeb.com/ e entre ou crie uma conta.
2. Escolha **Create Web Service** > **GitHub**. Conecte a conta GitHub para permitir deploy automatico ao dar `git push`.
3. Selecione o repositorio `speedwalkertv/speedwalkertv`, branch **`npc-chaos-live`**. Nao use `main` (outra versao do repositorio).
4. Selecione **Dockerfile** como builder, com caminho `Dockerfile` na raiz. Diretorio de trabalho: raiz do repositorio.
5. Configure **Web Service**, porta **8000 / HTTP**, rota publica **`/`**, health check **HTTP GET `/health`** e uma instancia com memoria suficiente para Node.js/TikTok.
6. Configure as variaveis de ambiente abaixo e clique em **Deploy**. Espere aparecer **Healthy** e abra o dominio `.koyeb.app` fornecido pela plataforma.

| Variavel | Valor |
| --- | --- |
| `TIKTOK_USERNAME` | `ghostbr010` |
| `HOST` | `0.0.0.0` (ja definido no Dockerfile) |
| `PORT` | `8000` (ja definido no Dockerfile) |
| `TYPESAFE_API_KEY` | Sua chave TypeSafe em segredo |
| `JEV_CONTROL_TOKEN` | Mesmo codigo privado do painel Jev, com 24+ caracteres |
| `JEV_MODEL` | Opcional, padrao `jev-latest` |
| `TIKTOK_SIGN_API_KEY` | Opcional, caso utilize EulerStream |

Nunca coloque chaves e tokens no GitHub ou em URL compartilhada.

## Testar apos o deploy

- `https://<dominio-fornecido-pela-koyeb>/health` deve retornar HTTP 200.
- `https://<dominio-fornecido-pela-koyeb>/npc/` abre o jogo.
- `https://<dominio-fornecido-pela-koyeb>/api/jev/status` deve retornar `ready: true`, `configuration: "ok"` quando as duas variaveis obrigatorias estiverem presentes (isso ainda nao garante o funcionamento da chamada real TypeSafe).
- No painel **JEV**, informe somente `JEV_CONTROL_TOKEN` e clique em **Conectar Jev**. Veja `API ATIVA` apos uma decisao recebida.
- Para OBS/TikTok LIVE Studio, use `/npc/?overlay=1` no mesmo dominio.
- Eventos da LIVE so podem ser verificados quando `ghostbr010` estiver ao vivo. A hospedagem do site nao inicia o streaming de video.

Ao escolher a integracao GitHub autenticada e manter o deploy automatico ativado, futuros `git push origin npc-chaos-live` publicam novas versoes sem depender do Render. O modo "Public GitHub repository" pode nao oferecer deploy automatico; prefira conectar a conta.

Se o provedor suspender a instancia por inatividade, a escuta da LIVE para ate o processo acordar. Considere uma instancia ativa enquanto transmitir.

Documentacao: https://www.koyeb.com/docs/build-and-deploy/deploy-with-git e https://www.koyeb.com/docs/reference/services.
