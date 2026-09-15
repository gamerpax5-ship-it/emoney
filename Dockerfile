FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY website ./website
COPY scripts ./scripts
COPY ui ./ui
COPY dist ./dist
COPY android/app/src/main/assets/wtron-parts ./android/app/src/main/assets/wtron-parts
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "node website/assemble-src.mjs && node scripts/prepare-assets.mjs && node scripts/enable-permanent-rewards.mjs && node website/persistent-start.mjs"]
