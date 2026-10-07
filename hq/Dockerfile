# штаб: збірка показу і сервер одного файлу
#
# Збираємо тією командою, яку ви назвали самі (npm run build каталогу
# штабу), і віддаємо каталог з поля zaria.hq. Образ - той самий node за
# digest, що й у голови: одна база на весь стек - одне завантаження і один
# набір уразливостей, за якими стежити.

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS build
# значення аргументу видно командам RUN цієї стадії як змінну
# оточення - її й підставляє npm у .npmrc. ENV тут не потрібен:
# він записав би секрет у метадані стадії
ARG ZORIA_NPM_AUTH=
WORKDIR /app
COPY .npmrc ./
COPY hq/package*.json ./
# заготовці кита залежності не потрібні зовсім, вашій збірці - потрібні:
# lock є - ставимо по ньому, немає - збираємо як є
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; fi
COPY hq/. ./
RUN npm run build

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d
ENV NODE_ENV=production
ENV HQ_PORT=8080
ENV HQ_ROOT=/app/show
WORKDIR /app
COPY --from=build /app/dist show
COPY hq/serve.mjs serve.mjs
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=2s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.HQ_PORT + '/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "serve.mjs"]
