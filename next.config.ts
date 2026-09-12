import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Origen del proyecto Supabase: el navegador le habla directo (auth + REST). */
function supabaseOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
}

/**
 * CSP sin nonces (la variante que Next.js documenta para apps que no tienen
 * infraestructura de nonces): 'unsafe-inline' en script/style es necesario
 * porque el framework inyecta scripts/estilos inline en cada render y este
 * proyecto usa `style={{...}}` en toda la UI. Aun así cierra lo importante:
 * nada de fuentes externas de script, ni objetos, ni que el panel se pueda
 * meter en un iframe ajeno (clickjacking sobre acciones como anular una
 * factura o trasladar fondos).
 */
function buildCsp(): string {
  const supa = supabaseOrigin();
  const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    font-src 'self';
    connect-src 'self'${supa ? ` ${supa}` : ""};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `;
  return csp.replace(/\s{2,}/g, " ").trim();
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: buildCsp() },
  // Redundante con frame-ancestors para navegadores viejos que no leen CSP.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Sin efecto sobre HTTP en local (el navegador sólo honra HSTS recibido
  // por HTTPS); entra en juego cuando el sitio corre en Vercel.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
