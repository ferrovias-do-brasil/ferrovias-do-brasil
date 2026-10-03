# Qual será a próxima linha pesquisada?

Pesquisa feita em 2026-10-03 para escolher a segunda ferrovia, depois da Noroeste.

## Critérios

1. **Documentos primários digitalizados**: relatórios anuais, plantas e mapas acessíveis online.
2. **Traçado no OpenStreetMap**: linha em uso e leitos antigos já mapeados em SP (medido em `.cache/osm/malha-sp.json`).
3. **Mapa antigo já georreferenciado**: o mapa de Heyse (1912) cobre as linhas existentes até 1912.
4. **Fontes secundárias organizadas**: artigos por ramal e cronologia na Wikipédia, além de Giesbrecht, que tem fichas de todas as estações paulistas.
5. **Tamanho**: quanto trabalho para cobrir a linha inteira.

## Comparação

| | Paulista | Sorocabana | Mogiana | São Paulo Railway |
|---|---|---|---|---|
| Período | 1872–1971 | 1875–1971 | 1872–1971 | 1867–1946 |
| Extensão | ~2.000 km (25 linhas e ramais, 3 bitolas) | ~2.000 km | ~2.000 km (parte em MG) | 139 km |
| **Relatórios digitalizados** | **1869–1971, contínuo** (Memória Ferroviária/APESP) | 1871–1930, em 5 empresas sucessivas, com lacunas; avulsos até 1950 (APESP) | 1873–1930; avulsos de 1891–1909 (APESP) | nenhum encontrado no Brasil |
| Outros acervos | Museu da Cia. Paulista (Jundiaí): 45 mil documentos, 15 mil livros, plantas online | Museu da E.F. Sorocabana (Sorocaba) | mapa da rede de 1900 (Memória Ferroviária) | UC Santa Cruz (EUA) |
| Traçado no OSM (km identificados) | ~1.460 (384 de leito antigo) + trechos "Antiga Cia Paulista" | **~2.065 (460 de leito antigo)** + "EF-364", "Tronco Principal Sul" | ~140 pelo nome + "Corredor de Exportação" e "Mogyana" | ~200, quase tudo em uso |
| Mapa de 1912 | sim | sim, e o mapa foi feito no escritório da Sorocabana | sim | sim |
| Wikipédia | 25 linhas e ramais listados, a maioria com artigo; cronologia | tronco, Mairinque–Santos e ramais com artigo | 6 linhas, metade com artigo | artigo geral |
| Liga com a Noroeste | sim, em Bauru (Tronco Oeste) | sim, em Bauru (Ramal de Bauru, 1905) | não | indireta |

## Recomendação

**Companhia Paulista de Estradas de Ferro.** É a linha com mais informação para adicionar. Tem relatórios anuais **de toda a sua vida** (1869–1971) digitalizados, que trazem as datas de abertura de cada trecho, as quilometragens e as variantes. Tem também o maior arquivo ferroviário do país (Museu da Cia. Paulista), com plantas online, e a rede mais bem organizada na Wikipédia. Ela chega a Bauru, ligando-se à Noroeste.

Ordem sugerida dentro da Paulista:

1. **Linha Tronco Jundiaí–Campinas–Rio Claro** (1872–1876), bitola larga: o começo da companhia.
2. **Tronco Oeste até Bauru**, que encontra a Noroeste.
3. Ramais, um de cada vez (Descalvado, Santa Rita, Jaboticabal…).

Alternativas:
- **Sorocabana**: melhor traçado no OSM, inclusive leitos antigos, e o mapa de 1912 foi feito por ela. Os relatórios estão espalhados por várias empresas e só vão até 1930.
- **São Paulo Railway**: ganho rápido e simbólico (primeira ferrovia de SP, 139 km, quase toda em uso), mas pouca documentação primária acessível daqui.

## Fontes

- Memória Ferroviária (UNESP/APESP), coleção textual: https://memoriaferroviaria.assis.unesp.br/colecoes/colecao-textual
- Museu da Cia. Paulista online: https://jundiai.sp.gov.br/noticias/2014/07/29/acervo-do-museu-da-cia-paulista-esta-disponivel-online/
- Arquivo Público do Estado de SP (relatórios avulsos): https://atom.arquivoestado.sp.gov.br/
- Wikipédia: Companhia Paulista, Estrada de Ferro Sorocabana, Companhia Mogiana
- Medição do OSM: script de pesquisa sobre `.cache/osm/malha-sp.json` (classificação por nome, operador e ramal)
