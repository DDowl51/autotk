FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm install tsx --no-save
COPY . .
ENV PORT=4100
EXPOSE 4100
CMD ["npx", "tsx", "src/main.ts"]
