FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app


FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build


FROM base AS runner
# WORKDIR /app

# RUN addgroup --system --gid 1001 nodejs
# RUN adduser --system --uid 1001 dashboard

# COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
# COPY --from=builder /app/dist /app/dist
# COPY --from=builder /app/node_modules /app/node_modules
# COPY --from=builder /app/package.json /app/package.json
# COPY --from=builder --chown=dashboard:nodejs /app/dist /app/dist
# COPY --from=builder --chown=dashboard:nodejs /app/node_modules /app/node_modules
# # COPY --from=builder --chown=dashboard:nodejs /app/package.json /app/package.json

# USER dashboard
EXPOSE 8000

# CMD [ "pnpm", "start" ]
CMD ["node", "/app/dist/index.js"]
