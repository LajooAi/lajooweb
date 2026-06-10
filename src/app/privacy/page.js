import { redirect } from "next/navigation";

export default function LegacyPrivacyPage() {
  redirect("/my/terms#privacy");
}
