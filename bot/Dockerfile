# голова на проводі: образ каталогу бота
#
# Контекст збірки - корінь репозиторію (compose.yaml: context: .), тому
# шляхи тут від кореня. Базовий образ узятий по digest, а не по тегу: тег
# переїжджає, digest - ні (02-build.md, 4.5).
#
# Секрет реєстру приходить аргументом збірки і живе тільки на стадіях
# встановлення: остання стадія починається з чистого FROM, і в готовий
# образ він не потрапляє. У репозиторії його немає зовсім - там лише
# посилання на змінну в .npmrc (02-build.md, 6.5).

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS deps
# значення аргументу видно командам RUN цієї стадії як змінну
# оточення - її й підставляє npm у .npmrc. ENV тут не потрібен:
# він записав би секрет у метадані стадії
ARG ZORIA_NPM_AUTH=
WORKDIR /app
# маніфест і lock окремим шаром: залежності переживають правку джерел.
# Маскою, щоб про відсутній lock сказав npm, а не збирач: lockfile
# обов'язковий (02-build.md, 4.4), і його ім'я має бути в причині
COPY .npmrc ./
COPY bot/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM deps AS build
# аргумент оголошується у кожній стадії, де він потрібен: успадкування немає
ARG ZORIA_NPM_AUTH=
RUN npm ci --no-audit --no-fund
COPY bot/tsconfig.json ./
COPY bot/src src
RUN npm run build

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d
ENV NODE_ENV=production
ENV STATUS_PORT=7811
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/dist dist
# щоденники - сюди; том diaries ініціалізується цим каталогом з його
# власником, інакше голова без root писати в нього не зможе
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 7811
# живість процесу, а не готовність: голова в лобі жива, але не за столом.
# Готовність віддає control-plane на /health
HEALTHCHECK --interval=10s --timeout=2s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.STATUS_PORT + '/state').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# команда запуску - поле zaria.bot з package.json каталогу бота: ступінь
# lang звіряє саме його, і в контейнері зобов'язано йти те саме
CMD ["node", "dist/main.js"]
