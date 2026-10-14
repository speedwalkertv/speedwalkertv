# Jev / TypeSafe
No Render, em Environment, configurar:
- TYPESAFE_API_KEY: chave privada TypeSafe.
- JEV_CONTROL_TOKEN: código privado aleatório com pelo menos 24 caracteres.
- JEV_MODEL: opcional; padrão jev-latest.

Salvar e aguardar a implantação. No jogo, inserir somente o código de controle no painel Jev. A chave da API nunca vai ao navegador.

O painel mostra API ATIVA somente após decisão válida do provedor. Em falha, o piloto local mantém o combate. O estado numérico enviado não inclui comentários nem nomes do público. Há intervalo mínimo de 2 segundos, limite global de 1800 consultas/hora e timeout. Consultas podem consumir créditos TypeSafe.

O jogo roda na página aberta; esta integração não cria um processo de simulação nem transmissão de vídeo na nuvem. A aba oculta pausa consultas. O cofre Obsidian local ainda não está conectado à API; não há aprendizado persistente automático nesta versão.

Documentação: https://docs.typesafe.ai/introduction/quickstart
