# Imagen base de Node.js
FROM node:18

# Instalar dependencias necesarias del sistema
RUN apt-get update && apt-get install -y \
  libaio1 \
  unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

COPY oracle_instantclient/instantclient_23_6 /oracle_instantclient/instantclient_23_6

ENV LD_LIBRARY_PATH=/oracle_instantclient/instantclient_23_6
ENV PATH=/oracle_instantclient/instantclient_23_6:$PATH
ENV OCI_LIB_DIR=/oracle_instantclient/instantclient_23_6
ENV OCI_INC_DIR=/oracle_instantclient/instantclient_23_6/sdk/include

EXPOSE 3000

CMD ["node", "index.js"]
