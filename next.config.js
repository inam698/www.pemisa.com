/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable strict mode for better React practices
  reactStrictMode: true,

  // NOTE: Enable "standalone" output for Docker production deployment
  // output: "standalone",

  // TypeScript and ESLint checking during builds
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  // Server external packages (Node.js native modules that shouldn't be bundled)
  serverExternalPackages: [
    "@prisma/client",
    "bcryptjs",
    "nodemailer",
    "node-cron",
    "pdfkit",
    "speakeasy",
    "qrcode",
    "winston",
  ],

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://*.firebaseio.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.googleapis.com https://*.googleusercontent.com",
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com wss://*.firebaseio.com",
              "frame-src 'self' https://*.firebaseapp.com https://*.firebaseio.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
