FROM denoland/deno:latest

WORKDIR /app

COPY . .

RUN deno cache --import-map=import_map.json index.js

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--import-map=import_map.json", "index.js"]