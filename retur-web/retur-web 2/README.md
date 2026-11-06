# Retur

Køb og abonnementer. Ét enkelt overblik.

Webapp til unge, der samler engangskøb og abonnementer, scanner kvitteringer med AI og har en AI-assistent, der svarer ud fra brugerens egne tal.

## Opbygning

- `index.html`, `styles.css`, `app.js`: selve appen. Data gemmes i brugerens browser.
- `api/receipt.js`: læser en kvittering med Claude og returnerer butik, dato og beløb.
- `api/chat.js`: AI-assistenten.
- `api/_claude.js`: prompts, model og kald til Claude API.

Model: `claude-haiku-5-5`, Anthropics billigste model.

## Udgiv på Vercel

1. Importér dette repository på vercel.com (Add New, Project).
2. Framework Preset: Other. Lad Build Command og Output Directory være tomme.
3. Under Environment Variables: tilføj `ANTHROPIC_API_KEY` med jeres nøgle.
4. Tryk Deploy.

Sæt en månedlig udgiftsgrænse i Claude Console, så en fejl eller misbrug aldrig kan koste mere, end I har bestemt.

API-nøglen må aldrig stå i koden eller i GitHub.
