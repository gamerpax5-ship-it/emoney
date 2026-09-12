FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY website ./website
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
