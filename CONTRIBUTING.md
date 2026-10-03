# Como contribuir

Obrigado por ajudar a contar a história das ferrovias do Brasil! Dá para contribuir sem programar.

## A regra de ouro

**Todo fato precisa de uma fonte.** Quando as fontes discordam, registramos as duas versões
lado a lado (veja *Afirmações com fonte* abaixo) em vez de escolher uma em silêncio.

## Sem programar: abra uma issue

Abra uma [issue](../../issues/new/choose) com:

1. o fato (ex.: "a estação de Guatambu ficava na fazenda X");
2. a fonte: link, livro com página, jornal com data, documento de arquivo com código;
3. se puder, uma foto ou digitalização do documento.

Fotos antigas são muito bem-vindas, desde que você diga **de quem são e se podem ser publicadas**.

## Editando os dados

Requisitos: Node.js 22+.

```bash
npm install
npm run dev               # site em http://localhost:4321
npm run validate          # confere schemas e referências
npm run validate-network  # confere o traçado e as quilometragens
npm test
```

### Onde fica cada coisa

| O quê | Onde | Formato |
|---|---|---|
| Fontes (bibliografia) | `src/content/sources/<id>.yaml` | YAML |
| Estações | `src/content/stations/<id>.md` | Markdown com frontmatter |
| Cidades | `src/content/cities/<id>.md` | Markdown com frontmatter |
| Eventos da linha do tempo | `src/content/events/<ano>-<id>.md` | Markdown com frontmatter |
| Linhas e empresas | `src/content/lines/`, `src/content/companies/` | YAML |
| **Traçado (trechos e seus históricos)** | `src/content/network/<linha>/network.yaml` | YAML |
| Geometria gerada do traçado | `src/content/network/<linha>/geometry.geojson` | GeoJSON (gerado) |
| Mapas antigos | `src/content/historic-maps/<id>.yaml` | YAML |
| Notas e pendências de pesquisa | `research/` | Markdown |

Os ids são em `kebab-case` sem acentos (`aracatuba`, `giesbrecht-birigui`).

### Afirmações com fonte (claims)

Datas importantes são listas de afirmações:

```yaml
opened:
  - value: '1912-12-13'          # YYYY, YYYY-MM ou YYYY-MM-DD
    source: giesbrecht-birigui   # id de um arquivo em src/content/sources/
    preferred: true              # a versão mostrada primeiro
  - value: '1908'
    source: wikipedia-en-birigui
    note: Ponto de parada de locomotivas, não a estação.
```

Use `circa: true` para datas aproximadas e `page:` para a página da fonte.

### O traçado: trechos versionados

A linha é dividida em **trechos** entre **nós** (estações, junções, pontes). Cada trecho tem um
`status_history` com os status `construction`, `open`, `freight_only`, `closed`, `removed` e
`flooded`. Quando uma **variante** substitui um trecho, o trecho antigo recebe `closed`/`removed`
e um trecho novo é criado com `replaces: [id-do-antigo]`. Assim as duas geometrias continuam no mapa.

A geometria de cada trecho vem de `geometry.method`:

- `osm-current`: menor caminho pela via atual no OpenStreetMap;
- `osm-old`: menor caminho pelos restos de via (`railway=abandoned/razed/disused`), com `via:`
  para forçar a passagem por um ponto;
- `waypoints`: linha esquemática entre pontos (use quando o leito sumiu; confiança baixa);
- `manual`: desenhado à mão (QGIS, geojson.io ou sobre um mapa antigo no Allmaps) e editado
  diretamente em `geometry.geojson`. O script não sobrescreve.

Depois de mudar o `network.yaml`:

```bash
npm run import-osm               # regenera geometry.geojson (usa cache do Overpass)
npm run import-osm -- --refresh  # baixa de novo do OpenStreetMap
npm run import-osm -- --fix-nodes  # ajusta nós aproximados para cima da via
npm run validate-network
```

O `validate-network` compara as distâncias no mapa com as quilometragens históricas das estações
(`km:`). Divergências grandes costumam indicar uma variante ainda não mapeada: são ótimas pistas
de pesquisa.

### Mapas antigos (Allmaps)

Um mapa antigo entra no site com uma anotação de georreferenciamento IIIF. Você pode:

- georreferenciar no [Allmaps Editor](https://editor.allmaps.org/) e colocar a URL da anotação em
  `src/content/historic-maps/<id>.yaml` (`georef_annotation`); ou
- usar o fluxo do projeto, como foi feito com o mapa de Heyse (1912): pontos da malha de meridianos e
  paralelos e lugares identificáveis em `research/georef/<id>/`, depois `npm run build-georef -- <id>`,
  que também informa o erro esperado.

Para redesenhar uma linha sobre um mapa antigo, grave o traçado em pixels em
`research/georef/<id>/traces/*.json`, marque o trecho como `geometry: { method: manual, traced_on: <id> }`
e rode `npm run apply-traces -- <id>`.

### A malha em violeta (linhas sem história)

As linhas em violeta vêm do OpenStreetMap (`npm run import-malha`) e mostram a situação de **hoje**.
Para dar história a uma delas, crie uma rede em `src/content/network/<linha>/network.yaml`, como a da
Noroeste, com trechos, datas e fontes. Ela passa a aparecer em cor, com linha do tempo.

### Melhorar o OpenStreetMap também ajuda

Muito do traçado antigo vem de mapeadores que marcaram leitos abandonados no OSM
(`railway=abandoned` + `old_name=Estrada de Ferro ...`). Se você conhece um leito antigo,
mapeá-lo no OSM beneficia este projeto e todo mundo.

## Textos

- Escreva com suas palavras e cite. Não copie textos de outros sites ou livros.
- Prefira fontes primárias (relatórios das companhias, jornais da época, leis e decretos).
- Diga o que não se sabe. "Posição estimada" é melhor que uma precisão falsa.

## Código

- Código, nomes de arquivos e commits em inglês; conteúdo e interface em português.
- Rode `npm run check`, `npm test` e `npm run build` antes do pull request.

## Licenças

Ao contribuir, você concorda em licenciar código sob MIT, textos e dados sob CC BY-SA 4.0 e
geometria sob ODbL (veja `LICENSE*`).
