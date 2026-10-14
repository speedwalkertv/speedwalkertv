# Jev / TypeSafe
No Render, em Environment, configurar:
- TYPESAFE_API_KEY: chave privada TypeSafe.
- JEV_CONTROL_TOKEN: código privado aleatório com pelo menos 24 caracteres.
- JEV_MODEL: opcional; padrão jev-latest.

No Render, escolha **Save and deploy** ou **Save, rebuild, and deploy**. A opção **Save only** não altera a configuração do processo em execução até o próximo deploy. Aguarde o serviço ficar **Live**. No jogo, inserir somente o valor de `JEV_CONTROL_TOKEN` no painel Jev. A chave da API nunca vai ao navegador.

Para diagnosticar, consulte `https://npc-chaos-live.onrender.com/api/jev/status`. O campo `configuration` identifica `missing_api_key`, `missing_control_token`, `control_token_too_short` ou `ok`, sem revelar valores. `ready: true` verifica apenas as variáveis; uma decisão real confirma a integração TypeSafe. O jogo verifica novamente o status enquanto a configuração estiver pendente e apresenta erros específicos de autenticação, saldo, modelo e tempo limite.

O painel mostra API ATIVA somente após decisão válida do provedor. Em falha, o piloto local mantém o combate. O estado numérico enviado não inclui comentários nem nomes do público. Há intervalo mínimo de 2 segundos, limite global de 1800 consultas/hora e timeout. Consultas podem consumir créditos TypeSafe.

O jogo roda na página aberta; esta integração não cria um processo de simulação nem transmissão de vídeo na nuvem. A aba oculta pausa consultas. O cofre Obsidian local ainda não está conectado à API; não há aprendizado persistente automático nesta versão.

Documentação: https://docs.typesafe.ai/introduction/quickstart
