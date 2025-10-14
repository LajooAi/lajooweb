import "./globals.css";
import AppLayout from "../components/AppLayout";

export const metadata = {
  title: "Renew Insurance In Minutes With LAJOO",
  description: "Get covered in 2 minutes, fully AI-powered.",
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
