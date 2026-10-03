---
name: "Itirapina"
names:
  - { name: "Morro Pellado", from: '1885-07-01', source: giesbrecht-itirapina-velha }
  - { name: "Itirapina", from: '1908', source: giesbrecht-itirapina }
line: cp
detail: minimal
summary: >-
  Nó da Paulista: aqui se separam as linhas para São Carlos e para Jaú/Bauru. A velha estação, Morro Pelado, é de 1885; a atual, de 1916, fica cerca de 1,1 km adiante.
km:
  - { value: 174.37, year: 1958, source: giesbrecht-itirapina }
opened:
  - { value: '1885-07-01', source: giesbrecht-itirapina-velha, note: "Abertura da velha estação (Morro Pelado), no Ramal de Jaú da Rio-Clarense." }
passenger_end:
  - { value: '2001-03-15', source: giesbrecht-itirapina, note: "Fim dos trens de passageiros (Ferroban)." }
sites:
  - id: velha
    coords: [-47.82101, -22.25194]
    from: '1885-07-01'
    to: '1916-06-01'
    confidence: medium
    sources: [giesbrecht-itirapina-velha, osm]
    note: "Prédio de 1885, depois depósito e hoje moradia."
  - id: nova
    coords: [-47.81776, -22.25903]
    from: '1916-06-01'
    confidence: high
    sources: [giesbrecht-itirapina, osm]
    note: "Estação de 1916, na bifurcação."
status_now: closed
---
