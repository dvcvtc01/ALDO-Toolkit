FROM node:20-bookworm-slim AS build

WORKDIR /workspace

COPY package.json tsconfig.base.json tsconfig.json eslint.config.mjs .prettierrc.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install

COPY . .
RUN npm run openapi:generate -w apps/api && npm run openapi:types -w apps/web
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /workspace
COPY --from=build /workspace /workspace

CMD ["npm", "run", "start", "-w", "apps/api"]
