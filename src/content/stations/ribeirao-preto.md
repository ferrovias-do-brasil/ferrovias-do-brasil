---
name: "Ribeirão Preto"
line: mogiana
detail: minimal
summary: >-
  Ponta do tronco em 23/11/1883, a "capital do café". A estação central foi substituída em 1/6/1965 por uma nova, fora do centro, e demolida em 1968; o pátio virou o Terminal Rodoviário.
km:
  - { value: 312.525, year: 1937, source: giesbrecht-ribeirao-preto }
opened:
  - { value: '1883-11-23', source: giesbrecht-ribeirao-preto }
passenger_end:
  - { value: '1997-08-11', source: giesbrecht-ribeirao-preto-nova }
sites:
  - id: central
    coords: [-47.81445, -21.17384]
    from: '1883-11-23'
    to: '1965-06-01'
    confidence: medium
    sources: [giesbrecht-ribeirao-preto]
    note: "Área do antigo pátio, hoje Terminal Rodoviário."
  - id: nova
    coords: [-47.78398, -21.14912]
    from: '1965-06-01'
    confidence: high
    sources: [giesbrecht-ribeirao-preto-nova, osm]
    note: "Estação de 1965, projeto de Oswaldo Bratke; abandonada."
status_now: closed
---
