import type { NextConfig } from "next";

// Aplicativo autenticado: todas as telas dependem do usuário logado, então
// não usamos pré-renderização parcial (cacheComponents). Ver docs do Next:
// guides/caching-without-cache-components.
const nextConfig: NextConfig = {
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
