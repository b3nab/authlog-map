FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

# RUN \
#   apt-get update \
#   && apt-get -y install gettext-base \
#   && apt-get clean \
#   && rm -rf /var/lib/apt/lists/*
RUN apk add --virtual build_deps gettext

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build


FROM base AS runner
# WORKDIR /app
ARG WS_URL
ENV WS_URL=${WS_URL}

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

RUN printenv

RUN envsubst < /app/index.html > /app/index.html.new
RUN mv /app/index.html /app/index.html.bkp
RUN mv /app/index.html.new /app/index.html

# USER dashboard
# EXPOSE 8000

# CMD [ "pnpm", "start" ]
CMD ["node", "/app/dist/index.js"]

# FROM nginx:alpine

# ARG WS_URL

# COPY ./nginx.conf /etc/nginx/conf.d/default.conf
# COPY --from=build /app/dist /var/www/html/

# RUN printenv

# RUN envsubst < /var/www/html/index.html > /var/www/html/index.html.new
# RUN mv /var/www/html/index.html /var/www/html/index.html.bkp
# RUN mv /var/www/html/index.html.new /var/www/html/index.html

# EXPOSE 3000

# ENTRYPOINT ["nginx","-g","daemon off;"]