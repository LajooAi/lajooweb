import "./admin.css";

export const metadata = {
  title: {
    default: "LAJOO Admin",
    template: "%s | LAJOO Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminBaseLayout({ children }) {
  return children;
}
