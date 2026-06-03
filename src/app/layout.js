import "./globals.css";
import AppLayout from "../components/AppLayout";

export const metadata = {
  title: "Renew Insurance In Minutes With LAJOO",
  description: "Get covered in 2 minutes, fully AI-powered.",
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
