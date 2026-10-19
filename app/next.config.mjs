/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // static HTML/JS that Capacitor packages into the APK
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
