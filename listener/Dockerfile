FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js modbus-poller.js balanceo.js ./

CMD ["node", "index.js"]
