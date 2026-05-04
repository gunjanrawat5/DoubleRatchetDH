import { redirect } from "next/navigation";
import SignupForm from "@/components/auth/SignupForm";
import { createClient } from "@/lib/supabase/server";

type SignupPageProps = {
  searchParams: Promise<{
    message?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const supabase = await createClient();
  const [{ data }, params] = await Promise.all([supabase.auth.getUser(), searchParams]);

  if (data.user) {
    redirect("/chat");
  }

  return <SignupForm message={params.message} />;
}
