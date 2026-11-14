# Eskils läxor (webbapp)

Statisk sida (ingen byggprocess) + Supabase-projektet `eskils-laxor` (bkygxygollvzlyccoqqd, eu-north-1).

## Ny vecka
1. Lägg till veckan överst i `content/veckor.js`.
   - `typ: 'uppgift'`: bara bock.
   - `typ: 'glosor'`: grupper med ord `[engelska, svenska, emoji]`. Ord-id är globala (`en:<ord>`), så samma ord en annan vecka behåller sin status.
   - `typ: 'karta'`: just nu bara `karta: 'europa'`. Ny karta (t.ex. Asien) kräver en ny länderlista i `data/` och ett nytt spår i `app.js`.
2. Testa lokalt, pusha. Hostingen publicerar automatiskt.

## Principer
- Fokus på inlärning. Ingen konfetti, inga poängserier. Tydlig återkoppling och status.
- Repetition över dagar: rätt första försöket för dagen flyttar upp en låda (intervall 0, 1, 2, 4, 7, 14, 30 dagar). Fel tar ner till låda 0. "Kan" = låda 3, alltså rätt på minst tre olika dagar.
- Svårighet stegras med lådan: välja → lyssna/känna igen → skriva själv. Förhör följer provets form.
- Papper: utskrift av övningsblad och facit, rättning förs in i appen.
- Översikt för vuxna: svar och minuter per dag, läget per läxa, svåraste momenten.

## Data och säkerhet
- Tabellerna `status`, `forsok`, `bockar`, `hushall` har RLS utan policyer; anon når dem inte.
- Tre funktioner (`hamta`, `spara`, `bocka`) kräver familjenyckeln, som jämförs mot en sha256-hash i `hushall`.
- Familjenyckeln står i länken (`?k=...`) och sparas i webbläsaren. Byt nyckel: uppdatera hashen i `hushall`, ge ut ny länk.
- Kartdata och flaggor hämtas från jsDelivr (world-atlas 2.0.2, d3-geo 3.1.2, topojson-client 3.1.0, flag-icons 7.6.0).

## Test
`test/app.py` (Playwright) kör hela flödet mot en låtsasdatabas.
