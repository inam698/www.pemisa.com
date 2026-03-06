/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable strict mode for better React practices
  reactStrictMode: true,

  // NOTE: Enable "standalone" output for Docker production deployment
  // output: "standalone",

  // Disable output file tracing (workaround for Node.js 24 + Windows EISDIR bug)
  outputFileTracingExcludes: {
    "*": ["**/*"],
  },

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
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
