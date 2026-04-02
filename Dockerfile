FROM node:20-alpine3.22 AS builder

RUN apk update && apk upgrade --available && rm -rf /var/cache/apk/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine3.22 AS runner

RUN apk update && apk upgrade --available && rm -rf /var/cache/apk/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/build ./build

RUN addgroup -S appgroup \
 && adduser -S appuser -G appgroup \
 && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "build"]