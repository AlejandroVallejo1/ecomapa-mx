import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoMapa MX - Mapa Ambiental de México",
  description:
    "Plataforma de monitoreo ambiental que unifica datos de calidad del aire, agua, reciclaje, emisiones industriales y denuncias ambientales en México.",
  keywords: [
    "medio ambiente",
    "contaminación",
    "México",
    "calidad del aire",
    "ríos contaminados",
    "reciclaje",
    "RETC",
    "SEMARNAT",
    "CONAGUA",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased bg-gray-100">{children}</body>
    </html>
  );
}
