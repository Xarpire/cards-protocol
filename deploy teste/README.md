# Minha Coleção

Aplicação web para consultar catálogos de cartas, filtrar cartas e manter uma
coleção compartilhada. O projeto inclui catálogo de Gundam Card Game e Cyberpunk
TCG, identificação de cartas pela câmera e área de acesso com cadastro e login.

## Tecnologias e ferramentas

| Área | Tecnologia | Uso |
| --- | --- | --- |
| Interface | HTML5 | Páginas do catálogo, acesso e coleção |
| Estilos | CSS3 | Layout e aparência da aplicação |
| Lógica no navegador | JavaScript | Catálogos, filtros, câmera, autenticação e coleção |
| Processamento de imagem | OpenCV.js (`@techstark/opencv-js`) | Comparação de imagens para ajudar a identificar cartas |
| Servidor e API | Node.js 20 ou superior | Servir os arquivos e atender as rotas da aplicação |
| Dependências | npm | Instalar os pacotes descritos em `package.json` e `package-lock.json` |
| Certificado local | `selfsigned` | HTTPS com certificado próprio no modo de desenvolvimento local |

O projeto não usa framework de interface, transpilador ou etapa de build. Em
produção, o Node.js serve o site e a API; a hospedagem deve terminar o HTTPS em
um proxy reverso. O OpenCV.js é instalado pelo npm e carregado pelo navegador.

## Estrutura

```text
deploy teste/
├── index.html                 # Catálogo e seleção de jogo/edição
├── script.js                  # Filtros, câmera, catálogo e estado da coleção
├── style.css                  # Estilos compartilhados
├── acesso.html
├── acesso.js                  # Cadastro e login
├── colecao.html
├── colecao.js                 # Visualização da coleção
├── server.cjs                 # Servidor Node.js, API e arquivos estáticos
├── package.json               # Comando start e dependências
├── package-lock.json          # Versões travadas das dependências
├── catalogos/
│   ├── jogos.json             # Jogos, catálogos e edições disponíveis
│   └── cyberpunk/             # Catálogo, imagens e descrições de Cyberpunk
├── cartas.json                # Catálogo de Gundam Card Game
├── imagens/                   # Imagens de cartas e edições de Gundam
├── descrição/                 # Textos de descrição das cartas de Gundam
└── .gitignore                 # Exclui dependências e dados locais do Git
```

Os caminhos de imagens e descrições são definidos nos arquivos JSON dos
catálogos. Preserve a estrutura, os nomes e a acentuação das pastas e arquivos
ao publicar; servidores Linux diferenciam maiúsculas de minúsculas.

## Preparar o deploy

Configure o serviço de hospedagem como uma aplicação **Node.js**. Se a pasta
`deploy teste` estiver dentro de outro repositório, defina-a como diretório raiz
do serviço.

| Configuração | Valor |
| --- | --- |
| Versão do Node.js | 20 ou superior |
| Instalação de dependências | `npm ci` |
| Build | Não há etapa de build |
| Inicialização | `npm start` |
| Porta | Use a variável `PORT` fornecida pela hospedagem; o padrão local é `8000` |
| Ambiente | `NODE_ENV=production` |
| Dados persistentes | `DATA_DIRECTORY` apontando para um volume persistente |

Exemplo de variáveis em um provedor cujo volume esteja montado em `/var/data`:

```text
NODE_ENV=production
PORT=<porta fornecida pelo provedor>
DATA_DIRECTORY=/var/data
```

Adapte `DATA_DIRECTORY` ao caminho absoluto do volume no provedor. O servidor
recusa iniciar em produção sem essa variável para evitar gravar dados em disco
efêmero. Ele cria `contas.json` e `colecao.json` nesse diretório; esses arquivos
não devem ser enviados ao Git.

### HTTPS e proxy

No modo de produção, o servidor Node.js atende HTTP na porta interna. Configure
HTTPS público no provedor ou proxy reverso e encaminhe o tráfego para essa
porta. Não exponha a porta interna diretamente à internet. O proxy deve
preservar o host público das requisições. O HTTPS é necessário para cookies
seguros, login e acesso à câmera.

## Dados e limites de execução

- As contas e a coleção são persistidas em arquivos JSON no volume configurado.
- A coleção é compartilhada entre as contas deste serviço, não separada por
  usuário.
- As sessões de login ficam na memória do processo e são perdidas quando o
  serviço reinicia; será necessário entrar novamente.
- Execute uma única instância. Sessões e gravações são locais ao processo e não
  são coordenadas entre várias réplicas.
- O GitHub Pages não executa Node.js nem a API de autenticação e salvamento;
  sozinho, não é uma hospedagem compatível com todas as funções do projeto.
- Configure variáveis e volumes no painel do provedor. Não coloque senhas,
  arquivos de conta, dados da coleção ou certificados privados no repositório.

