import type { NextConfig } from "next";
import os from "node:os";

// Endereços desta máquina na rede local. Só importam no modo `npm run dev:rede`,
// que abre o servidor de desenvolvimento para o Wi-Fi (teste no celular).
// O `npm run dev` normal escuta apenas em 127.0.0.1 e não é alcançável pela rede.
const enderecosLocais = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

// Aplicativo autenticado: todas as telas dependem do usuário logado, então
// não usamos pré-renderização parcial (cacheComponents). Ver docs do Next:
// guides/caching-without-cache-components.
const nextConfig: NextConfig = {
  // Banco embutido do modo local (WASM): carregado pelo Node, não empacotado.
  serverExternalPackages: ["@electric-sql/pglite"],
  allowedDevOrigins: enderecosLocais,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
