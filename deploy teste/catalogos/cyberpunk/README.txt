CATALOGO DO CYBERPUNK TCG

Estrutura
- cartas.json: lista de cartas e versões do jogo.
- edicoes.json: lista de edições para mostrar no catálogo e no progresso da coleção.
- imagens/: imagens das cartas.
- descrição/: descrições de cartas em texto simples.

Cadastre cada edição em edicoes.json:
{
  "codigo": "CP01",
  "nome": "Nome da edição",
  "imagem": "catalogos/cyberpunk/imagens/CP01-pack.jpg"
}

A propriedade imagem é opcional. Sem ela, o catálogo usa um cartão visual neutro.
As edições iniciais usam os códigos internos CP01 (Welcome to Night City), CP02
(Beta Booster) e CP03 (Beta Pre-release). Como o serial impresso pode usar outro
prefixo, informe também "edicao" em cada carta para ligá-la ao código interno.

Cadastre cada versão de carta em cartas.json:
{
  "serial": "PRR01-WNC-001",
  "edicao": "CP03",
  "nome": "Nome da carta",
  "imagem": "catalogos/cyberpunk/imagens/CP01-001.webp",
  "descricao": "catalogos/cyberpunk/descrição/CP01-001.txt",
  "tipo": "Tipo",
  "raridade": "Raridade",
  "cor": "Cor"
}

Use caminhos relativos à pasta Projeto e mantenha imagens com nomes únicos.

As imagens em Beta Booster sem códigos oficiais transcritos no catálogo recebem IDs internos
CP02-001, CP02-002, etc., seguindo a ordem alfabética dos arquivos. Esses IDs são
locais do catálogo, não os códigos oficiais impressos nas cartas. Tipo e cor ficam
como CARD e Desconhecida até serem identificados.
