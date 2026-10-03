# Georreferenciamento — Heyse (1912)

*Mappa da viação ferrea de São Paulo e partes dos estados vizinhos*, R. Heyse, Weiszflog Irmãos, 1912,
1:1.000.000. Princeton University Library, "No Known Copyright".

Imagem IIIF: `config.json`. Anotação gerada: `public/georef/heyse-1912.json`.

## Como foi feito

1. **Malha** (`graticule.json`): 48 cruzamentos de meridianos e paralelos detectados automaticamente
   (`detect-graticule.mjs`). As longitudes do mapa são contadas a oeste do Rio de Janeiro; a legenda
   da borda dá 0° = 43°10'10" W de Greenwich.
2. **Pontos identificáveis** (`features.json`): 15 estações e cidades medidas à mão no mapa e
   localizadas hoje. Elas mostram que o mapa erra de 1 a 3 km no leste e até ~14 km no oeste, que em
   1910 ainda era fronteira de ocupação.
3. **Correção**: cada ponto da malha é deslocado pela correção interpolada dos pontos identificáveis,
   e a transformação é uma *thin plate spline* (`npm run build-georef -- heyse-1912`). No teste
   "deixa um de fora", o erro mediano é de 2,5 km.
4. **Traçado** (`traces/nob-tiete.json`): a linha da Noroeste pelo vale do Tietê foi seguida pela cor
   (`trace-line.mjs`) entre as estações do mapa e convertida em coordenadas com
   `npm run apply-traces -- heyse-1912`.

Para melhorar: acrescente pontos identificáveis, principalmente no oeste, e rode os dois comandos de novo.
