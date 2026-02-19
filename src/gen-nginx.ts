#!/usr/bin/env bun
import { loadConfig } from "./config";
import { stringify as yamlStringify } from "yaml";

const configPath = process.argv[2] || undefined;
const config = loadConfig(configPath);

const serverBlocks = config.sites
  .filter((site) => site.hostname)
  .map((site) => `
    server {
        listen 8080;
        server_name ${site.hostname};

        root /usr/share/nginx/html;
        index index.html;

        location = /${site.subpath} {
            return 302 /${site.subpath}/;
        }

        location /${site.subpath}/ {
            try_files $uri $uri/ $uri/index.html =404;
        }

        location / {
            return 404;
        }
    }`);

const defaultServer = `
    server {
        listen 8080 default_server;
        return 404;
    }`;

const nginxConf = `pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    sendfile on;
    tcp_nopush on;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
${serverBlocks.join("\n")}
${defaultServer}
}
`;

const configMap = {
  apiVersion: "v1",
  kind: "ConfigMap",
  metadata: {
    name: "twssg-nginx",
    namespace: "websites",
  },
  data: {
    "nginx.conf": nginxConf,
  },
};

console.log(yamlStringify(configMap));
