/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Dev & prod safety net: redirect bare "/" to /my
      { source: '/', destination: '/my', permanent: false },
    ];
  },
};
export default nextConfig;
