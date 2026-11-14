// Eskils läxor, vecka för vecka. Nyast överst.
// typ: 'uppgift' (bock, och valfritt delar: ['Kapitel 14', ...] som bockas en och en), 'karta' (länder på karta), 'glosor' (engelska ord).
// Id för ord och länder är globala: samma ord en annan vecka behåller sin status.
window.VECKOR = [
  {
    vecka: 47, år: 2026,
    läxor: [
      { id: 'v47-svenska', typ: 'uppgift', ämne: 'Svenska', ikon: '📚',
        titel: 'Svart bälte, kapitel 14–16', text: 'Läs kapitlen och svara på frågorna.',
        delar: ['Kapitel 14', 'Kapitel 15', 'Kapitel 16', 'Frågorna'] },
      { id: 'v47-europa', typ: 'karta', karta: 'europa', ämne: 'SO', ikon: '🗺️',
        titel: 'Länder i Europa', text: 'Länderna på kartan. Huvudstäder är bonus.',
        datum: '2026-11-20', datumText: 'Prov fredag 20 nov' },
      { id: 'v47-glosor', typ: 'glosor', ämne: 'Engelska', ikon: '🇬🇧',
        titel: 'Glosor: Polar region, Savannah, Adjectives', text: 'Lyssna, förstå och stava.',
        grupper: [
          { namn: 'Polar region', ord: [
            ['polar region', 'polarregion', '🧊'], ['walrus', 'valross', ''], ['seal', 'säl', '🦭'],
            ['fox', 'räv', '🦊'], ['polar bear', 'isbjörn', '🐻‍❄️']] },
          { namn: 'Savannah', ord: [
            ['savannah', 'savann', '🌾'], ['zebra', 'zebra', '🦓'], ['lion', 'lejon', '🦁'],
            ['giraffe', 'giraff', '🦒'], ['rhino', 'noshörning', '🦏'], ['hippo', 'flodhäst', '🦛']] },
          { namn: 'Adjectives', ord: [
            ['adjectives', 'adjektiv', ''], ['pointy', 'spetsig', '🔺'], ['soft', 'mjuk', '🧸'],
            ['sharp', 'skarp, vass', '✂️'], ['straight', 'rak', '📏'], ['checked', 'rutig', '🏁'],
            ['hairy', 'hårig', '🦧'], ['spotted', 'fläckig, prickig', '🐆'], ['striped', 'randig', '🐅'],
            ['curly', 'lockig', '🐑']] },
        ] },
    ],
  },
];
