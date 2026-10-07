# службові ручки: образ площини керування
#
# Залежностей у заготовки немає, тому немає і npm у збірці: образ - це
# база за digest плюс два файли. З'являться залежності - додайте сюди
# `COPY control-plane/package*.json ./` і `RUN npm ci --omit=dev`.

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7801
WORKDIR /app
COPY control-plane/package.json ./
COPY control-plane/src src
USER node
EXPOSE 7801
# живість процесу, а не готовність бота: рестартувати контейнер за "ще не
# за столом" не можна
HEALTHCHECK --interval=10s --timeout=2s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/livez').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "src/main.mjs"]
