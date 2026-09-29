# ZORIA bot

| Command | What it does |
|---|---|
| `npm install` | installs `@zoria/*` from the contest registry (needs `ZORIA_NPM_AUTH`) |
| `npm run build` | compiles to `dist/` |
| `npm test` | unit and in-process match tests, no network |
| `npm run play` | local pack at 500 ms per tick |
| `npm run play -- --fast` | local pack at full speed |
| `npm run train -- --vs A,B` | 8 packs on seeds 100..107 against two opponents |
| `npm run lint:nakaz` | three lint stages of `nakaz.yaml` |
