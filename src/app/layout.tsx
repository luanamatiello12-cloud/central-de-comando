import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { InlineScript } from "@/components/app/inline-script";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Rumo", template: "%s · Rumo" },
  description:
    "Central de comando pessoal: projetos, tarefas, calendário e um agente de IA.",
};

// Aplica o tema e a paleta salvos antes da primeira pintura, para a tela não piscar.
const themeScript = `(function(){try{var e=document.documentElement,t=localStorage.getItem("tema");var d=t==="escuro"||((!t||t==="sistema")&&matchMedia("(prefers-color-scheme: dark)").matches);e.classList.toggle("dark",d);var c=localStorage.getItem("cor");if(c&&/^[a-z]+$/.test(c))e.dataset.cor=c}catch(x){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} ${bricolage.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
